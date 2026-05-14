#!/usr/bin/env node
/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║ STRESS TEST ADVANCED — scenari critici post-fix pool               ║
 * ╠════════════════════════════════════════════════════════════════════╣
 * ║ Test 1: Spike 30 ordini in 5s (worst case venerdì sera punta)      ║
 * ║ Test 2: Race condition DELETE (2 client stesso ordine)             ║
 * ║ Test 3: Socket recovery after force disconnect                     ║
 * ║ Test 4: Heavy single endpoint (100 GET /api/admin/stats parallel)  ║
 * ║ Test 5: Sustained 90s mixed + leak detection (DB conn pre/post)    ║
 * ║ Cleanup: tutti gli ordini cancellati                               ║
 * ╚════════════════════════════════════════════════════════════════════╝
 */
import { io } from 'socket.io-client'
import { execSync } from 'child_process'

const BASE = 'https://gestione.gustopro.it'
const C = { R:'\x1b[31m', G:'\x1b[32m', Y:'\x1b[33m', B:'\x1b[34m', M:'\x1b[35m', D:'\x1b[2m', N:'\x1b[0m' }

function sec(t) { console.log(`\n${C.B}━━━ ${t} ━━━${C.N}`) }
function ok(m, d='') { console.log(`  ${C.G}✓${C.N} ${m}${d ? ' ' + C.D + '· ' + d + C.N : ''}`) }
function info(m) { console.log(`  ${C.M}·${C.N} ${m}`) }
function fail(m, d='') { console.log(`  ${C.R}✗${C.N} ${m}${d ? ' ' + C.D + '· ' + d + C.N : ''}`) }
function warn(m) { console.log(`  ${C.Y}⚠${C.N}  ${m}`) }

function ssh(cmd) {
  try { return execSync(`ssh -i ~/.ssh/qubitrex-deploy -o StrictHostKeyChecking=no gustopro@178.104.106.143 ${JSON.stringify(cmd)}`, { encoding:'utf8', stdio:['pipe','pipe','pipe'] }).trim() }
  catch (e) { return `ERR: ${e.message.slice(0,80)}` }
}

function stats(arr) {
  if (arr.length === 0) return { n: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 }
  const sorted = [...arr].sort((a,b) => a-b)
  return {
    n: sorted.length,
    avg: Math.round(sorted.reduce((a,b)=>a+b,0) / sorted.length),
    min: sorted[0],
    max: sorted[sorted.length-1],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  }
}

async function api(method, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  const t0 = Date.now()
  try {
    const r = await fetch(`${BASE}${path}`, {
      method, headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    let data = null
    try { data = await r.json() } catch { /* */ }
    return { status: r.status, data, latency: Date.now() - t0 }
  } catch (e) {
    return { status: 0, error: e.message, latency: Date.now() - t0 }
  }
}

function connectSocket(token, label = 'sock') {
  return new Promise((resolve, reject) => {
    const sock = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false })
    const t = setTimeout(() => reject(new Error(`${label} timeout`)), 10_000)
    sock.once('connect', () => { clearTimeout(t); resolve(sock) })
    sock.once('connect_error', (e) => { clearTimeout(t); reject(e) })
  })
}

const created = []

