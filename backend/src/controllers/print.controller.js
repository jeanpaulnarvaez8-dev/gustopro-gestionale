// ---------------------------------------------------------------------------
// Print queue (JP 2026-06-03).
//
// La stampante .24 al Riva e' un print-server TP808 raw socket 9100, dietro
// NAT della LAN ristorante. Il VPS pubblico NON puo' raggiungerla. Il
// browser PWA (HTTPS) NON puo' aprire TCP raw, e mixed-content blocca un
// proxy HTTP locale.
//
// Soluzione: un agente locale (script bash/node sul Mac di JP, vedi
// scripts/print-agent.sh) fa polling al backend ogni 2s. Quando arriva un
// nuovo job, scarica i byte ESC/POS (endpoint /public/preconto-escpos) e li
// pipe-a alla stampante via nc.
//
// Coda: in-memory per tenant (LRU 100). Se il backend riparte la coda si
// perde — ok per preconto, JP rifa con un click.
// ---------------------------------------------------------------------------
const crypto = require('crypto');
const pool = require('../config/db');

const TENANT = (req) => req.user?.tenant_id || req.tenantId;
const MAX_PER_TENANT = 100;

// Map<tenant_id, Array<{id, kind, order_id, created_by, created_at}>>
const queues = new Map();

function pushJob(tenant_id, job) {
  if (!queues.has(tenant_id)) queues.set(tenant_id, []);
  const arr = queues.get(tenant_id);
  arr.push(job);
  while (arr.length > MAX_PER_TENANT) arr.shift();
}
function drain(tenant_id) {
  const arr = queues.get(tenant_id) || [];
  queues.set(tenant_id, []);
  return arr;
}

// JP 2026-06-05: dedup per evitare 20 stampe del tavolo 3. Se il cassa
// clicca "Stampa preconto" piu' volte di fila, ignora i click ravvicinati.
// Map<`${tenant_id}:${order_id}`, last_ms>. TTL 5s, pulizia opportunista.
const _lastPrecontoEmit = new Map();
const PRECONTO_DEDUP_MS = 5000;

// JP 2026-06-08: stampa di prova su uno dei target (bar / sala / pass /
// cucina). Utile per testare connettività con stampanti dopo
// spostamenti/cambio cavi. body: { target: 'pass'|'bar'|'sala'|'cucina',
// table_number?, name?, quantity? }
async function enqueueTestPrint(req, res, next) {
  try {
    const tenant_id = TENANT(req);
    const { target = 'pass', table_number = 'TEST', name = 'STAMPA DI PROVA', quantity = 1 } = req.body || {};
    if (!['pass', 'pizza-pass', 'bar', 'sala', 'cucina'].includes(target)) {
      return res.status(400).json({ error: `target invalid: ${target}` });
    }
    let job;
    if (target === 'pass' || target === 'pizza-pass') {
      job = enqueuePassTicketJob(tenant_id, null, null, {
        table_number: String(table_number),
        name: String(name),
        quantity: Number(quantity),
      }, target);
    } else if (target === 'bar') {
      job = enqueueBarPassJob(tenant_id, null, {
        table_number: String(table_number),
        items: [{ name: String(name), quantity: Number(quantity) }],
      });
    } else if (target === 'cucina') {
      job = enqueueKitchenPassJob(tenant_id, null, null, {
        table_number: String(table_number),
        items: [{ name: String(name), quantity: Number(quantity) }],
      });
    } else {
      // sala: tipo preconto su .24. Non c'e' endpoint kind dedicato a
      // 'bytes raw' — la stampa di prova sala fa solo un emit log per
      // verificare connettivita' agent → coda → backend. Non emette
      // job che porti a stampa sulla .24 (mancherebbero dati preconto).
      return res.status(400).json({ error: 'Test sala non disponibile (richiede order_id reale)' });
    }
    res.json({ enqueued: true, job });
  } catch (err) { next(err); }
}

