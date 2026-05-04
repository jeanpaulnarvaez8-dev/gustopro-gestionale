// Offline queue (IndexedDB via Dexie).
//
// Quando il backend non è raggiungibile (errore di rete, 503, ecc.),
// le mutazioni dei controller offline-aware (orders create/add) vengono
// scritte qui invece che inviate al server. Un flush job (mini-step D)
// le pesca quando torna la rete e le invia, marcando ognuna come
// completed/failed.
//
// Idempotency: ogni azione ha un UUID v4 client-generated (idempotencyKey).
// Il backend (mini-step E) deve REJECT i duplicati con stessa key, così
// se il client riesce a sincronizzare due volte (es. browser reload mentre
// la sync è in corso) non creiamo duplicati.

import Dexie from 'dexie'

export const STATUS = Object.freeze({
  PENDING: 'pending',   // mai tentata
  SYNCING: 'syncing',   // tentativo in corso
  FAILED:  'failed',    // ha fallito (4xx server-side, errore non recuperabile)
  DONE:    'done',      // synced — il flush la rimuove dopo
})

class GustoProOfflineDB extends Dexie {
  constructor() {
    super('gustopro_offline')
    this.version(1).stores({
      // Indici: id auto, idempotencyKey unique, status per filter, createdAt per ordine FIFO
      pendingActions: '++id, &idempotencyKey, status, createdAt, kind, tenantId',
    })
  }
}

export const db = new GustoProOfflineDB()

// UUID v4 generator — usa crypto.randomUUID se disponibile, fallback manuale
export function uuidv4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Enqueue a mutation.
 * @param {object} action
 * @param {string} action.kind            es. 'order:create', 'order:add-items'
 * @param {string} action.method          es. 'POST', 'PUT', 'PATCH', 'DELETE'
 * @param {string} action.endpoint        path completo es. '/orders'
 * @param {object} [action.body]          payload JSON
 * @param {string} [action.tenantId]      tenant_id corrente
 * @param {string} [action.authToken]     JWT corrente (snapshot al momento dell'azione)
 * @returns {Promise<{id, idempotencyKey}>}
 */
export async function enqueueAction(action) {
  // Riusa idempotencyKey se passato (caso interceptor → mantiene quella
  // già inviata via header), altrimenti generane una nuova.
  const idempotencyKey = action.idempotencyKey || uuidv4()
  const id = await db.pendingActions.add({
    kind: action.kind,
    method: action.method,
    endpoint: action.endpoint,
    body: action.body ?? null,
    idempotencyKey,
    tenantId: action.tenantId ?? null,
    authToken: action.authToken ?? null,
    status: STATUS.PENDING,
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  return { id, idempotencyKey }
}

/** Lista azioni pending in ordine FIFO (FIFO = createdAt ASC) */
export async function peekPending(limit = 50) {
  return db.pendingActions
    .where('status').equals(STATUS.PENDING)
    .limit(limit)
    .sortBy('createdAt')
}

/** Conta azioni in attesa di sync (per badge UI) */
export async function countPending() {
  return db.pendingActions.where('status').equals(STATUS.PENDING).count()
}

/** Marca un'azione come syncing (atomica) */
export async function markSyncing(id) {
  await db.pendingActions.update(id, {
    status: STATUS.SYNCING,
    updatedAt: new Date().toISOString(),
  })
}

/** Sync OK: la rimuoviamo subito (potremmo tenerla 'done' per debug ma è rumore) */
export async function markDone(id) {
  await db.pendingActions.delete(id)
}

/** Sync fallita: increment attempts, salva errore, riporta a pending o failed se troppi tentativi */
export async function markFailed(id, error, { permanent = false } = {}) {
  const action = await db.pendingActions.get(id)
  if (!action) return
  const attempts = (action.attempts ?? 0) + 1
  await db.pendingActions.update(id, {
    status: permanent || attempts >= 5 ? STATUS.FAILED : STATUS.PENDING,
    attempts,
    lastError: String(error?.message || error || 'unknown'),
    updatedAt: new Date().toISOString(),
  })
}

/** Wipe completo della queue — usato in test o "clear" admin */
export async function clearQueue() {
  await db.pendingActions.clear()
}

/** Lista azioni FAILED (non più ritentate automaticamente — admin deve risolvere) */
export async function listFailed() {
  return db.pendingActions.where('status').equals(STATUS.FAILED).toArray()
}

// ─── Debug helper opt-in ────────────────────────────────────
// Espone le funzioni su window solo se l'utente ha esplicitamente
// settato `localStorage.gustopro_dev_mode = '1'`. Senza questo flag
// non c'e' superficie di attacco per estrazione dati o avvelenamento
// della coda da parte di terzi.
if (typeof window !== 'undefined') {
  if (localStorage.getItem('gustopro_dev_mode') === '1') {
    window.gustoOfflineDebug = {
      db, STATUS, uuidv4,
      enqueueAction, peekPending, countPending,
      markSyncing, markDone, markFailed,
      clearQueue, listFailed,
    }
    console.info('[gustoOfflineDebug] esposto su window. Funzioni:',
      Object.keys(window.gustoOfflineDebug))
  }
}
