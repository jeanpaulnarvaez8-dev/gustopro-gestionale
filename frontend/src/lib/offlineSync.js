// Background sync della queue offline.
//
// Trigger:
//   - Avvio app (main.jsx mount → 1 tentativo dopo 2s)
//   - Evento `online` del browser
//   - Polling fallback ogni 30s
//
// Per ogni azione pending:
//   - markSyncing
//   - fetch(endpoint, { method, body, headers: { Authorization, Idempotency-Key } })
//     NB: usa fetch direttamente, NON l'axios `api` (che ri-enqueuerebbe).
//   - status 200-299 → markDone (rimossa)
//   - status 401/403 → markFailed permanent (token scaduto / tenant inattivo)
//   - status 4xx (400/404/409/422) → markFailed permanent (validation error,
//     non utile ritentare)
//   - status 5xx o network error → riporta a pending, retry al prossimo round
//
// Idempotency: ogni request usa la stessa Idempotency-Key del record. Il
// backend (middleware/idempotency.js + tabella idempotency_keys) garantisce
// che 2 retry con stessa key non creino duplicati.

import {
  peekPending,
  markSyncing,
  markDone,
  markFailed,
  countPending,
  STATUS,
} from './offlineDB'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

let syncInProgress = false
let pollInterval = null

function isPermanentClientError(status) {
  // 4xx ma NON 408/425/429 (timeout/too-early/too-many) che hanno senso retry
  return status >= 400 && status < 500 && ![408, 425, 429].includes(status)
}

async function syncOne(action) {
  const url = API_BASE + action.endpoint
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': action.idempotencyKey,
  }
  if (action.authToken) {
    headers['Authorization'] = `Bearer ${action.authToken}`
  }

  let response
  try {
    response = await fetch(url, {
      method: action.method,
      headers,
      body: action.body ? JSON.stringify(action.body) : undefined,
    })
  } catch (netErr) {
    // Network error: retry next round
    await markFailed(action.id, netErr, { permanent: false })
    return { id: action.id, outcome: 'retry', reason: netErr.message }
  }

  if (response.ok) {
    await markDone(action.id)
    return { id: action.id, outcome: 'done', status: response.status }
  }

  if (isPermanentClientError(response.status)) {
    let bodyText = ''
    try { bodyText = await response.text() } catch {}
    await markFailed(action.id, `HTTP ${response.status}: ${bodyText.slice(0, 200)}`, { permanent: true })
    return { id: action.id, outcome: 'permanent-fail', status: response.status }
  }

  // 5xx o altri retriable
  await markFailed(action.id, `HTTP ${response.status}`, { permanent: false })
  return { id: action.id, outcome: 'retry', status: response.status }
}

export async function syncPendingActions({ silent = true } = {}) {
  if (syncInProgress) return { skipped: 'in-progress' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { skipped: 'offline' }
  }

  syncInProgress = true
  try {
    const pending = await peekPending(20)
    if (pending.length === 0) return { synced: 0, failed: 0, retry: 0 }

    if (!silent) console.info(`[offlineSync] flushing ${pending.length} action(s)`)

    let synced = 0, failed = 0, retry = 0
    for (const action of pending) {
      await markSyncing(action.id)
      const result = await syncOne(action)
      if (result.outcome === 'done') synced++
      else if (result.outcome === 'permanent-fail') failed++
      else retry++
    }
    if (!silent) console.info(`[offlineSync] done: ${synced} synced, ${failed} failed, ${retry} retry`)
    return { synced, failed, retry, remaining: await countPending() }
  } finally {
    syncInProgress = false
  }
}

export function startBackgroundSync() {
  if (typeof window === 'undefined') return

  // Tentativo iniziale dopo 2s (lascia caricare auth/UI)
  setTimeout(() => syncPendingActions({ silent: true }), 2000)

  // Trigger sull'evento online del browser
  window.addEventListener('online', () => {
    console.info('[offlineSync] navigator.online → flushing queue')
    syncPendingActions({ silent: false })
  })

  // Polling fallback ogni 30s (alcuni network error non triggerano l'evento online)
  if (!pollInterval) {
    pollInterval = setInterval(() => syncPendingActions({ silent: true }), 30000)
  }
}

export function stopBackgroundSync() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}
