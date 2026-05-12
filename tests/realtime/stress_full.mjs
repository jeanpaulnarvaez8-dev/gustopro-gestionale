#!/usr/bin/env node
/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║ STRESS TEST FULL — Riva Beach a piena capacità (venerdì sera)      ║
 * ╠════════════════════════════════════════════════════════════════════╣
 * ║ Phase A: Baseline metrics (container CPU/RAM, DB connections)      ║
 * ║ Phase B: Concurrent reads (10 client × GET /api/tables x N volte)  ║
 * ║ Phase C: Burst writes (20 ordini in parallelo)                     ║
 * ║ Phase D: Sustained mixed load 60s (5 cam + 3 chef + 2 mgr + WS)    ║
 * ║ Phase E: Post-test metrics (slow queries, peak resources)          ║
 * ║ Phase F: Cleanup automatico                                        ║
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

const sshCmd = (cmd) => `ssh -i ~/.ssh/qubitrex-deploy -o StrictHostKeyChecking=no gustopro@178.104.106.143 "${cmd}"`
function ssh(cmd) {
  try { return execSync(sshCmd(cmd), { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim() }
  catch { return '' }
}

// Stats helper
function stats(arr) {
  if (arr.length === 0) return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 }
  const sorted = [...arr].sort((a,b) => a-b)
  const sum = sorted.reduce((a,b) => a+b, 0)
  return {
    n: sorted.length,
    avg: Math.round(sum / sorted.length),
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
      method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const latency = Date.now() - t0
    let data = null
    try { data = await r.json() } catch { /* */ }
    return { status: r.status, data, latency }
  } catch (e) {
    return { status: 0, error: e.message, latency: Date.now() - t0 }
  }
}

// ════════════════════════════════════════════════════════════════════
const createdOrderIds = []
let stopAll = false

;(async () => {
  const T_START = Date.now()
  try {
    // ──────────────────────────────────────────────────────────────
    sec('Phase A — Baseline metrics (server state PRE-test)')
    // ──────────────────────────────────────────────────────────────
    const stats0 = ssh('docker stats --no-stream --format "{{.Container}} cpu={{.CPUPerc}} mem={{.MemPerc}}" | grep gestionale')
    info('Container resources PRE:')
    stats0.split('\n').forEach((l) => info('  ' + l))
    const dbConn0 = ssh('docker exec gestionale-postgres psql -U gustopro -d gustopro -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname=\'gustopro\'"')
    info(`DB connections PRE: ${dbConn0}`)

    const loginR = await api('POST', '/api/auth/login', { body: { username: 'admin', pin: '0000' } })
    if (loginR.status !== 200) throw new Error(`login fail ${loginR.status}`)
    const token = loginR.data.token
    ok('Login admin', `latency ${loginR.latency}ms`)

    // Reset pg_stat_statements per misurare query SOLO durante il test
    ssh('docker exec gestionale-postgres psql -U gustopro -d gustopro -c "SELECT pg_stat_statements_reset();" 2>&1 | tail -1')
    info('pg_stat_statements reset (misurazione fresh)')

    const tablesR = await api('GET', '/api/tables', { token })
    const freeTables = tablesR.data.filter(t => t.status === 'free')
    const menuR = await api('GET', '/api/menu/items', { token })
    const items = menuR.data.filter(m => m.is_available)
    ok(`Setup: ${freeTables.length} tavoli liberi, ${items.length} menu items`)

    // ──────────────────────────────────────────────────────────────
    sec('Phase B — Concurrent reads (10 client × 5 GET /api/tables in parallelo)')
    // ──────────────────────────────────────────────────────────────
    const readLatencies = []
    const readErrors = { count: 0 }
    const N_CLIENTS = 10
    const N_REQS = 5
    const readPromises = []
    const tB0 = Date.now()
    for (let c = 0; c < N_CLIENTS; c++) {
      readPromises.push((async () => {
        for (let i = 0; i < N_REQS; i++) {
          const r = await api('GET', '/api/tables', { token })
          if (r.status === 200) readLatencies.push(r.latency)
          else readErrors.count++
        }
      })())
    }
    await Promise.all(readPromises)
    const tBduration = Date.now() - tB0
    const s = stats(readLatencies)
    const throughput = Math.round((N_CLIENTS * N_REQS) / (tBduration / 1000))
    ok(`${N_CLIENTS * N_REQS} GET completate in ${tBduration}ms`, `errori: ${readErrors.count}`)
    info(`Latency: avg=${s.avg}ms min=${s.min}ms max=${s.max}ms p50=${s.p50}ms p95=${s.p95}ms p99=${s.p99}ms`)
    info(`Throughput: ${throughput} req/sec`)

    // ──────────────────────────────────────────────────────────────
    sec('Phase C — Burst writes (20 ordini POST in parallelo)')
    // ──────────────────────────────────────────────────────────────
    const N_BURST = Math.min(20, freeTables.length)
    const burstResults = []
    const tC0 = Date.now()
    const burstPromises = []
    for (let i = 0; i < N_BURST; i++) {
      const tbl = freeTables[i]
      const orderItems = Array.from({ length: 3 }, () => {
        const m = items[Math.floor(Math.random() * items.length)]
        return { menu_item_id: m.id, quantity: 1, workflow_status: 'production', notes: '[STRESS-BURST]' }
      })
      burstPromises.push(api('POST', '/api/orders', {
        token,
        body: { table_id: tbl.id, covers: 2, items: orderItems },
      }))
    }
    const burstResp = await Promise.all(burstPromises)
    const tCduration = Date.now() - tC0
    let burstOk = 0
    const burstLats = []
    for (const r of burstResp) {
      if (r.status === 201) {
        burstOk++
        if (r.data?.id) createdOrderIds.push(r.data.id)
        burstLats.push(r.latency)
      } else {
        burstResults.push({ status: r.status, msg: r.data?.error?.slice(0,80) || r.error })
      }
    }
    const bs = stats(burstLats)
    ok(`Burst writes: ${burstOk}/${N_BURST} successi in ${tCduration}ms`)
    info(`Latency POST: avg=${bs.avg}ms p50=${bs.p50}ms p95=${bs.p95}ms max=${bs.max}ms`)
    info(`Burst throughput: ${Math.round(burstOk / (tCduration/1000))} ordini/sec`)
    if (burstResults.length > 0) {
      warn(`${burstResults.length} fallimenti:`)
      burstResults.slice(0,3).forEach(r => info(`  HTTP ${r.status}: ${r.msg}`))
    }

    // ──────────────────────────────────────────────────────────────
    sec('Phase D — Sustained mixed load 60s (5 waiter + 3 chef + 2 mgr + WS)')
    // ──────────────────────────────────────────────────────────────
    info('Configurazione:')
    info('  · 5 waiter: 1 PATCH workflow status ogni 2s')
    info('  · 3 chef: 1 PATCH kds status ogni 3s')
    info('  · 2 manager: 1 GET /api/admin/stats ogni 5s')
    info('  · 1 socket client che conta tutti i broadcast events')

    // Connect socket per conteggio eventi
    const sock = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false })
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('sock timeout')), 5000)
      sock.once('connect', () => { clearTimeout(t); res() })
    })
    let socketEvents = { 'new-order': 0, 'item-status-updated': 0, 'workflow-status-changed': 0, 'table-status-changed': 0, 'item-ready-notify': 0, other: 0 }
    sock.onAny((event) => {
      if (event in socketEvents) socketEvents[event]++
      else socketEvents.other++
    })

    // Fetch items pendenti per dare al chef qualcosa da PATCH
    const initialKds = await api('GET', '/api/kds/pending', { token })
    const allItemIds = []
    for (const o of (initialKds.data || [])) {
      for (const it of (o.items || [])) allItemIds.push(it.id)
    }
    info(`KDS startup: ${initialKds.data?.length || 0} ordini, ${allItemIds.length} items su cui i chef possono patchare`)

    const DURATION_S = 60
    const tD0 = Date.now()
    const tDend = tD0 + DURATION_S * 1000
    const sustainedLat = { waiter: [], chef: [], manager: [] }
    const sustainedErr = { waiter: 0, chef: 0, manager: 0 }

    // 5 waiter loop
    async function waiterLoop(id) {
      while (Date.now() < tDend && !stopAll) {
        // PATCH workflow su un item random in waiting (simula sblocco prossima portata)
        const r = await api('GET', '/api/workflow/waiting', { token })
        const allWaiting = []
        for (const o of (r.data || [])) {
          for (const it of (o.items || [])) allWaiting.push(it.id)
        }
        if (allWaiting.length > 0) {
          const itemId = allWaiting[Math.floor(Math.random() * allWaiting.length)]
          const p = await api('PATCH', `/api/workflow/items/${itemId}/status`, {
            token, body: { workflow_status: 'production' },
          })
          if (p.status === 200) sustainedLat.waiter.push(p.latency)
          else sustainedErr.waiter++
        }
        await new Promise(r => setTimeout(r, 2000))
      }
    }
    // 3 chef loop
    async function chefLoop(id) {
      while (Date.now() < tDend && !stopAll) {
        if (allItemIds.length > 0) {
          const itemId = allItemIds[Math.floor(Math.random() * allItemIds.length)]
          const statuses = ['cooking', 'ready']
          const next = statuses[Math.floor(Math.random() * statuses.length)]
          const p = await api('PATCH', `/api/kds/items/${itemId}/status`, {
            token, body: { status: next },
          })
          if (p.status === 200) sustainedLat.chef.push(p.latency)
          else sustainedErr.chef++
        }
        await new Promise(r => setTimeout(r, 3000))
      }
    }
    // 2 manager loop (read-heavy)
    async function managerLoop(id) {
      while (Date.now() < tDend && !stopAll) {
        const [r1, r2] = await Promise.all([
          api('GET', '/api/admin/stats', { token }),
          api('GET', '/api/kds/pending', { token }),
        ])
        if (r1.status === 200) sustainedLat.manager.push(r1.latency)
        else sustainedErr.manager++
        if (r2.status === 200) sustainedLat.manager.push(r2.latency)
        else sustainedErr.manager++
        await new Promise(r => setTimeout(r, 5000))
      }
    }

    const loops = []
    for (let i = 0; i < 5; i++) loops.push(waiterLoop(i))
    for (let i = 0; i < 3; i++) loops.push(chefLoop(i))
    for (let i = 0; i < 2; i++) loops.push(managerLoop(i))

    // Progress indicator
    const progressInt = setInterval(() => {
      const elapsed = Math.floor((Date.now() - tD0) / 1000)
      const remaining = DURATION_S - elapsed
      if (remaining <= 0) return
      process.stdout.write(`  ${C.D}t=${elapsed}s · waiter ${sustainedLat.waiter.length} · chef ${sustainedLat.chef.length} · mgr ${sustainedLat.manager.length} · ws events: ${Object.values(socketEvents).reduce((a,b)=>a+b,0)}${C.N}\r`)
    }, 2000)

    await Promise.all(loops)
    clearInterval(progressInt)
    console.log('')

    const sw = stats(sustainedLat.waiter)
    const sc = stats(sustainedLat.chef)
    const sm = stats(sustainedLat.manager)
    ok(`Waiter loop: ${sw.n} PATCH workflow`, `avg=${sw.avg}ms p95=${sw.p95}ms err=${sustainedErr.waiter}`)
    ok(`Chef loop: ${sc.n} PATCH kds`, `avg=${sc.avg}ms p95=${sc.p95}ms err=${sustainedErr.chef}`)
    ok(`Manager loop: ${sm.n} GET stats/kds`, `avg=${sm.avg}ms p95=${sm.p95}ms err=${sustainedErr.manager}`)
    info('Socket broadcast events ricevuti:')
    Object.entries(socketEvents).forEach(([k,v]) => v > 0 && info(`  · ${k}: ${v}`))
    sock.disconnect()

    // ──────────────────────────────────────────────────────────────
    sec('Phase E — Post-test metrics (resource peak + slow queries)')
    // ──────────────────────────────────────────────────────────────
    const stats1 = ssh('docker stats --no-stream --format "{{.Container}} cpu={{.CPUPerc}} mem={{.MemPerc}}" | grep gestionale')
    info('Container resources POST:')
    stats1.split('\n').forEach((l) => info('  ' + l))
    const dbConn1 = ssh('docker exec gestionale-postgres psql -U gustopro -d gustopro -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname=\'gustopro\'"')
    info(`DB connections POST: ${dbConn1}`)

    info('Top 5 query per mean exec time (durante il test):')
    const slowQueries = ssh(`docker exec gestionale-postgres psql -U gustopro -d gustopro -c "SELECT substring(query, 1, 70) AS q, calls, ROUND(mean_exec_time::numeric, 2) AS mean_ms, ROUND(total_exec_time::numeric, 0) AS total_ms FROM pg_stat_statements WHERE query NOT LIKE '%pg_stat_statements%' AND query !~ '^(COMMIT|BEGIN|ROLLBACK|SET|SHOW|RESET)' ORDER BY mean_exec_time DESC LIMIT 5;" 2>&1`)
    console.log(slowQueries.split('\n').slice(0, 12).map(l => '    ' + l).join('\n'))

    // Backend log: errori?
    const beErrors = ssh(`docker logs gestionale-backend --since 5m 2>&1 | grep -cE '"level":50' || echo 0`)
    info(`Backend errors (level=50) ultimi 5min: ${beErrors}`)

    // ──────────────────────────────────────────────────────────────
    sec('Phase F — Riepilogo finale')
    // ──────────────────────────────────────────────────────────────
    const totalElapsed = Math.round((Date.now() - T_START) / 1000)
    info(`Test totale: ${totalElapsed}s`)

    const overallReqs = (N_CLIENTS * N_REQS) + N_BURST + sw.n + sc.n + sm.n
    const overallErrors = readErrors.count + (N_BURST - burstOk) + sustainedErr.waiter + sustainedErr.chef + sustainedErr.manager
    info(`Richieste totali: ${overallReqs} (errori: ${overallErrors}, ${((overallReqs - overallErrors) / overallReqs * 100).toFixed(2)}% success)`)
    info(`Socket events totali: ${Object.values(socketEvents).reduce((a,b)=>a+b,0)}`)

  } catch (e) {
    fail('FATAL', e.message)
    console.error(C.R + e.stack + C.N)
  } finally {
    sec(`Cleanup: cancello ${createdOrderIds.length} ordini di test`)
    const loginR = await api('POST', '/api/auth/login', { body: { username: 'admin', pin: '0000' } })
    if (loginR.status === 200) {
      const token = loginR.data.token
      let cancelled = 0
      for (const id of createdOrderIds) {
        const r = await api('DELETE', `/api/orders/${id}`, { token })
        if (r.status === 200 || r.status === 204) cancelled++
      }
      ok(`Cleanup: ${cancelled}/${createdOrderIds.length} ordini cancellati`)
      // Reset tavoli
      ssh('docker exec gestionale-postgres psql -U gustopro -d gustopro -c "UPDATE tables SET status=\'free\' WHERE tenant_id=\'00000000-0000-0000-0000-000000000001\' AND status IN (\'occupied\',\'dirty\');"  2>&1 | tail -1')
      ok('Reset tavoli → free')
    }
    process.exit(0)
  }
})()