// POST /api/print/enqueue  — autenticato (admin/manager/cassa/waiter)
// body: { kind: 'preconto', order_id }
async function enqueuePrintJob(req, res, next) {
  try {
    const tenant_id = TENANT(req);
    const { kind = 'preconto', order_id } = req.body || {};
    if (!['preconto'].includes(kind)) {
      return res.status(400).json({ error: `kind '${kind}' non supportato` });
    }
    if (!/^[0-9a-f-]{36}$/i.test(String(order_id || ''))) {
      return res.status(400).json({ error: 'order_id non valido' });
    }
    // Guard: l'ordine appartiene davvero a questo tenant?
    // JP 2026-06-07: include order_type per routing preconto su
    // stampante diversa (asporti → bar .21, tavoli → sala .24).
    const { rows: [o] } = await pool.query(
      `SELECT id, tenant_id, order_type FROM orders WHERE id = $1`,
      [order_id]
    );
    if (!o || o.tenant_id !== tenant_id) {
      return res.status(404).json({ error: 'ordine non trovato' });
    }
    // Dedup: stesso ordine, stessa cassa, in meno di 5s → respond 200 ma
    // senza enqueueare. Risponde "deduplicated" cosi' il frontend non
    // pensa che sia fallito.
    const dedupKey = `${tenant_id}:${order_id}`;
    const now = Date.now();
    const lastEmit = _lastPrecontoEmit.get(dedupKey) || 0;
    if (now - lastEmit < PRECONTO_DEDUP_MS) {
      return res.json({ enqueued: false, deduplicated: true, retry_in_ms: PRECONTO_DEDUP_MS - (now - lastEmit) });
    }
    _lastPrecontoEmit.set(dedupKey, now);
    // Pulizia opportunista entries vecchie (>30s) per non lasciar crescere
    // la map all'infinito durante la vita del processo.
    if (_lastPrecontoEmit.size > 200) {
      for (const [k, t] of _lastPrecontoEmit.entries()) {
        if (now - t > 30_000) _lastPrecontoEmit.delete(k);
      }
    }
    // JP 2026-06-07: routing destinazione. Asporti → BAR (.21) perche'
    // Alessandra ritira lì. Tavoli → SALA (.24) come prima.
    const target = o.order_type === 'takeaway' ? 'bar' : 'sala';
    const job = {
      id: crypto.randomUUID(),
      kind,
      order_id,
      target,                            // 'bar' | 'sala'
      created_by: req.user?.id || null,
      created_at: new Date().toISOString(),
    };
    pushJob(tenant_id, job);
    res.json({ enqueued: true, job });
  } catch (err) { next(err); }
}

// GET /api/print/pending/:tenant_slug
// Headers: X-Print-Token: <PRINT_AGENT_TOKEN>
// Pubblico ma protetto da token statico (agent → backend, no JWT).
// Drena tutta la coda del tenant.
async function getPendingJobs(req, res, next) {
  try {
    const token = req.headers['x-print-token'];
    const expected = process.env.PRINT_AGENT_TOKEN;
    if (!expected) return res.status(503).json({ error: 'agent token non configurato sul server' });
    if (!token || token !== expected) return res.status(401).json({ error: 'token non valido' });

    const slug = String(req.params.tenant_slug || '').toLowerCase().trim();
    if (!slug) return res.status(400).json({ error: 'tenant_slug richiesto' });
    const { rows: [t] } = await pool.query(
      `SELECT id FROM tenants WHERE slug = $1 AND is_active = true`,
      [slug]
    );
    if (!t) return res.status(404).json({ error: 'tenant non trovato' });

    const jobs = drain(t.id);
    res.json({ jobs, drained_at: new Date().toISOString() });
  } catch (err) { next(err); }
}

// GET /api/print/queue-size  — debug/diag, autenticato
async function getQueueSize(req, res, next) {
  try {
    const tenant_id = TENANT(req);
    res.json({ size: (queues.get(tenant_id) || []).length });
  } catch (err) { next(err); }
}

// JP 2026-06-08: ticket PASS (.102 Epson TM-m30II). Stampato ogni volta
// che un piatto diventa 'ready' in cucina. Il foglio singolo (1 piatto
// = 1 foglio) viene appeso al gancio del pass, il cameriere lo prende
// + il piatto fisico e va al tavolo. Formato semplicissimo: TAV X
// gigante + nome piatto.
//   payload: { table_number, name, quantity }
//
// JP 2026-06-09: parametro target opzionale per routing pizza-pass (.25,
// stampante dedicata pizze/panini). Default 'pass' → .102 standard.
function enqueuePassTicketJob(tenantId, orderId, itemId, payload, target = 'pass') {
  const job = {
    id: crypto.randomUUID(),
    kind: 'pass-ticket',
    order_id: orderId,
    item_id: itemId,
    target,            // 'pass' | 'pizza-pass'
    payload,
    created_at: new Date().toISOString(),
  };
  pushJob(tenantId, job);
  return job;
}

