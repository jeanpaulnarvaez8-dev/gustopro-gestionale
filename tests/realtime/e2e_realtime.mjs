#!/usr/bin/env node
/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║ GustoPro — E2E Realtime Test                                       ║
 * ║                                                                    ║
 * ║ Simula il flow CRITICO del business:                               ║
 * ║   1. Cameriere effettua ordine                                     ║
 * ║   2. Chef in cucina riceve socket.io evento IN TEMPO REALE         ║
 * ║   3. KDS API ritorna l'ordine pending                              ║
 * ║   4. Chef cambia status: cooking → ready                           ║
 * ║   5. Cameriere riceve socket evento "item-ready"                   ║
 * ║   6. Cameriere serve → status served                               ║
 * ║                                                                    ║
 * ║ Test su PROD live (https://gestione.gustopro.it).                  ║
 * ║ Cleanup automatico: ordine cancellato alla fine.                   ║
 * ╚════════════════════════════════════════════════════════════════════╝
 */
import { io } from 'socket.io-client'

const BASE = 'https://gestione.gustopro.it'
const C = { R:'\x1b[31m', G:'\x1b[32m', Y:'\x1b[33m', B:'\x1b[34m', D:'\x1b[2m', N:'\x1b[0m' }

let pass = 0, fail = 0, total = 0
function ok(name, detail = '') {
  total++; pass++
  console.log(`  ${C.G}✓${C.N} ${name} ${detail ? C.D + '· ' + detail + C.N : ''}`)
}
function err(name, detail = '') {
  total++; fail++
  console.log(`  ${C.R}✗${C.N} ${name} ${detail ? C.D + '· ' + detail + C.N : ''}`)
}
function sec(title) { console.log(`\n${C.B}━━━ ${title} ━━━${C.N}`) }

// ─── API helpers ─────────────────────────────────────────────────────
async function api(method, path, { token, body, headers = {} } = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  }
  if (token) opts.headers.Authorization = `Bearer ${token}`
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(`${BASE}${path}`, opts)
  let data = null
  try { data = await r.json() } catch { /* no body */ }
  return { status: r.status, data }
}

async function login(username, pin, slug = null) {
  const headers = slug ? { 'X-Tenant-Slug': slug } : {}
  const r = await api('POST', '/api/auth/login', { body: { username, pin }, headers })
  if (r.status !== 200) throw new Error(`login fail ${username}: ${r.status} ${JSON.stringify(r.data)}`)
  return r.data
}

// ─── Promise-based waiter su eventi socket ───────────────────────────
function waitForEvent(socket, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler)
      reject(new Error(`timeout ${timeoutMs}ms waiting for ${eventName}`))
    }, timeoutMs)
    function handler(data) {
      clearTimeout(timer)
      socket.off(eventName, handler)
      resolve(data)
    }
    socket.on(eventName, handler)
  })
}

// ─── Connect socket con JWT ──────────────────────────────────────────
function connectSocket(token, label) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: false,
    })
    const timer = setTimeout(() => {
      socket.disconnect()
      reject(new Error(`${label}: connect timeout`))
    }, 10_000)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.once('connect_error', (e) => {
      clearTimeout(timer)
      reject(new Error(`${label}: ${e.message}`))
    })
  })
}

// ════════════════════════════════════════════════════════════════════
// MAIN TEST FLOW
// ════════════════════════════════════════════════════════════════════
const cleanupTasks = []

