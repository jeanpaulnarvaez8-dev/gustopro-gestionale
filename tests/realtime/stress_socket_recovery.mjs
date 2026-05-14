/**
 * Test mirato: socket recovery dopo force disconnect.
 * Verifica che dopo riconnessione, gli eventi broadcast arrivino.
 */
import { io } from 'socket.io-client'

const BASE = 'https://gestione.gustopro.it'
async function api(m, p, o = {}) {
  const h = { 'Content-Type': 'application/json', ...(o.headers || {}) }
  if (o.token) h.Authorization = `Bearer ${o.token}`
  const r = await fetch(`${BASE}${p}`, { method: m, headers: h, body: o.body ? JSON.stringify(o.body) : undefined })
  let d = null; try { d = await r.json() } catch { /* */ }
  return { status: r.status, data: d }
}
function sock(token) {
  return new Promise((res, rej) => {
    const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false })
    const t = setTimeout(() => rej(new Error('timeout')), 8000)
    s.once('connect', () => { clearTimeout(t); res(s) })
    s.once('connect_error', e => { clearTimeout(t); rej(e) })
  })
}

const created = []
;(async () => {
  const login = await api('POST', '/api/auth/login', { body: { username: 'admin', pin: '0000' } })
  const token = login.data.token
  console.log('✓ Login')

  // Setup: trova 4 tavoli sicuramente liberi
  const tbR = await api('GET', '/api/tables', { token })
  const free = tbR.data.filter(t => t.status === 'free').slice(0, 4)
  const menuR = await api('GET', '/api/menu/items', { token })
  const item = menuR.data.find(m => m.is_available)
  console.log(`✓ Setup: ${free.length} tavoli liberi`)

  async function createOrder(tbl, tag) {
    const r = await api('POST', '/api/orders', {
      token, body: { table_id: tbl.id, covers: 1, items: [{
        menu_item_id: item.id, quantity: 1, workflow_status: 'production', notes: `[REC-${tag}]`
      }]},
    })
    if (r.status === 201) {
      created.push(r.data.id)
      return r.data.id
    }
    throw new Error(`POST fail status=${r.status} body=${JSON.stringify(r.data).slice(0,100)}`)
  }

  try {
    console.log('\n=== FASE 1: socket A connect, ricezione 2 ordini ===')
    console.log('  connecting sockA…')
    let sA
    try { sA = await sock(token); console.log(`  sockA OK id=${sA.id}`) }
    catch (e) { console.error('  sockA FAIL:', e.message, e.description?.slice?.(0,200)); throw e }
    let evA = []
    sA.on('new-order', (p) => evA.push(p.orderId))
    await new Promise(r => setTimeout(r, 200)) // settle
    console.log('  POST 1…')
    let o1; try { o1 = await createOrder(free[0], '1a'); console.log('  o1 OK', o1.slice(0,8)) } catch (e) { console.error('  o1 FAIL', e.message); throw e }
    await new Promise(r => setTimeout(r, 400))
    console.log('  POST 2…')
    let o2; try { o2 = await createOrder(free[1], '2a'); console.log('  o2 OK', o2.slice(0,8)) } catch (e) { console.error('  o2 FAIL', e.message); throw e }
    await new Promise(r => setTimeout(r, 400))
    console.log(`  sockA eventi ricevuti: ${evA.length}/2`)
    console.log(`  matching: ${evA.includes(o1) ? '1✓' : '1✗'} ${evA.includes(o2) ? '2✓' : '2✗'}`)

    console.log('\n=== FASE 2: force disconnect sockA, wait 2s ===')
    sA.disconnect()
    await new Promise(r => setTimeout(r, 2000))

    console.log('\n=== FASE 3: socket B connect, ricezione 2 nuovi ordini ===')
    const sB = await sock(token)
    let evB = []
    sB.on('new-order', (p) => evB.push(p.orderId))
    await new Promise(r => setTimeout(r, 200)) // settle handler

    const o3 = await createOrder(free[2], '3b')
    await new Promise(r => setTimeout(r, 400))
    const o4 = await createOrder(free[3], '4b')
    await new Promise(r => setTimeout(r, 800))
    console.log(`  sockB eventi ricevuti: ${evB.length}/2`)
    console.log(`  matching: ${evB.includes(o3) ? '3✓' : '3✗'} ${evB.includes(o4) ? '4✓' : '4✗'}`)
    sB.disconnect()

    if (evA.length === 2 && evB.length === 2 && evB.includes(o3) && evB.includes(o4)) {
      console.log('\n🎉 Socket recovery: PASS — entrambi i flow ricevono tutti gli eventi')
    } else {
      console.log('\n⚠️  Socket recovery: discrepanze, vedi sopra')
    }
  } finally {
    // cleanup
    for (const id of created) {
      await api('DELETE', `/api/orders/${id}`, { token })
    }
    console.log(`\nCleanup: ${created.length} ordini cancellati`)
    process.exit(0)
  }
})()