// JP 2026-06-04: enqueue job FISCALE (Custom Q3X-F). Payload completo
// strutturato (items + IVA + metodo pagamento). L'agent locale lo
// traduce in protocollo Custom Q3X e dialoga con la RT via TCP.
function enqueueFiscalJob(tenantId, orderId, payload) {
  const job = {
    id: crypto.randomUUID(),
    kind: 'fiscal',
    order_id: orderId,
    payload,
    created_at: new Date().toISOString(),
  };
  pushJob(tenantId, job);
  return job;
}

// JP 2026-06-05: ticket cucina su START. Stampa Q3X-F (.23) non-fiscale.
// Payload: { table_number, items: [{name, quantity}, ...] }.
function enqueueKitchenPassJob(tenantId, orderId, itemId, payload) {
  const job = {
    id: crypto.randomUUID(),
    kind: 'kitchen-pass',
    order_id: orderId,
    item_id: itemId,
    payload,
    created_at: new Date().toISOString(),
  };
  pushJob(tenantId, job);
  return job;
}

// JP 2026-06-05: debounce per ordine. Il chef preme START su un piatto →
// timer 2.5s. Se preme START su altri piatti dello stesso tavolo entro
// il timer, lo prolunga. Allo scadere, il ticket include TUTTI i piatti
// del tavolo gia' rilasciati alle stazioni (workflow_status='production'),
// non solo quelli che il chef ha avviato in questa sessione — cosi' il
// chef ha sempre il quadro completo del tavolo davanti.
const _kitchenDebounce = new Map();
// JP 2026-06-05: aumentato a 4s per assorbire INIZIA TAVOLO + chef START
// immediatamente successivi in UN SOLO ticket. Prima 2.5s lasciava uscire
// 2 stampe quando il chef premeva START subito dopo l'INIZIA TAVOLO.
const KITCHEN_DEBOUNCE_MS = 4000;

function scheduleKitchenTicket(tenantId, orderId /* itemId ignorato */) {
  let entry = _kitchenDebounce.get(orderId);
  if (entry) clearTimeout(entry.timeoutId);
  else entry = { tenantId, timeoutId: null };
  entry.timeoutId = setTimeout(async () => {
    _kitchenDebounce.delete(orderId);
    try {
      // JP 2026-06-11: per gli ASPORTI la comanda cucina deve mostrare il
      // NOME DEL CLIENTE in cima (non "TAV ASPORTO") — con tanti asporti
      // insieme non si capisce di chi e' il piatto. Aggiungo customer_name
      // + is_takeaway al payload; l'agent decide il titolo del ticket.
      const { rows: [hdr] } = await pool.query(
        `SELECT COALESCE(t.table_number, 'ASPORTO') AS table_number,
                o.customer_name,
                (o.order_type = 'takeaway') AS is_takeaway
           FROM orders o LEFT JOIN tables t ON t.id = o.table_id
          WHERE o.id = $1 AND o.tenant_id = $2`,
        [orderId, entry.tenantId]
      );
      // Tutti i piatti dell'ordine attualmente "in cucina" (production,
      // non ancora serviti/cancellati). Include sia i pending sia i
      // cooking sia i ready: il chef vuole vedere TUTTO il tavolo.
      const { rows: items } = await pool.query(
        `SELECT COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS name,
                oi.quantity, oi.notes,
                COALESCE(mi.prep_station, c.prep_station, 'cucina') AS prep_station
           FROM order_items oi
           LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
           LEFT JOIN categories c ON c.id = mi.category_id
          WHERE oi.order_id = $1 AND oi.tenant_id = $2
            AND oi.workflow_status = 'production'
            AND oi.status NOT IN ('served', 'cancelled')
            AND COALESCE(oi.is_surcharge, false) = false
            -- JP 2026-06-13: le BEVANDE e gli item che vanno al BAR non
            -- escono sulla comanda CUCINA (.23): stampano gia' al bar (.21).
            -- Prima Spritz/birre finivano anche sulla comanda della cucina.
            AND COALESCE(c.is_beverage, false) = false
            AND COALESCE(mi.goes_to_bar, c.goes_to_bar, false) = false
          ORDER BY name, oi.id`,
        [orderId, entry.tenantId]
      );
      if (hdr && items.length > 0) {
        // JP 2026-06-13: includo le NOTE del cliente (es. "senza crudo")
        // cosi' cucina/pizzeria le vedono sulla comanda.
        const mkItems = (arr) => arr.map(it => ({
          name: String(it.name),
          quantity: Number(it.quantity || 1),
          notes: it.notes || null,
        }));
        const base = {
          table_number: String(hdr.table_number),
          customer_name: hdr.customer_name || null,
          is_takeaway: hdr.is_takeaway || false,
        };
        // JP 2026-06-13: la comanda dei piatti "pizzeria" (pucce, pizze,
        // panini) esce alla PIZZA-PASS .25 dove sta il paninaro; il resto
        // alla cucina .23. L'agent instrada in base a payload.station.
        const pizzeria = items.filter(it => it.prep_station === 'pizzeria');
        const cucina   = items.filter(it => it.prep_station !== 'pizzeria');
        if (cucina.length > 0) {
          enqueueKitchenPassJob(entry.tenantId, orderId, null, { ...base, items: mkItems(cucina) });
        }
        if (pizzeria.length > 0) {
          enqueueKitchenPassJob(entry.tenantId, orderId, null, { ...base, station: 'pizzeria', items: mkItems(pizzeria) });
        }
      }
    } catch (e) {
      console.error('[scheduleKitchenTicket] failed:', e.message);
    }
  }, KITCHEN_DEBOUNCE_MS);
  _kitchenDebounce.set(orderId, entry);
}

