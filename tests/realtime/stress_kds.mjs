#!/usr/bin/env node
/**
 * Stress test KDS: 10 ordini × 3-5 items ciascuno con socket monitor.
 * Verifica che la cucina riceva TUTTI gli eventi new-order in tempo reale,
 * + che l'API /kds/pending mostri tutti gli items aggregati correttamente.
 *
 * Cleanup automatico alla fine: cancellazione di tutti gli ordini creati.
 */
import { io } from 'socket.io-client'

const BASE = 'https://gestione.gustopro.it'
const N_ORDERS = 10
const C = { R:'\x1b[31m', G:'\x1b[32m', Y:'\x1b[33m', B:'\x1b[34m', D:'\x1b[2m', N:'\x1b[0m' }

async function api(method, path, { token, body, headers = {} } = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } }
  if (token) opts.headers.Authorization = `Bearer ${token}`
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(`${BASE}${path}`, opts)
  let data = null
  try { data = await r.json() } catch { /* */ }
  return { status: r.status, data }
}

function sec(t) { console.log(`\n${C.B}━━━ ${t} ━━━${C.N}`) }
function ok(m, d = '') { console.log(`  ${C.G}✓${C.N} ${m} ${d ? C.D + '· ' + d + C.N : ''}`) }
function fail(m, d = '') { console.log(`  ${C.R}✗${C.N} ${m} ${d ? C.D + '· ' + d + C.N : ''}`) }
function info(m) { console.log(`  ${C.Y}·${C.N} ${m}`) }

const createdOrderIds = []

async function login() {
  const r = await api('POST', '/api/auth/login', { body: { username: 'admin', pin: '0000' } })
  if (r.status !== 200) throw new Error(`login fail: ${r.status}`)
  return r.data.token
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const sock = io(BASE, { auth: { token }, transports: ['websocket', 'polling'], reconnection: false })
    const timer = setTimeout(() => reject(new Error('socket timeout')), 10_000)
    sock.once('connect', () => { clearTimeout(timer); resolve(sock) })
    sock.once('connect_error', (e) => { clearTimeout(timer); reject(e) })
  })
}

