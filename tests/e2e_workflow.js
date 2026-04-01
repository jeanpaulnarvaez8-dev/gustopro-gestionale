/**
 * E2E Test Suite — Sistema Workflow Comande A/P/C
 * Testa tutti i flussi: creazione ordini, workflow status, alert obbligatori,
 * incroci, cancellazione, audit trail, edge cases e sicurezza.
 */
process.env.DATABASE_URL = 'postgresql://jeanpaulnarvaez@localhost:5432/gustopro_e2e';
process.env.JWT_SECRET = 'test_e2e_secret';

const path = require('path');
process.chdir(path.join(__dirname, '../backend'));
const express = require('express');
const pool = require('./src/config/db');
const origSocket = require('./src/socket');

// Mock socket.io
const emittedEvents = [];
origSocket.getIO = () => ({
  emit: (event, data) => { emittedEvents.push({ event, data, target: 'broadcast' }); },
  to: (room) => ({
    emit: (event, data) => { emittedEvents.push({ event, data, target: room }); },
    to: (room2) => ({
      emit: (event, data) => { emittedEvents.push({ event, data, target: `${room}+${room2}` }); },
    }),
  }),
});

const o = require('./src/controllers/orders.controller');
const k = require('./src/controllers/kds.controller');
const w = require('./src/controllers/workflow.controller');

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = JSON.parse(req.headers['x-test-user'] || '{}'); next(); });
app.post('/orders', o.createOrder);
app.post('/orders/:id/items', o.addItems);
app.get('/orders/:id', o.getOrder);
app.delete('/orders/:id/items/:itemId', o.cancelItem);
app.get('/kds/pending', k.getPendingOrders);
app.patch('/kds/items/:id/status', k.updateItemStatus);
app.patch('/workflow/items/:itemId/status', w.changeWorkflowStatus);
app.get('/workflow/waiting', w.getWaitingItems);
app.get('/workflow/crossmatches', w.getCrossmatches);
app.get('/workflow/alerts/pending', w.getPendingAlerts);
app.post('/workflow/alerts/:alertId/respond', w.respondToAlert);
app.delete('/workflow/items/:itemId', w.deleteItem);
app.get('/workflow/audit/:orderId', w.getAuditLog);
app.get('/workflow/alerts/direct-delivered', w.getDirectDeliveredAlerts);
app.use((err, req, res, next) => {
  if (process.env.VERBOSE) console.error('  ERR:', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

// ── Test Helpers ──────────────────────────────────────────────
let BASE;
let passed = 0, failed = 0, totalTests = 0;
// These get populated after setupData
let WAITER, WAITER2, ADMIN, KITCHEN;

function ok(test, name) {
  totalTests++;
  if (test) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}`); failed++; }
}

async function post(url, body, user) {
  return fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user': user }, body: JSON.stringify(body) });
}
async function get(url, user) {
  return fetch(BASE + url, { headers: { 'x-test-user': user } });
}
async function patch(url, body, user) {
  return fetch(BASE + url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-test-user': user }, body: JSON.stringify(body) });
}
async function del(url, user) {
  return fetch(BASE + url, { method: 'DELETE', headers: { 'x-test-user': user } });
}

// IDs will be populated by setupData
const IDS = {};

async function setupData() {
  // Zones
  const { rows: zones } = await pool.query(
    "INSERT INTO zones (name) VALUES ('Sala'), ('Terrazza'), ('Bar') RETURNING id, name");
  IDS.z = {}; for (const z of zones) IDS.z[z.name.toLowerCase()] = z.id;

  // Tables
  const { rows: tables } = await pool.query(`INSERT INTO tables (zone_id, table_number, seats) VALUES
    ($1, 'T1', 4), ($1, 'T2', 2), ($2, 'T3', 6), ($2, 'T4', 4), ($3, 'T5', 2) RETURNING id, table_number`,
    [IDS.z.sala, IDS.z.terrazza, IDS.z.bar]);
  IDS.t = {}; for (const t of tables) IDS.t[t.table_number.toLowerCase()] = t.id;

  // Users
  const { rows: users } = await pool.query(`INSERT INTO users (name, pin_hash, role) VALUES
    ('Marco Rossi', '$2b$10$aaaa', 'waiter'),
    ('Laura Bianchi', '$2b$10$bbbb', 'waiter'),
    ('Admin Boss', '$2b$10$cccc', 'admin'),
    ('Chef Antonio', '$2b$10$dddd', 'kitchen') RETURNING id, name, role`);
  IDS.u = {};
  for (const u of users) {
    if (u.name === 'Marco Rossi') IDS.u.w1 = u.id;
    if (u.name === 'Laura Bianchi') IDS.u.w2 = u.id;
    if (u.name === 'Admin Boss') IDS.u.admin = u.id;
    if (u.name === 'Chef Antonio') IDS.u.kitchen = u.id;
  }

  // Categories
  const { rows: cats } = await pool.query(`INSERT INTO categories (name, tax_rate, course_type, is_beverage) VALUES
    ('Antipasti', 10, 'antipasto', false),
    ('Primi Piatti', 10, 'primo', false),
    ('Secondi', 10, 'secondo', false),
    ('Contorni', 10, 'contorno', false),
    ('Dessert', 10, 'dessert', false),
    ('Bevande', 10, 'bevanda', true) RETURNING id, name`);
  IDS.c = {}; for (const c of cats) IDS.c[c.name.toLowerCase().replace(' piatti','')] = c.id;

  // Menu Items
  const { rows: items } = await pool.query(`INSERT INTO menu_items (category_id, name, base_price) VALUES
    ($1, 'Bruschetta Mista', 8.00), ($1, 'Caprese', 9.00),
    ($2, 'Carbonara', 12.00), ($2, 'Amatriciana', 11.00), ($2, 'Gricia', 11.00),
    ($3, 'Tagliata di Manzo', 18.00), ($3, 'Branzino al Forno', 16.00),
    ($4, 'Patate Arrosto', 5.00),
    ($5, 'Tiramisu', 7.00),
    ($6, 'Acqua Naturale', 3.00), ($6, 'Vino Rosso (calice)', 6.00), ($6, 'Birra Artigianale', 5.00)
    RETURNING id, name`,
    [IDS.c.antipasti, IDS.c.primi, IDS.c.secondi, IDS.c.contorni, IDS.c.dessert, IDS.c.bevande]);
  IDS.mi = {};
  for (const i of items) {
    const key = i.name.toLowerCase().split(' ')[0];
    IDS.mi[key] = i.id;
  }
}

// ── Test Suites ───────────────────────────────────────────────

async function testSuite1_FlussoPranzoCompleto() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║ SUITE 1: Flusso pranzo completo          ║');
  console.log('╚══════════════════════════════════════════╝');

  // Tavolo T1: 2 persone, pranzo classico
  // Antipasto → subito (P), Primo → dopo (A), Acqua → già al tavolo (C)
  console.log('\n--- Ordine T1: antipasto(P) + primo(A) + acqua(C) ---');
  let r = await post('/orders', {
    table_id: IDS.t.t1, covers: 2,
    items: [
      { menu_item_id: IDS.mi.bruschetta, quantity: 2, workflow_status: 'production' },
      { menu_item_id: IDS.mi.carbonara, quantity: 1, workflow_status: 'waiting' },
      { menu_item_id: IDS.mi.amatriciana, quantity: 1, workflow_status: 'waiting' },
      { menu_item_id: IDS.mi.acqua, quantity: 2, workflow_status: 'delivered' },
      { menu_item_id: IDS.mi.vino, quantity: 1, workflow_status: 'delivered' },
    ]
  }, WAITER);
  let d = await r.json();
  ok(r.status === 201, 'Ordine T1 creato');
  ok(d.items.length === 5, '5 items creati');

  const t1 = {
    orderId: d.id,
    bruschetta: d.items[0].id,
    carbonara: d.items[1].id,
    amatriciana: d.items[2].id,
    acqua: d.items[3].id,
    vino: d.items[4].id,
  };

  // Verifica stati
  ok(d.items[0].workflow_status === 'production', 'Bruschetta: production');
  ok(d.items[1].workflow_status === 'waiting', 'Carbonara: waiting');
  ok(d.items[2].workflow_status === 'waiting', 'Amatriciana: waiting');
  ok(d.items[3].workflow_status === 'delivered' && d.items[3].status === 'served', 'Acqua: delivered+served');
  ok(d.items[4].workflow_status === 'delivered' && d.items[4].status === 'served', 'Vino: delivered+served');
  ok(d.items[3].served_at !== null, 'Acqua: served_at settato');
  ok(d.items[0].inserted_by === IDS.u.w1, 'inserted_by = Marco Rossi');

  // Verifica totale ordine (include anche delivered)
  ok(parseFloat(d.total_amount) > 0, 'Total amount calcolato');
  const expectedTotal = 8*2 + 12 + 11 + 3*2 + 6; // 51
  ok(parseFloat(d.total_amount) === expectedTotal, `Totale corretto: ${expectedTotal}€`);

  // KDS: solo production
  console.log('\n--- KDS: filtra solo production ---');
  r = await get('/kds/pending', KITCHEN);
  d = await r.json();
  const kdsItems = d.flatMap(o => o.items);
  ok(kdsItems.length === 1, 'KDS: 1 item (bruschetta)');
  ok(kdsItems[0].name === 'Bruschetta Mista', 'KDS: Bruschetta');
  ok(kdsItems[0].workflow_status === 'production', 'KDS: workflow_status=production');
  ok(!kdsItems.some(i => i.name === 'Acqua Naturale'), 'KDS: no acqua (delivered)');
  ok(!kdsItems.some(i => i.name === 'Carbonara'), 'KDS: no carbonara (waiting)');

  // Monitor attese
  console.log('\n--- Monitor attese ---');
  r = await get('/workflow/waiting', WAITER);
  d = await r.json();
  ok(d.length === 1, '1 ordine con attese');
  ok(d[0].table_number === 'T1', 'Tavolo T1');
  ok(d[0].waiter_name === 'Marco Rossi', 'Cameriere: Marco');
  ok(d[0].items.length === 2, '2 items in attesa');
  ok(d[0].items.some(i => i.name === 'Carbonara'), 'Carbonara in attesa');
  ok(d[0].items.some(i => i.name === 'Amatriciana'), 'Amatriciana in attesa');
  ok(d[0].items[0].seconds_waiting >= 0, 'seconds_waiting calcolato');

  // Cucina prepara bruschetta: pending → cooking → ready
  console.log('\n--- Cucina prepara bruschetta ---');
  r = await patch('/kds/items/' + t1.bruschetta + '/status', { status: 'cooking' }, KITCHEN);
  ok(r.status === 200, 'Bruschetta: cooking');
  r = await patch('/kds/items/' + t1.bruschetta + '/status', { status: 'ready' }, KITCHEN);
  ok(r.status === 200, 'Bruschetta: ready');

  // Cameriere serve bruschetta
  r = await patch('/kds/items/' + t1.bruschetta + '/status', { status: 'served' }, WAITER);
  d = await r.json();
  ok(r.status === 200, 'Bruschetta: served');
  ok(d.served_at !== null, 'served_at settato');

  // Ora sblocca primi: A → P
  console.log('\n--- Sblocco primi: A → P ---');
  r = await patch('/workflow/items/' + t1.carbonara + '/status', { workflow_status: 'production' }, WAITER);
  d = await r.json();
  ok(r.status === 200, 'Carbonara: sbloccata');
  ok(d.workflow_status === 'production', 'Carbonara: production');
  ok(d.released_at !== null, 'released_at settato');
  ok(d.status === 'pending', 'status torna a pending');

  r = await patch('/workflow/items/' + t1.amatriciana + '/status', { workflow_status: 'production' }, WAITER);
  ok(r.status === 200, 'Amatriciana: sbloccata');

  // KDS ora mostra 2 primi
  r = await get('/kds/pending', KITCHEN);
  d = await r.json();
  const t1Kds = d.find(o => o.order_id === t1.orderId);
  ok(t1Kds?.items.length === 2, 'KDS: 2 items (carbonara + amatriciana)');

  // Monitor attese: vuoto per T1
  r = await get('/workflow/waiting', WAITER);
  d = await r.json();
  ok(d.length === 0, 'Monitor attese: vuoto');

  return t1;
}

async function testSuite2_IncrocioMultiTavolo(t1) {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║ SUITE 2: Incroci multi-tavolo            ║');
  console.log('╚══════════════════════════════════════════╝');

  // T2: ordina carbonara (stessa di T1)
  console.log('\n--- T2: ordina carbonara + gricia ---');
  let r = await post('/orders', {
    table_id: IDS.t.t2, covers: 2,
    items: [
      { menu_item_id: IDS.mi.carbonara, quantity: 2, workflow_status: 'production' },
      { menu_item_id: IDS.mi.gricia, quantity: 1, workflow_status: 'production' },
    ]
  }, WAITER2);
  let d = await r.json();
  ok(r.status === 201, 'Ordine T2 creato');
  const t2OrderId = d.id;

  // T3: ordina carbonara (ancora stessa)
  console.log('\n--- T3: ordina carbonara + tagliata ---');
  r = await post('/orders', {
    table_id: IDS.t.t3, covers: 4,
    items: [
      { menu_item_id: IDS.mi.carbonara, quantity: 3, workflow_status: 'production' },
      { menu_item_id: IDS.mi.tagliata, quantity: 2, workflow_status: 'waiting' },
    ]
  }, WAITER);
  d = await r.json();
  ok(r.status === 201, 'Ordine T3 creato');

  // Asporto con carbonara
  console.log('\n--- Asporto: carbonara ---');
  r = await post('/orders', {
    order_type: 'takeaway', customer_name: 'Cliente Delivery', customer_phone: '333111222',
    items: [
      { menu_item_id: IDS.mi.carbonara, quantity: 1, workflow_status: 'production' },
      { menu_item_id: IDS.mi.tiramisu, quantity: 1, workflow_status: 'production' },
    ]
  }, WAITER);
  ok(r.status === 201, 'Ordine asporto creato');

  // Verifica incroci
  console.log('\n--- Incroci ---');
  r = await get('/workflow/crossmatches', KITCHEN);
  d = await r.json();
  ok(d.length >= 1, 'Incroci trovati');

  const carboX = d.find(c => c.item_name === 'Carbonara');
  ok(!!carboX, 'Carbonara negli incroci');
  ok(parseInt(carboX.total_quantity) >= 7, `Qty totale Carbonara: ${carboX?.total_quantity} (atteso ≥7)`);
  ok(parseInt(carboX.order_count) >= 3, `Su ${carboX?.order_count} ordini (atteso ≥3)`);

  // Verifica dettaglio ordini nell'incrocio
  ok(Array.isArray(carboX.orders), 'orders e\' un array');
  ok(carboX.orders.length >= 3, 'Almeno 3 ordini elencati');
  const tableNumbers = carboX.orders.map(o => o.table_number);
  ok(tableNumbers.includes('T1'), 'Include T1');
  ok(tableNumbers.includes('T2'), 'Include T2');
  ok(tableNumbers.includes('T3'), 'Include T3');

  return t2OrderId;
}

async function testSuite3_AlertObbligatori() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║ SUITE 3: Alert obbligatori               ║');
  console.log('╚══════════════════════════════════════════╝');

  // Crea ordine con item in attesa E item servito (per triggerare alert)
  console.log('\n--- Ordine T4: antipasto(P) + secondo(A) ---');
  let r = await post('/orders', {
    table_id: IDS.t.t4, covers: 2,
    items: [
      { menu_item_id: IDS.mi.caprese, quantity: 2, workflow_status: 'production' },
      { menu_item_id: IDS.mi.branzino, quantity: 2, workflow_status: 'waiting' },
      { menu_item_id: IDS.mi.patate, quantity: 2, workflow_status: 'waiting' },
    ]
  }, WAITER);
  let d = await r.json();
  ok(r.status === 201, 'Ordine T4 creato');
  const t4Order = d.id;
  const caprese = d.items[0].id;
  const branzino = d.items[1].id;
  const patate = d.items[2].id;

  // Servi caprese per triggerare alert sulla portata successiva
  await patch('/kds/items/' + caprese + '/status', { status: 'cooking' }, KITCHEN);
  await patch('/kds/items/' + caprese + '/status', { status: 'ready' }, KITCHEN);
  await patch('/kds/items/' + caprese + '/status', { status: 'served' }, WAITER);

  // Inserisci alert manualmente (simulando il serviceTimer)
  await pool.query(
    `INSERT INTO service_alerts (id, order_item_id, alert_type, target_user_id, is_mandatory, table_number, waiter_name, item_name)
     VALUES ('a1e11111-0000-0000-0000-000000000001', $1, 'course_next', $2, true, 'T4', 'Marco Rossi', 'Branzino al Forno')`,
    [branzino, IDS.u.w1]
  );

  // Cameriere vede l'alert
  console.log('\n--- Alert pendenti ---');
  r = await get('/workflow/alerts/pending', WAITER);
  d = await r.json();
  ok(d.length >= 1, 'Almeno 1 alert pendente');
  const alert = d.find(a => a.order_item_id === branzino);
  ok(!!alert, 'Alert per branzino');
  ok(alert.is_mandatory === true, 'Alert obbligatorio');
  ok(alert.table_number === 'T4', 'Alert: tavolo T4');
  ok(alert.item_name === 'Branzino al Forno', 'Alert: Branzino');

  // Test RINVIO
  console.log('\n--- Rinvio alert (3 min) ---');
  r = await post('/workflow/alerts/a1e11111-0000-0000-0000-000000000001/respond', { action: 'defer', defer_minutes: 3 }, WAITER);
  d = await r.json();
  ok(r.status === 200, 'Rinvio OK');
  ok(d.status === 'deferred', 'Status: deferred');
  ok(d.minutes === 3, 'Rinviato di 3 min');
  ok(d.defer_count === 1, 'Defer count: 1');

  // Alert non appare piu' (postponed)
  r = await get('/workflow/alerts/pending', WAITER);
  d = await r.json();
  const stillPending = d.find(a => a.id === 'a1e11111-0000-0000-0000-000000000001');
  ok(!stillPending, 'Alert non visibile dopo rinvio');

  // Simula scadenza postpone
  await pool.query("UPDATE service_alerts SET postponed_until = NOW() - INTERVAL '1 minute' WHERE id = 'a1e11111-0000-0000-0000-000000000001'");

  // Alert riappare
  r = await get('/workflow/alerts/pending', WAITER);
  d = await r.json();
  const reappeared = d.find(a => a.id === 'a1e11111-0000-0000-0000-000000000001');
  ok(!!reappeared, 'Alert riappare dopo scadenza postpone');

  // Test LIBERA
  console.log('\n--- Libera alert (A → P) ---');
  r = await post('/workflow/alerts/a1e11111-0000-0000-0000-000000000001/respond', { action: 'release' }, WAITER);
  d = await r.json();
  ok(r.status === 200, 'Libera OK');
  ok(d.status === 'released', 'Status: released');

  // Verifica che branzino e' ora in production
  const { rows: [brItem] } = await pool.query('SELECT workflow_status, status, released_at FROM order_items WHERE id = $1', [branzino]);
  ok(brItem.workflow_status === 'production', 'Branzino: production');
  ok(brItem.status === 'pending', 'Branzino: pending');
  ok(brItem.released_at !== null, 'Branzino: released_at settato');

  // Alert non esiste piu'
  r = await get('/workflow/alerts/pending', WAITER);
  d = await r.json();
  ok(!d.find(a => a.id === 'a1e11111-0000-0000-0000-000000000001'), 'Alert non piu\' visibile dopo libera');

  // Verifica audit trail del rinvio + libera
  console.log('\n--- Audit trail alert ---');
  r = await get('/workflow/audit/' + t4Order, ADMIN);
  d = await r.json();
  const alertActions = d.filter(e => ['alert_deferred', 'alert_released'].includes(e.action));
  ok(alertActions.length >= 2, 'Audit: deferred + released presenti');
  const deferEntry = d.find(e => e.action === 'alert_deferred');
  ok(deferEntry?.metadata?.defer_minutes === 3, 'Audit: defer_minutes=3');
  ok(deferEntry?.user_name === 'Marco Rossi', 'Audit: user_name corretto');

  // Test: secondo rinvio con minuti custom
  await pool.query(
    `INSERT INTO service_alerts (id, order_item_id, alert_type, target_user_id, is_mandatory, table_number, item_name)
     VALUES ('a1e11111-0000-0000-0000-000000000002', $1, 'course_next', $2, true, 'T4', 'Patate Arrosto')`,
    [patate, IDS.u.w1]
  );
  r = await post('/workflow/alerts/a1e11111-0000-0000-0000-000000000002/respond', { action: 'defer', defer_minutes: 7 }, WAITER);
  d = await r.json();
  ok(r.status === 200, 'Rinvio custom 7min OK');
  ok(d.minutes === 7, '7 minuti');

  // Simula scadenza + libera
  await pool.query("UPDATE service_alerts SET postponed_until = NOW() - INTERVAL '1 minute' WHERE id = 'a1e11111-0000-0000-0000-000000000002'");
  r = await post('/workflow/alerts/a1e11111-0000-0000-0000-000000000002/respond', { action: 'release' }, WAITER);
  ok(r.status === 200, 'Patate liberate');

  return { t4Order, branzino, patate };
}

async function testSuite4_ConSegnatoDirecto(t1) {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║ SUITE 4: Consegnato diretto + alert      ║');
  console.log('╚══════════════════════════════════════════╝');

  // Aggiungi items come consegnato diretto a T1
  console.log('\n--- Aggiungi birra come Consegnato diretto ---');
  let r = await post('/orders/' + t1.orderId + '/items', {
    items: [
      { menu_item_id: IDS.mi.birra, quantity: 2, workflow_status: 'delivered' },
      { menu_item_id: IDS.mi.tiramisu, quantity: 1, workflow_status: 'delivered' },
    ]
  }, WAITER);
  let d = await r.json();
  ok(r.status === 201, 'Items aggiunti');
  ok(d[0].workflow_status === 'delivered', 'Birra: delivered');
  ok(d[0].status === 'served', 'Birra: status=served');
  ok(d[0].served_at !== null, 'Birra: served_at');
  ok(d[1].workflow_status === 'delivered', 'Tiramisu: delivered');

  // Alert admin
  console.log('\n--- Alert admin per consegnato diretto ---');
  r = await get('/workflow/alerts/direct-delivered', ADMIN);
  d = await r.json();
  ok(d.length >= 3, 'Almeno 3 alert (acqua+vino+birra+tiramisu da vari ordini)');
  ok(d.some(a => a.user_name === 'Marco Rossi'), 'Alert ha cameriere');

  // Verifica socket events emessi per direct-delivered
  const ddEvents = emittedEvents.filter(e => e.event === 'direct-delivered-alert');
  ok(ddEvents.length >= 2, 'Socket: direct-delivered-alert emessi');
  ok(ddEvents.some(e => e.data.itemName === 'Birra Artigianale'), 'Socket: alert birra');
  ok(ddEvents.some(e => e.target.includes('role:admin')), 'Socket: target include admin');

  // Verifica audit log
  console.log('\n--- Audit log consegnato diretto ---');
  r = await get('/workflow/audit/' + t1.orderId, ADMIN);
  d = await r.json();
  const ddAudit = d.filter(e => e.action === 'direct_delivered');
  ok(ddAudit.length >= 4, '4+ audit entries direct_delivered (acqua x2, vino, birra x2, tiramisu)');
  ok(ddAudit.every(e => e.user_name === 'Marco Rossi'), 'Tutti da Marco');

  // KDS non mostra items delivered
  r = await get('/kds/pending', KITCHEN);
  d = await r.json();
  const t1Kds = d.find(o => o.order_id === t1.orderId);
  if (t1Kds) {
    ok(!t1Kds.items.some(i => i.name === 'Birra Artigianale'), 'KDS: no birra (delivered)');
    ok(!t1Kds.items.some(i => i.name === 'Tiramisu'), 'KDS: no tiramisu (delivered)');
  } else {
    ok(true, 'KDS: T1 non presente (tutti items served/delivered)');
    ok(true, 'KDS: ok');
  }
}

async function testSuite5_CancellazioneAudit(t1) {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║ SUITE 5: Cancellazione + Audit           ║');
  console.log('╚══════════════════════════════════════════╝');

  // Cameriere tenta cancellazione via workflow
  console.log('\n--- Cameriere non puo\' cancellare ---');
  let r = await del('/workflow/items/' + t1.carbonara, WAITER);
  ok(r.status === 403, 'Cameriere: 403 su workflow/items');

  r = await del('/orders/' + t1.orderId + '/items/' + t1.carbonara, WAITER);
  ok(r.status === 403, 'Cameriere: 403 su orders/items');

  // Kitchen non puo' cancellare
  r = await del('/workflow/items/' + t1.carbonara, KITCHEN);
  ok(r.status === 403, 'Kitchen: 403');

  // Admin cancella
  console.log('\n--- Admin cancella carbonara ---');
  r = await del('/workflow/items/' + t1.carbonara, ADMIN);
  let d = await r.json();
  ok(r.status === 200, 'Admin: 200');
  ok(d.deleted === true, 'Item cancellato');

  // Verifica che l'item è cancelled nel DB
  const { rows: [item] } = await pool.query('SELECT status FROM order_items WHERE id = $1', [t1.carbonara]);
  ok(item.status === 'cancelled', 'DB: status=cancelled');

  // Audit log traccia la cancellazione
  console.log('\n--- Audit trail cancellazione ---');
  r = await get('/workflow/audit/' + t1.orderId, ADMIN);
  d = await r.json();
  const delAudit = d.filter(e => e.action === 'item_delete');
  ok(delAudit.length >= 1, 'Audit: item_delete presente');
  ok(delAudit[0].user_name === 'Admin Boss', 'Audit: cancellato da Admin');
  ok(delAudit[0].from_value !== null, 'Audit: from_value registrato');
  ok(delAudit[0].to_value === 'cancelled', 'Audit: to_value=cancelled');
  ok(delAudit[0].metadata?.item_name, 'Audit: metadata ha item_name');
  ok(delAudit[0].metadata?.quantity, 'Audit: metadata ha quantity');

  // Admin cancella via vecchia route
  r = await del('/orders/' + t1.orderId + '/items/' + t1.amatriciana, ADMIN);
  d = await r.json();
  ok(r.status === 200, 'Admin: cancella via orders route');
}

async function testSuite6_EdgeCases() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║ SUITE 6: Edge cases + sicurezza          ║');
  console.log('╚══════════════════════════════════════════╝');

  // Transizioni non valide
  console.log('\n--- Transizioni non valide ---');
  let r = await post('/orders', {
    table_id: IDS.t.t5, covers: 1,
    items: [
      { menu_item_id: IDS.mi.birra, quantity: 1, workflow_status: 'production' },
      { menu_item_id: IDS.mi.acqua, quantity: 1, workflow_status: 'waiting' },
      { menu_item_id: IDS.mi.vino, quantity: 1, workflow_status: 'delivered' },
    ]
  }, WAITER);
  let d = await r.json();
  const prodItem = d.items[0].id;
  const waitItem = d.items[1].id;
  const delItem = d.items[2].id;

  // P → A: bloccato
  r = await patch('/workflow/items/' + prodItem + '/status', { workflow_status: 'waiting' }, WAITER);
  ok(r.status === 400, 'P → A: bloccato');

  // C → P: bloccato
  r = await patch('/workflow/items/' + delItem + '/status', { workflow_status: 'production' }, WAITER);
  ok(r.status === 400, 'C → P: bloccato');

  // C → A: bloccato
  r = await patch('/workflow/items/' + delItem + '/status', { workflow_status: 'waiting' }, WAITER);
  ok(r.status === 400, 'C → A: bloccato');

  // A → C: bloccato (deve passare da P)
  r = await patch('/workflow/items/' + waitItem + '/status', { workflow_status: 'delivered' }, WAITER);
  ok(r.status === 400, 'A → C: bloccato');

  // Stato invalido
  r = await patch('/workflow/items/' + prodItem + '/status', { workflow_status: 'invalid' }, WAITER);
  ok(r.status === 400, 'Stato invalido: 400');

  // Doppio sblocco (A → P, poi di nuovo)
  console.log('\n--- Doppio sblocco ---');
  r = await patch('/workflow/items/' + waitItem + '/status', { workflow_status: 'production' }, WAITER);
  ok(r.status === 200, 'Primo sblocco OK');
  r = await patch('/workflow/items/' + waitItem + '/status', { workflow_status: 'production' }, WAITER);
  ok(r.status === 400, 'Doppio sblocco: bloccato (gia\' production)');

  // Workflow_status non specificato → default production
  console.log('\n--- Default workflow_status ---');
  r = await post('/orders', {
    table_id: IDS.t.t5, covers: 1,
    items: [{ menu_item_id: IDS.mi.birra, quantity: 1 }] // no workflow_status
  }, WAITER);
  d = await r.json();
  ok(d.items[0].workflow_status === 'production', 'Default: production');

  // Workflow_status invalido → default production
  r = await post('/orders', {
    table_id: IDS.t.t5, covers: 1,
    items: [{ menu_item_id: IDS.mi.birra, quantity: 1, workflow_status: 'INVALID' }]
  }, WAITER);
  d = await r.json();
  ok(d.items[0].workflow_status === 'production', 'Invalid → default production');

  // Alert con ID inesistente
  r = await post('/workflow/alerts/00000000-0000-0000-0000-000000000000/respond', { action: 'release' }, WAITER);
  ok(r.status === 404, 'Alert inesistente: 404');

  // Alert con action invalida
  await pool.query(
    "INSERT INTO service_alerts (id, order_item_id, alert_type, target_user_id, is_mandatory) VALUES ('a1e11111-0000-0000-0000-000000000003', $1, 'course_next', $2, true)",
    [prodItem, IDS.u.w1]
  );
  r = await post('/workflow/alerts/a1e11111-0000-0000-0000-000000000003/respond', { action: 'invalid' }, WAITER);
  ok(r.status === 400, 'Action invalida: 400');

  // Defer con minuti negativi → min 1
  r = await post('/workflow/alerts/a1e11111-0000-0000-0000-000000000003/respond', { action: 'defer', defer_minutes: -5 }, WAITER);
  d = await r.json();
  ok(d.minutes === 1, 'Defer negativo → minimo 1 min');

  // Defer con minuti troppi → max 30
  await pool.query("UPDATE service_alerts SET postponed_until = NULL, acknowledged = false WHERE id = 'a1e11111-0000-0000-0000-000000000003'");
  r = await post('/workflow/alerts/a1e11111-0000-0000-0000-000000000003/respond', { action: 'defer', defer_minutes: 999 }, WAITER);
  d = await r.json();
  ok(d.minutes === 30, 'Defer 999 → max 30 min');

  // Item inesistente
  r = await patch('/workflow/items/00000000-0000-0000-0000-000000000000/status', { workflow_status: 'production' }, WAITER);
  ok(r.status === 404, 'Item inesistente: 404');

  // Audit log per ordine inesistente
  r = await get('/workflow/audit/00000000-0000-0000-0000-000000000000', ADMIN);
  d = await r.json();
  ok(Array.isArray(d) && d.length === 0, 'Audit ordine inesistente: array vuoto');
}

async function testSuite7_SocketEvents() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║ SUITE 7: Socket events                   ║');
  console.log('╚══════════════════════════════════════════╝');

  // Verifica eventi socket emessi durante tutti i test
  console.log('\n--- Verifica eventi socket ---');
  const eventTypes = [...new Set(emittedEvents.map(e => e.event))];
  ok(eventTypes.includes('new-order'), 'Socket: new-order emesso');
  ok(eventTypes.includes('table-status-changed'), 'Socket: table-status-changed emesso');
  ok(eventTypes.includes('order-item-added'), 'Socket: order-item-added emesso');
  ok(eventTypes.includes('item-status-updated'), 'Socket: item-status-updated emesso');
  ok(eventTypes.includes('workflow-status-changed'), 'Socket: workflow-status-changed emesso');
  ok(eventTypes.includes('item-released-to-production'), 'Socket: item-released-to-production emesso');
  ok(eventTypes.includes('direct-delivered-alert'), 'Socket: direct-delivered-alert emesso');

  // Verifica payload workflow-status-changed
  const wfEvents = emittedEvents.filter(e => e.event === 'workflow-status-changed');
  ok(wfEvents.length >= 2, `Socket: ${wfEvents.length} workflow changes`);
  ok(wfEvents.every(e => e.data.orderId && e.data.itemId && e.data.from && e.data.to), 'Socket: payload completo');

  // Verifica target direct-delivered-alert (deve andare a admin/manager)
  const ddAlertEvents = emittedEvents.filter(e => e.event === 'direct-delivered-alert');
  ok(ddAlertEvents.every(e => e.target.includes('role:admin')), 'Socket: direct-delivered target admin');
}

// ── Main ──────────────────────────────────────────────────────
(async () => {
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  BASE = 'http://localhost:' + server.address().port;

  try {
    await setupData();

    // Set user headers now that we have IDs
    WAITER = JSON.stringify({ id: IDS.u.w1, name: 'Marco Rossi', role: 'waiter' });
    WAITER2 = JSON.stringify({ id: IDS.u.w2, name: 'Laura Bianchi', role: 'waiter' });
    ADMIN = JSON.stringify({ id: IDS.u.admin, name: 'Admin Boss', role: 'admin' });
    KITCHEN = JSON.stringify({ id: IDS.u.kitchen, name: 'Chef Antonio', role: 'kitchen' });

    const t1 = await testSuite1_FlussoPranzoCompleto();
    await testSuite2_IncrocioMultiTavolo(t1);
    await testSuite3_AlertObbligatori();
    await testSuite4_ConSegnatoDirecto(t1);
    await testSuite5_CancellazioneAudit(t1);
    await testSuite6_EdgeCases();
    await testSuite7_SocketEvents();

    console.log('\n╔══════════════════════════════════════════╗');
    console.log(`║ RISULTATI: ${String(passed).padStart(3)} passati, ${String(failed).padStart(3)} falliti, ${String(totalTests).padStart(3)} totali ║`);
    console.log('╚══════════════════════════════════════════╝');

    if (failed > 0) {
      console.log(`\n⚠️  ${failed} test falliti — verificare!\n`);
    } else {
      console.log('\n🎉 TUTTI I TEST PASSATI!\n');
    }
  } catch (err) {
    console.error('\nFATAL:', err);
    failed++;
  } finally {
    server.close();
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