// JP 2026-06-03: helper esportato per usi server-to-server (auto-print
// chiamato da createOrder/addItems dopo gli insert).
function enqueueAutoPrintJob(tenantId, orderId, itemIds) {
  if (!itemIds || itemIds.length === 0) return null;
  const job = {
    id: crypto.randomUUID(),
    kind: 'auto',
    order_id: orderId,
    item_ids: itemIds,
    created_at: new Date().toISOString(),
  };
  pushJob(tenantId, job);
  return job;
}

// JP 2026-06-05: BAR @ 192.168.1.21. Quando il cameriere manda un ordine
// con cocktail/birra/vino/caffe' eccetera, deve uscire UNA stampa al bar
// con tutto quello che il bar deve preparare (TAV X + lista bevande).
// L'acqua resta sulla preconto sala (.24) com'era. Sorbetto al limone va
// al bar (override su menu_items.goes_to_bar=true).
function enqueueBarPassJob(tenantId, orderId, payload) {
  const job = {
    id: crypto.randomUUID(),
    kind: 'bar-pass',
    order_id: orderId,
    payload,
    created_at: new Date().toISOString(),
  };
  pushJob(tenantId, job);
  return job;
}

// Debounce breve (800ms) per aggregare item bar di UN SINGOLO INVIO
// cameriere. Se il cameriere manda Spritz + Negroni + Acqua + Pasta in una
// botta, il bar deve vedere [Spritz, Negroni] in un ticket. Niente
// accumulo cross-invio (se 30min dopo manda un altro caffe', e' un
// secondo ticket separato).
const _barDebounce = new Map();
const BAR_DEBOUNCE_MS = 800;
// itemIds inviati in questa "finestra" — al fire del timer, query DB per
// risolvere nomi/quantita e produrre il payload aggregato.
function scheduleBarTicket(tenantId, orderId, newItemIds) {
  let entry = _barDebounce.get(orderId);
  if (entry) clearTimeout(entry.timeoutId);
  else entry = { tenantId, itemIds: new Set(), timeoutId: null };
  for (const id of newItemIds || []) entry.itemIds.add(id);
  entry.timeoutId = setTimeout(async () => {
    _barDebounce.delete(orderId);
    try {
      const ids = Array.from(entry.itemIds);
      if (ids.length === 0) return;
      const { rows: [hdr] } = await pool.query(
        `SELECT COALESCE(t.table_number, 'ASPORTO') AS table_number
           FROM orders o LEFT JOIN tables t ON t.id = o.table_id
          WHERE o.id = $1 AND o.tenant_id = $2`,
        [orderId, entry.tenantId]
      );
      // Solo gli item appena inseriti, no aggregazione retroattiva.
      // Filtra ulteriormente su goes_to_bar effettivo (override item ||
      // category) per essere a prova di bug client-side.
      const { rows: items } = await pool.query(
        `SELECT COALESCE(mi.name, oi.combo_menu_name, 'Bevanda') AS name,
                oi.quantity, oi.notes
           FROM order_items oi
           LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
           LEFT JOIN categories c ON c.id = mi.category_id
          WHERE oi.id = ANY($1::uuid[])
            AND oi.tenant_id = $2
            AND oi.status NOT IN ('cancelled')
            AND COALESCE(oi.is_surcharge, false) = false
            AND COALESCE(mi.goes_to_bar, c.goes_to_bar, false) = true
          ORDER BY name`,
        [ids, entry.tenantId]
      );
      if (hdr && items.length > 0) {
        enqueueBarPassJob(entry.tenantId, orderId, {
          table_number: String(hdr.table_number),
          items: items.map(it => ({
            name: String(it.name),
            quantity: Number(it.quantity || 1),
            notes: it.notes || null,
          })),
        });
      }
    } catch (e) {
      console.error('[scheduleBarTicket] failed:', e.message);
    }
  }, BAR_DEBOUNCE_MS);
  _barDebounce.set(orderId, entry);
}