;(async () => {
  let token
  try {
    info('Login admin…')
    const r = await api('POST', '/api/auth/login', { body: { username: 'admin', pin: '0000' } })
    if (r.status !== 200) throw new Error(`login ${r.status}`)
    token = r.data.token

    const tablesR = await api('GET', '/api/tables', { token })
    const menuR = await api('GET', '/api/menu/items', { token })
    const items = menuR.data.filter(m => m.is_available)
    ok(`Setup: ${tablesR.data.length} tavoli totali, ${items.length} menu items`)

    // ──────────────────────────────────────────────────────────────
    sec('Test 1 — Spike 30 ordini in 5s (Riva venerdì sera punta)')
    // ──────────────────────────────────────────────────────────────
    const freeTables1 = tablesR.data.filter(t => t.status === 'free').slice(0, 30)
    if (freeTables1.length < 30) { warn(`Solo ${freeTables1.length} tavoli liberi, riduco target`) }
    const TARGET1 = Math.min(30, freeTables1.length)
    const t1Lats = []
    const t1Statuses = {}
    const t1Start = Date.now()
    // Distribuiti in 5s: 1 ogni ~167ms (6/sec)
    const promises1 = []
    for (let i = 0; i < TARGET1; i++) {
      const tbl = freeTables1[i]
      const its = Array.from({ length: 3 }, () => ({
        menu_item_id: items[Math.floor(Math.random() * items.length)].id,
        quantity: 1,
        workflow_status: 'production',
        notes: '[T1-SPIKE]',
      }))
      promises1.push(
        new Promise(r => setTimeout(() => r(api('POST', '/api/orders', {
          token, body: { table_id: tbl.id, covers: 2, items: its },
        })), i * 167))
      )
    }
    const results1 = await Promise.all(promises1)
    const t1Elapsed = Date.now() - t1Start
    for (const r of results1) {
      t1Statuses[r.status] = (t1Statuses[r.status] || 0) + 1
      if (r.status === 201) {
        t1Lats.push(r.latency)
        if (r.data?.id) created.push(r.data.id)
      }
    }
    const s1 = stats(t1Lats)
    ok(`Spike completato in ${t1Elapsed}ms`,
       `${results1.length} req · status: ${Object.entries(t1Statuses).map(([k,v])=>k+':'+v).join(', ')}`)
    info(`Latency POST: avg=${s1.avg}ms p50=${s1.p50}ms p95=${s1.p95}ms p99=${s1.p99}ms max=${s1.max}ms`)
    info(`Throughput effective: ${Math.round(results1.length / (t1Elapsed/1000))} req/sec`)

    // ──────────────────────────────────────────────────────────────
    sec('Test 2 — Race condition: 2 client DELETE stesso ordine')
    // ──────────────────────────────────────────────────────────────
    // Crea un ordine apposito + 2 DELETE simultanei
    const raceFreeTable = tablesR.data.find(t => t.status === 'free' && !created.find(id => id === t.id))
    const raceCreate = await api('POST', '/api/orders', {
      token, body: { table_id: raceFreeTable.id, covers: 1, items: [{
        menu_item_id: items[0].id, quantity: 1, workflow_status: 'production', notes: '[T2-RACE]'
      }]},
    })
    if (raceCreate.status === 201) {
      const raceId = raceCreate.data.id
      info(`Ordine race-test creato: ${raceId.slice(0,8)}...`)
      // 2 DELETE simultanei
      const [d1, d2] = await Promise.all([
        api('DELETE', `/api/orders/${raceId}`, { token }),
        api('DELETE', `/api/orders/${raceId}`, { token }),
      ])
      const codes = [d1.status, d2.status].sort()
      info(`DELETE #1 → HTTP ${d1.status} in ${d1.latency}ms`)
      info(`DELETE #2 → HTTP ${d2.status} in ${d2.latency}ms`)
      // Aspettativa: uno passa (200/204), l'altro 404 o conflict
      const successes = [d1.status, d2.status].filter(s => s === 200 || s === 204).length
      const notFounds = [d1.status, d2.status].filter(s => s === 404).length
      if (successes === 1 && (notFounds === 1 || codes[1] >= 400)) {
        ok('Race condition gestita correttamente', '1 success + 1 negato')
      } else if (successes === 2) {
        warn('Entrambi DELETE 2xx — operation idempotente (OK)')
      } else {
        fail('Race result inatteso', `codes: ${codes.join(',')}`)
      }
    }

    // ──────────────────────────────────────────────────────────────
    sec('Test 3 — Socket recovery: force disconnect + reconnect')
    // ──────────────────────────────────────────────────────────────
    const sockA = await connectSocket(token, 'sockA')
    let eventsBeforeKill = 0
    let eventsAfterReconnect = 0
    sockA.on('new-order', () => { eventsBeforeKill++ })

    // Genera 2 ordini per generare eventi BEFORE
    const tablesNow1 = await api('GET', '/api/tables', { token })
    const freeNow1 = tablesNow1.data.filter(t => t.status === 'free').slice(0, 2)
    for (const tbl of freeNow1) {
      const r = await api('POST', '/api/orders', {
        token, body: { table_id: tbl.id, covers: 1, items: [{
          menu_item_id: items[0].id, quantity: 1, workflow_status: 'production', notes: '[T3-PRE]'
        }]},
      })
      if (r.status === 201) created.push(r.data.id)
    }
    await new Promise(r => setTimeout(r, 800))
    info(`Eventi ricevuti PRE-disconnect: ${eventsBeforeKill}`)
    info('Force disconnect socket…')
    sockA.disconnect()
    await new Promise(r => setTimeout(r, 1500))

    // Riconnetti con NUOVA socket (simula PWA recovery)
    const sockB = await connectSocket(token, 'sockB')
    sockB.on('new-order', () => { eventsAfterReconnect++ })
    info(`Socket B connesso: ${sockB.id}`)

    // Genera 2 nuovi ordini per generare eventi AFTER
    const tablesNow2 = await api('GET', '/api/tables', { token })
    const freeNow2 = tablesNow2.data.filter(t => t.status === 'free').slice(0, 2)
    for (const tbl of freeNow2) {
      const r = await api('POST', '/api/orders', {
        token, body: { table_id: tbl.id, covers: 1, items: [{
          menu_item_id: items[0].id, quantity: 1, workflow_status: 'production', notes: '[T3-POST]'
        }]},
      })
      if (r.status === 201) created.push(r.data.id)
    }
    await new Promise(r => setTimeout(r, 800))
    if (eventsAfterReconnect >= 2) {
      ok('Socket recovery OK', `${eventsAfterReconnect} eventi ricevuti dopo reconnect`)
    } else {
      fail('Socket recovery degradato', `solo ${eventsAfterReconnect}/2 eventi ricevuti`)
    }
    sockB.disconnect()

    // ──────────────────────────────────────────────────────────────
    sec('Test 4 — Heavy single endpoint (100 GET /api/admin/stats parallel)')
    // ──────────────────────────────────────────────────────────────
    const t4Start = Date.now()
    const t4Promises = []
    for (let i = 0; i < 100; i++) {
      t4Promises.push(api('GET', '/api/admin/stats', { token }))
    }
    const t4Res = await Promise.all(t4Promises)
    const t4Elapsed = Date.now() - t4Start
    const t4Lats = t4Res.filter(r => r.status === 200).map(r => r.latency)
    const t4Errors = t4Res.filter(r => r.status !== 200).length
    const s4 = stats(t4Lats)
    ok(`100 GET completate in ${t4Elapsed}ms`, `successi: ${t4Lats.length}/100, errori: ${t4Errors}`)
    info(`Latency: avg=${s4.avg}ms p50=${s4.p50}ms p95=${s4.p95}ms p99=${s4.p99}ms max=${s4.max}ms`)
    info(`Throughput: ${Math.round(t4Lats.length / (t4Elapsed/1000))} req/sec`)

    // ──────────────────────────────────────────────────────────────
    sec('Test 5 — Sustained 90s + leak detection (DB conn pre/post)')
    // ──────────────────────────────────────────────────────────────
    const dbPreRaw = ssh('docker exec gestionale-postgres psql -U gustopro -d gustopro -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname=\'gustopro\' AND state IS NOT NULL"')
    const dbPre = parseInt(dbPreRaw, 10) || 0
    info(`DB connections PRE-test: ${dbPre}`)

    const t5Start = Date.now()
    const t5End = t5Start + 90_000
    const t5Lats = []
    let t5Errors = 0
    let t5Ops = 0
    let stopT5 = false
    const t5Loop = async () => {
      while (Date.now() < t5End && !stopT5) {
        // mix di operazioni
        const op = Math.random()
        let r
        if (op < 0.6) {
          r = await api('GET', '/api/tables', { token })
        } else if (op < 0.85) {
          r = await api('GET', '/api/kds/pending', { token })
        } else {
          r = await api('GET', '/api/admin/stats', { token })
        }
        if (r.status === 200) t5Lats.push(r.latency)
        else t5Errors++
        t5Ops++
        await new Promise(r => setTimeout(r, 100))
      }
    }
    // 4 client paralleli
    const t5Loops = [t5Loop(), t5Loop(), t5Loop(), t5Loop()]
    const progress5 = setInterval(() => {
      const elapsed = Math.floor((Date.now() - t5Start) / 1000)
      process.stdout.write(`  ${C.D}t=${elapsed}s · ops=${t5Ops} · err=${t5Errors}${C.N}\r`)
    }, 5000)
    await Promise.all(t5Loops)
    clearInterval(progress5)
    console.log('')
    const s5 = stats(t5Lats)
    ok(`Sustained: ${t5Ops} ops in 90s`, `${Math.round(t5Ops/90)} ops/sec, errori: ${t5Errors}`)
    info(`Latency: avg=${s5.avg}ms p50=${s5.p50}ms p95=${s5.p95}ms p99=${s5.p99}ms`)

    const dbPostRaw = ssh('docker exec gestionale-postgres psql -U gustopro -d gustopro -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname=\'gustopro\' AND state IS NOT NULL"')
    const dbPost = parseInt(dbPostRaw, 10) || 0
    info(`DB connections POST-test: ${dbPost}`)
    const leak = dbPost - dbPre
    if (Math.abs(leak) <= 2) {
      ok('No DB connection leak', `delta: ${leak >= 0 ? '+' : ''}${leak}`)
    } else {
      warn(`Possible DB leak: delta ${leak >= 0 ? '+' : ''}${leak} connessioni`)
    }

    // Backend memory check
    const memInfo = ssh('docker stats --no-stream --format "{{.Container}} {{.MemUsage}}" | grep gestionale-backend')
    info(`Backend memory POST: ${memInfo || 'N/A'}`)

  } catch (e) {
    fail('FATAL', e.message)
    console.error(C.R + e.stack + C.N)
  } finally {
    sec(`Cleanup: ${created.length} ordini`)
    if (token) {
      let n = 0
      for (const id of created) {
        const r = await api('DELETE', `/api/orders/${id}`, { token })
        if (r.status === 200 || r.status === 204) n++
      }
      ok(`Cleanup: ${n}/${created.length} ordini cancellati`)
      ssh(`docker exec gestionale-postgres psql -U gustopro -d gustopro -c "UPDATE tables SET status='free' WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND status IN ('occupied','dirty');" 2>&1 | tail -1`)
    }
    console.log('')
    process.exit(0)
  }
})()