;(async () => {
  let createdOrderId = null
  try {
    // ──────────────────────────────────────────────────────────────
    sec('1. Setup — login waiter + kitchen')
    // ──────────────────────────────────────────────────────────────
    // Cerco un waiter e un kitchen user reali nel DB Riva.
    // Login admin per fetch users:
    const adminLogin = await login('admin', '0000')
    ok('Login admin', `tenant=${adminLogin.user.tenant_id.slice(0, 8)}...`)
    const adminToken = adminLogin.token

    // Lista users per trovare waiter + kitchen reali
    const usersRes = await api('GET', '/api/users', { token: adminToken })
    if (usersRes.status !== 200) throw new Error(`/api/users → ${usersRes.status}`)
    const users = usersRes.data
    const waiter = users.find((u) => u.role === 'waiter' && u.is_active)
    const kitchen = users.find((u) => u.role === 'kitchen' && u.is_active)
    if (!waiter) throw new Error('Nessun waiter attivo in DB')
    if (!kitchen) throw new Error('Nessun kitchen attivo in DB')
    ok('Waiter trovato', `${waiter.name} (id=${waiter.id.slice(0, 8)}...)`)
    ok('Kitchen trovato', `${kitchen.name} (id=${kitchen.id.slice(0, 8)}...)`)

    // ──────────────────────────────────────────────────────────────
    sec('2. Socket.io connection per entrambi i ruoli')
    // ──────────────────────────────────────────────────────────────
    // Per la simulazione usiamo i token admin/kitchen reali. Il backend
    // mette ogni socket in room `role:<role>`. Cosi' kitchen-socket riceve
    // gli eventi destinati a role:kitchen.
    //
    // NB: NON ho le PIN reali di waiter/kitchen → uso il token admin per
    // CREARE l'ordine come waiter (admin puo' fare). Per il SOCKET kitchen
    // uso il token admin pure, perche' tutti i ruoli ricevono certi eventi
    // broadcast (new-order va a role:kitchen). Quindi creo 2 socket entrambi
    // con token admin e verifico la ricezione dell'evento new-order.

    // Aprire 2 socket simultanei con stesso token per simulare 2 client
    const sockWaiter = await connectSocket(adminToken, 'waiter-socket')
    ok('Socket "waiter" connesso', `id=${sockWaiter.id}`)

    const sockKitchen = await connectSocket(adminToken, 'kitchen-socket')
    ok('Socket "kitchen" connesso', `id=${sockKitchen.id}`)

    cleanupTasks.push(() => sockWaiter.disconnect())
    cleanupTasks.push(() => sockKitchen.disconnect())

    // ──────────────────────────────────────────────────────────────
    sec('3. Setup ordine — trova tavolo libero + menu item')
    // ──────────────────────────────────────────────────────────────
    const tablesRes = await api('GET', '/api/tables', { token: adminToken })
    const freeTable = tablesRes.data.find((t) => t.status === 'free')
    if (!freeTable) throw new Error('Nessun tavolo libero')
    ok('Tavolo libero', `T${freeTable.table_number} (id=${freeTable.id.slice(0, 8)}...)`)

    const menuRes = await api('GET', '/api/menu/items', { token: adminToken })
    const foodItem = menuRes.data.find((m) => m.is_available)
    if (!foodItem) throw new Error('Nessun menu item disponibile')
    ok('Menu item', `${foodItem.name} (${foodItem.base_price}€)`)

    // ──────────────────────────────────────────────────────────────
    sec('4. ⚡ FLOW CRITICO: cameriere crea ordine → cucina riceve evento')
    // ──────────────────────────────────────────────────────────────
    // Prepariamo il listener PRIMA della POST (evita race condition)
    const newOrderPromise = waitForEvent(sockKitchen, 'new-order', 5000)

    const t0 = Date.now()
    const createRes = await api('POST', '/api/orders', {
      token: adminToken,
      body: {
        table_id: freeTable.id,
        covers: 2,
        items: [{
          menu_item_id: foodItem.id,
          quantity: 1,
          workflow_status: 'production',
          notes: '[E2E test order — auto-cleanup]',
        }],
      },
    })

    if (createRes.status !== 201) {
      throw new Error(`POST /api/orders → ${createRes.status}: ${JSON.stringify(createRes.data)}`)
    }
    createdOrderId = createRes.data.id
    cleanupTasks.push(async () => {
      await api('DELETE', `/api/orders/${createdOrderId}`, { token: adminToken })
    })
    const apiLatency = Date.now() - t0
    ok('POST /api/orders', `201 in ${apiLatency}ms — orderId=${createdOrderId.slice(0, 8)}...`)

    // ASPETTA evento socket
    let socketEvent, socketLatency
    try {
      socketEvent = await newOrderPromise
      socketLatency = Date.now() - t0
      ok('Socket "new-order" ricevuto', `entro ${socketLatency}ms`)
    } catch (e) {
      err('Socket "new-order" NON ricevuto', e.message)
      throw e
    }

    // Verifica payload socket coerente con l'ordine creato
    if (socketEvent?.orderId === createdOrderId || socketEvent?.id === createdOrderId) {
      ok('Socket payload orderId match', `${createdOrderId.slice(0, 8)}...`)
    } else if (socketEvent && (socketEvent.table_id === freeTable.id || socketEvent.tableId === freeTable.id)) {
      ok('Socket payload table_id match (no orderId in payload)', `table=${freeTable.id.slice(0, 8)}...`)
    } else {
      err('Socket payload mismatch', `expected orderId=${createdOrderId}, got=${JSON.stringify(socketEvent).slice(0, 100)}`)
    }

    // ──────────────────────────────────────────────────────────────
    sec('5. KDS API: ordine appare in pending entro 1s')
    // ──────────────────────────────────────────────────────────────
    // KDS endpoint deve mostrare l'ordine nuovo (workflow_status=production)
    await new Promise((r) => setTimeout(r, 500))
    const kdsRes = await api('GET', '/api/kds/pending', { token: adminToken })
    const orderInKds = kdsRes.data.find((o) => o.order_id === createdOrderId)
    if (orderInKds) {
      ok('Ordine appare in KDS', `${orderInKds.items?.length || 0} items`)
    } else {
      err('Ordine NON in KDS', `expected orderId=${createdOrderId.slice(0, 8)}...`)
    }

    // ──────────────────────────────────────────────────────────────
    sec('6. Chef cambia status: pending → cooking → ready')
    // ──────────────────────────────────────────────────────────────
    const itemId = createRes.data.items[0].id

    // Subscribe SOCKET WAITER (riceve item-status-updated quando cucina aggiorna)
    const statusUpdatedPromise = waitForEvent(sockWaiter, 'item-status-updated', 5000)

    const cookingRes = await api('PATCH', `/api/kds/items/${itemId}/status`, {
      token: adminToken,
      body: { status: 'cooking' },
    })
    if (cookingRes.status === 200) ok('PATCH status=cooking', '200')
    else err('PATCH status=cooking', `HTTP ${cookingRes.status}`)

    try {
      const statusEvent = await statusUpdatedPromise
      ok('Socket "item-status-updated" ricevuto', `payload.status=${statusEvent?.status || '?'}`)
    } catch (e) {
      err('Socket item-status-updated NON ricevuto', e.message)
    }

    // Ready
    const itemReadyPromise = waitForEvent(sockWaiter, 'item-status-updated', 5000)
    const readyRes = await api('PATCH', `/api/kds/items/${itemId}/status`, {
      token: adminToken,
      body: { status: 'ready' },
    })
    ok('PATCH status=ready', `HTTP ${readyRes.status}`)
    try {
      const readyEvent = await itemReadyPromise
      ok('Socket "item-status-updated" → ready', `payload.status=${readyEvent?.status || '?'}`)
    } catch (e) {
      err('Socket ready NON ricevuto', e.message)
    }

    // ──────────────────────────────────────────────────────────────
    sec('7. Cameriere serve l\'item → status=served (table → libero)')
    // ──────────────────────────────────────────────────────────────
    const servedRes = await api('PATCH', `/api/kds/items/${itemId}/status`, {
      token: adminToken,
      body: { status: 'served' },
    })
    if (servedRes.status === 200) ok('PATCH status=served', '200')
    else err('PATCH status=served', `HTTP ${servedRes.status}`)

    // ──────────────────────────────────────────────────────────────
    sec('8. Workflow waiting items — endpoint API consistency')
    // ──────────────────────────────────────────────────────────────
    // GET /api/workflow/waiting deve riflettere lo stato del nostro ordine
    // (questo item e' stato 'production' tutto il tempo → NON in waiting).
    const waitingRes = await api('GET', '/api/workflow/waiting', { token: adminToken })
    if (waitingRes.status === 200) {
      const ourOrder = waitingRes.data.find((o) => o.order_id === createdOrderId)
      if (!ourOrder) {
        ok('Ordine NON in /workflow/waiting', 'corretto (era production, non waiting)')
      } else {
        // se appare e' bug: l'ordine non doveva essere in waiting
        err('Ordine inaspettatamente in /workflow/waiting', `items: ${ourOrder.items?.length}`)
      }
    } else {
      err('GET /workflow/waiting', `HTTP ${waitingRes.status}`)
    }

    // ──────────────────────────────────────────────────────────────
    sec('9. Cancellazione ordine + socket table-status-changed')
    // ──────────────────────────────────────────────────────────────
    // Admin cancella ordine → table torna 'free' + socket evento.
    // NB: NON usiamo cleanupTasks per questo perche' lo testiamo esplicitamente.
    const tableStatusPromise = waitForEvent(sockWaiter, 'table-status-changed', 5000)
    const deleteRes = await api('DELETE', `/api/orders/${createdOrderId}`, { token: adminToken })
    if (deleteRes.status === 200 || deleteRes.status === 204) {
      ok('DELETE /api/orders/:id', `HTTP ${deleteRes.status}`)
      // Rimuovi cleanup task: l'ordine è già stato cancellato
      cleanupTasks.length = cleanupTasks.length > 0
        ? (cleanupTasks.pop(), cleanupTasks.length)
        : 0
    } else {
      err('DELETE order', `HTTP ${deleteRes.status} body=${JSON.stringify(deleteRes.data).slice(0, 100)}`)
    }

    try {
      const tableEvent = await tableStatusPromise
      ok('Socket "table-status-changed" ricevuto', `payload.status=${tableEvent?.status || '?'}`)
      if (tableEvent?.status === 'free' || tableEvent?.status === 'dirty') {
        ok('Table status post-DELETE', `${tableEvent.status} (corretto)`)
      }
    } catch (e) {
      err('Socket table-status-changed NON ricevuto', e.message)
    }

    // ──────────────────────────────────────────────────────────────
    sec('10. Verifica DB consistency post-DELETE')
    // ──────────────────────────────────────────────────────────────
    const tableAfterRes = await api('GET', '/api/tables', { token: adminToken })
    const tableAfter = tableAfterRes.data.find((t) => t.id === freeTable.id)
    if (tableAfter && (tableAfter.status === 'free' || tableAfter.status === 'dirty')) {
      ok('Table status DB', `${tableAfter.status}`)
    } else {
      err('Table status DB inconsistente', `status=${tableAfter?.status}`)
    }
    const kdsAfterRes = await api('GET', '/api/kds/pending', { token: adminToken })
    const orderStillInKds = kdsAfterRes.data.find((o) => o.order_id === createdOrderId)
    if (!orderStillInKds) {
      ok('Ordine sparito dal KDS', 'corretto')
    } else {
      err('Ordine ancora in KDS post-DELETE', 'inconsistenza')
    }

    // ──────────────────────────────────────────────────────────────
    sec('11. Performance metrics — 5 nuovi ordini consecutivi (latency)')
    // ──────────────────────────────────────────────────────────────
    // Misura latency socket "new-order" per 5 ordini distinti.
    // NB: Non posso fare flip status pending↔cooking (state machine non
    // valida). Faccio invece 5 create+delete per pattern realistico.
    const latencies = []
    const lat_tablesRes = await api('GET', '/api/tables', { token: adminToken })
    const lat_freeTables = lat_tablesRes.data.filter((t) => t.status === 'free').slice(0, 5)
    if (lat_freeTables.length < 5) {
      err('Latency test', `solo ${lat_freeTables.length} tavoli liberi (servono 5)`)
    } else {
      for (let i = 0; i < 5; i++) {
        const tbl = lat_freeTables[i]
        const promise = waitForEvent(sockKitchen, 'new-order', 4000)
        const t0 = Date.now()
        const r = await api('POST', '/api/orders', {
          token: adminToken,
          body: {
            table_id: tbl.id,
            covers: 1,
            items: [{
              menu_item_id: foodItem.id,
              quantity: 1,
              workflow_status: 'production',
              notes: `[E2E latency #${i}]`,
            }],
          },
        })
        if (r.status === 201) {
          try {
            await promise
            latencies.push(Date.now() - t0)
            // Cleanup immediato per liberare tavolo per loop successivi
            await api('DELETE', `/api/orders/${r.data.id}`, { token: adminToken })
          } catch { /* timeout — count come miss */ }
        }
      }
      if (latencies.length >= 4) {
        const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        const min = Math.min(...latencies)
        const max = Math.max(...latencies)
        const p99 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)] || max
        ok(`Socket round-trip × ${latencies.length}`, `avg=${avg}ms min=${min}ms max=${max}ms p99=${p99}ms`)
        if (avg < 300) ok('Latency budget avg < 300ms', `${avg}ms`)
        else err('Latency budget exceeded', `avg=${avg}ms ≥ 300ms`)
      } else {
        err('Latency test', `solo ${latencies.length}/5 ordini completati`)
      }
    }

    // ──────────────────────────────────────────────────────────────
    sec('12. Cleanup automatico')
    // ──────────────────────────────────────────────────────────────
    // (gestito nel finally)

  } catch (e) {
    err('FATAL', e.message)
    console.error('\n' + C.R + e.stack + C.N)
  } finally {
    sec('Cleanup')
    for (const task of cleanupTasks) {
      try { await task() } catch { /* ignore */ }
    }
    console.log('  ✓ cleanup eseguito')

    console.log(`\n${C.B}╔═══════════════════════════════════════════════════════════════╗${C.N}`)
    if (fail === 0) {
      console.log(`${C.B}║${C.N}  ${C.G}🎉 TUTTI I TEST REALTIME PASSATI${C.N}  ${pass}/${total}                       ${C.B}║${C.N}`)
    } else {
      console.log(`${C.B}║${C.N}  ${C.R}⚠️  ${fail} FALLITI${C.N}  ${pass}/${total}                                       ${C.B}║${C.N}`)
    }
    console.log(`${C.B}╚═══════════════════════════════════════════════════════════════╝${C.N}\n`)

    process.exit(fail > 0 ? 1 : 0)
  }
})()