;(async () => {
  let socket = null
  try {
    sec('1. Setup login + socket cucina')
    const token = await login()
    ok('Login admin', 'token ottenuto')
    socket = await connectSocket(token)
    ok('Socket cucina connesso', `id=${socket.id}`)

    // Contatori eventi socket
    let newOrderCount = 0
    const newOrderTimings = []
    let firstOrderAt = null
    socket.on('new-order', (payload) => {
      newOrderCount++
      const orderId = payload?.orderId || payload?.id
      newOrderTimings.push({ orderId, t: Date.now() })
      if (!firstOrderAt) firstOrderAt = Date.now()
    })

    sec('2. Trova 10 tavoli liberi + menu items')
    const tablesRes = await api('GET', '/api/tables', { token })
    const freeTables = tablesRes.data.filter(t => t.status === 'free').slice(0, N_ORDERS)
    if (freeTables.length < N_ORDERS) {
      throw new Error(`Solo ${freeTables.length} tavoli liberi (servono ${N_ORDERS})`)
    }
    ok(`${N_ORDERS} tavoli liberi disponibili`, freeTables.map(t => `T${t.table_number}`).join(', '))

    const menuRes = await api('GET', '/api/menu/items', { token })
    const items = menuRes.data.filter(m => m.is_available)
    if (items.length < 5) throw new Error('Menu items insufficienti')
    ok('Menu items', `${items.length} disponibili`)

    sec(`3. Sparo ${N_ORDERS} ordini con 3-5 items ciascuno`)
    const orderLatencies = []
    let totalItemsCreated = 0
    const expectedNewOrderEvents = N_ORDERS

    for (let i = 0; i < N_ORDERS; i++) {
      const tbl = freeTables[i]
      // 3-5 items random
      const nItems = 3 + Math.floor(Math.random() * 3)
      const orderItems = Array.from({ length: nItems }, () => {
        const m = items[Math.floor(Math.random() * items.length)]
        return {
          menu_item_id: m.id,
          quantity: 1 + Math.floor(Math.random() * 2),
          workflow_status: 'production',
          notes: '[STRESS TEST]',
        }
      })

      const t0 = Date.now()
      const r = await api('POST', '/api/orders', {
        token,
        body: { table_id: tbl.id, covers: 2, items: orderItems },
      })
      const latency = Date.now() - t0
      orderLatencies.push(latency)

      if (r.status === 201) {
        createdOrderIds.push(r.data.id)
        totalItemsCreated += r.data.items.length
        process.stdout.write(`  ${C.G}✓${C.N} #${i+1}/${N_ORDERS} T${tbl.table_number} (${r.data.items.length} items, ${latency}ms)\n`)
      } else {
        fail(`Ordine #${i+1}`, `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0,120)}`)
      }
    }
    ok(`Creati ${createdOrderIds.length}/${N_ORDERS} ordini`, `totale items: ${totalItemsCreated}`)
    const avgLat = Math.round(orderLatencies.reduce((a,b)=>a+b,0) / orderLatencies.length)
    const maxLat = Math.max(...orderLatencies)
    info(`Latency POST avg=${avgLat}ms max=${maxLat}ms`)

    sec('4. Verifica socket: eventi new-order ricevuti')
    // Lascia 2s per il drain di tutti gli eventi pending
    await new Promise(r => setTimeout(r, 2000))
    if (newOrderCount >= expectedNewOrderEvents) {
      ok(`Socket new-order: ricevuti ${newOrderCount}/${expectedNewOrderEvents}`,
         newOrderCount > expectedNewOrderEvents ? '(qualche evento extra, normale)' : 'perfect match')
    } else {
      fail(`Socket new-order: solo ${newOrderCount}/${expectedNewOrderEvents}`, 'EVENTI PERSI')
    }

    sec('5. KDS API: tutti gli ordini visibili?')
    const kdsRes = await api('GET', '/api/kds/pending', { token })
    const ourInKds = kdsRes.data.filter(o => createdOrderIds.includes(o.order_id))
    const totalKdsItems = ourInKds.reduce((sum, o) => sum + (o.items?.length || 0), 0)
    ok(`Ordini nel KDS: ${ourInKds.length}/${createdOrderIds.length}`,
       ourInKds.length === createdOrderIds.length ? 'tutti presenti' : 'MANCANTI')
    ok(`Items nel KDS: ${totalKdsItems}/${totalItemsCreated}`,
       totalKdsItems === totalItemsCreated ? 'tutti presenti' : 'MANCANTI')

    sec('6. Performance KDS sotto carico')
    const tKds = Date.now()
    await api('GET', '/api/kds/pending', { token })
    const kdsLat = Date.now() - tKds
    if (kdsLat < 500) ok(`GET /kds/pending latency`, `${kdsLat}ms (target <500ms)`)
    else fail(`GET /kds/pending latency`, `${kdsLat}ms (target <500ms)`)

    sec('7. Tavoli ora occupied?')
    const tablesAfter = await api('GET', '/api/tables', { token })
    const occupiedNow = tablesAfter.data.filter(t => t.status === 'occupied').length
    const myTablesOccupied = freeTables.filter(ft =>
      tablesAfter.data.find(t => t.id === ft.id && t.status === 'occupied')
    ).length
    ok(`Tavoli occupied totali: ${occupiedNow}`, `${myTablesOccupied}/${N_ORDERS} dei nostri`)

    sec('8. Distribution latency new-order (socket round-trip)')
    if (newOrderTimings.length > 0) {
      // Calcola latenza socket: tempo da quando abbiamo iniziato il loop al tempo socket
      // (approssimazione: usiamo l'ordine di arrivo per accoppiare timing)
      const socketLat = newOrderTimings.map((evt, i) => {
        // best-effort: l'ordine n-esimo dovrebbe corrispondere all'evento socket n-esimo
        return evt.t
      })
      const span = newOrderTimings[newOrderTimings.length-1].t - newOrderTimings[0].t
      info(`Span ricezione ${newOrderTimings.length} eventi: ${span}ms`)
      info(`Throughput: ${Math.round(newOrderTimings.length / (span/1000))} eventi/sec`)
    }

  } catch (e) {
    fail('FATAL', e.message)
    console.error(C.R + e.stack + C.N)
  } finally {
    sec(`Cleanup: cancello ${createdOrderIds.length} ordini di test`)
    const token = await login().catch(() => null)
    if (token) {
      let cancelled = 0
      for (const id of createdOrderIds) {
        const r = await api('DELETE', `/api/orders/${id}`, { token })
        if (r.status === 200 || r.status === 204) cancelled++
      }
      ok(`Cleanup`, `${cancelled}/${createdOrderIds.length} ordini cancellati`)
    }
    if (socket) socket.disconnect()
    console.log('')
    process.exit(0)
  }
})()
