/**
 * Test mirato: chef segna piatto ready → cameriere riceve item-ready-notify
 * con payload corretto (itemName, quantity, tableNumber).
 */
import { io } from 'socket.io-client'

const BASE = 'https://gestione.gustopro.it'
async function api(m, p, o = {}) {
  const h = { 'Content-Type': 'application/json', ...(o.headers || {}) }
  if (o.token) h.Authorization = `Bearer ${o.token}`
  const r = await fetch(`${BASE}${p}`, { method: m, headers: h, body: o.body ? JSON.stringify(o.body) : undefined })
  let d = null; try { d = await r.json() } catch {}
  return { status: r.status, data: d }
}

;(async () => {
  console.log('=== Test: chef ready → waiter beep ===\n')
  const login = await api('POST', '/api/auth/login', { body: { username: 'admin', pin: '0000' } })
  const token = login.data.token
  console.log('✓ Login admin')

  // Connect 2 socket: uno "kitchen" (per PATCH), uno "waiter listener"
  const sockWaiter = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false })
  await new Promise((r, e) => {
    const t = setTimeout(() => e(new Error('sock timeout')), 5000)
    sockWaiter.once('connect', () => { clearTimeout(t); r() })
  })
  console.log(`✓ Socket cameriere connesso: ${sockWaiter.id}`)

  // Cleanup eventuali ordini orfani
  // (saltiamo per non rompere altri test; usiamo un tavolo che SAPPIAMO essere libero)

  // Setup ordine: prendiamo un tavolo libero e un menu item
  const tbR = await api('GET', '/api/tables', { token })
  const free = tbR.data.find(t => t.status === 'free')
  if (!free) { console.error('✗ Nessun tavolo libero — esci'); process.exit(1) }
  const menuR = await api('GET', '/api/menu/items', { token })
  const item = menuR.data.find(m => m.is_available)
  console.log(`✓ Setup: T${free.table_number} libero, item "${item.name}"`)

  // Subscribe a item-ready-notify
  let readyEvent = null
  sockWaiter.on('item-ready-notify', (payload) => {
    readyEvent = payload
    console.log(`🔔 RICEVUTO item-ready-notify:`)
    console.log('  ', JSON.stringify(payload, null, 2).split('\n').join('\n  '))
  })

  // Crea ordine
  console.log('\n[1] POST /api/orders (cameriere admin)…')
  const create = await api('POST', '/api/orders', {
    token,
    body: { table_id: free.id, covers: 1, items: [{
      menu_item_id: item.id, quantity: 2, workflow_status: 'production', notes: '[TEST-READY-BEEP]'
    }]},
  })
  if (create.status !== 201) {
    console.error(`✗ POST orders fail: ${create.status}`, create.data)
    process.exit(1)
  }
  const orderId = create.data.id
  const itemId = create.data.items[0].id
  console.log(`  ✓ Ordine creato: ${orderId.slice(0,8)} item ${itemId.slice(0,8)}`)

  // Simula il flusso chef:
  // pending → cooking → ready
  await new Promise(r => setTimeout(r, 500))
  console.log('\n[2] PATCH status=cooking (chef)…')
  const cookR = await api('PATCH', `/api/kds/items/${itemId}/status`, { token, body: { status: 'cooking' }})
  console.log(`  ✓ status → cooking (${cookR.status})`)

  await new Promise(r => setTimeout(r, 500))
  console.log('\n[3] PATCH status=ready (chef) — DEVE TRIGGERARE item-ready-notify')
  const readyR = await api('PATCH', `/api/kds/items/${itemId}/status`, { token, body: { status: 'ready' }})
  console.log(`  ✓ status → ready (${readyR.status})`)

  // Aspetta 2s che l'evento arrivi
  await new Promise(r => setTimeout(r, 2000))

  console.log('\n=== Risultato ===')
  if (readyEvent) {
    const ok = (
      readyEvent.itemName?.toLowerCase().includes(item.name.toLowerCase().split(' ')[0]) &&
      readyEvent.quantity === 2 &&
      readyEvent.tableNumber === free.table_number
    )
    if (ok) {
      console.log('🎉 PASS: cameriere ha ricevuto evento con payload corretto')
      console.log(`   · itemName:   ${readyEvent.itemName} (expected: "${item.name}")`)
      console.log(`   · quantity:   ${readyEvent.quantity} (expected: 2)`)
      console.log(`   · tableNumber: ${readyEvent.tableNumber} (expected: ${free.table_number})`)
      console.log('\n📱 Frontend behavior atteso:')
      console.log('   1. playReadyBeep() → tono 1320Hz + 990Hz (250ms)')
      console.log('   2. toast verde "🍽️ Pronto — Tavolo XX"')
      console.log('   3. Web Notification se tab non visibile')
    } else {
      console.log('⚠️  evento ricevuto ma payload mismatch:')
      console.log('   ', JSON.stringify(readyEvent))
    }
  } else {
    console.log('✗ FAIL: evento NON ricevuto entro 2s')
  }

  // Cleanup
  console.log('\nCleanup: DELETE ordine…')
  await api('DELETE', `/api/orders/${orderId}`, { token })
  sockWaiter.disconnect()
  process.exit(0)
})()