// JP 2026-06-12: ASPORTI PRE-PAGATI. Al pagamento di un asporto, gli item
// 'waiting' (held) partono → 'production' e si attivano TUTTE le stampe che
// alla creazione erano state soppresse: comanda cucina (.23), bar-pass (.21),
// auto-print (.24). Chiamata da billing.controller.processPayment dopo il
// commit del pagamento. Idempotente: se non ci sono item waiting, no-op.
async function fireTakeawayItems(tenantId, orderId) {
  // 1. waiting → production (esclude surcharge/voci libere)
  const { rows: fired } = await pool.query(
    `UPDATE order_items
        SET workflow_status = 'production', released_at = NOW(), fire_at = NULL,
            is_manual_hold = false
      WHERE order_id = $1 AND tenant_id = $2
        AND workflow_status = 'waiting'
        AND COALESCE(is_surcharge, false) = false
        AND status NOT IN ('cancelled')
      RETURNING id`,
    [orderId, tenantId]
  );
  if (fired.length === 0) return { fired: 0 };

  // 2. classifica gli item appena partiti: bar / auto-print
  const ids = fired.map(f => f.id);
  const { rows: cls } = await pool.query(
    `SELECT oi.id,
            COALESCE(mi.goes_to_bar, c.goes_to_bar, false) AS goes_to_bar,
            COALESCE(mi.auto_print,  c.auto_print,  false) AS auto_print
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c  ON c.id = mi.category_id
      WHERE oi.id = ANY($1::uuid[]) AND oi.tenant_id = $2`,
    [ids, tenantId]
  );
  const barIds  = cls.filter(r => r.goes_to_bar).map(r => r.id);
  const autoIds = cls.filter(r => r.auto_print).map(r => r.id);

  // 3. fai partire le stampe (stesse usate da createOrder/dispatchOrder)
  try { scheduleKitchenTicket(tenantId, orderId); } catch (e) { console.error('[fireTakeaway] kitchen', e.message); }
  if (barIds.length)  { try { scheduleBarTicket(tenantId, orderId, barIds); } catch (e) { console.error('[fireTakeaway] bar', e.message); } }
  if (autoIds.length) { try { enqueueAutoPrintJob(tenantId, orderId, autoIds); } catch (e) { console.error('[fireTakeaway] auto', e.message); } }

  return { fired: fired.length, bar: barIds.length, auto: autoIds.length };
}

module.exports = { enqueuePrintJob, enqueueTestPrint, getPendingJobs, getQueueSize, enqueueAutoPrintJob, enqueueFiscalJob, enqueueKitchenPassJob, scheduleKitchenTicket, enqueueBarPassJob, scheduleBarTicket, enqueuePassTicketJob, fireTakeawayItems };
