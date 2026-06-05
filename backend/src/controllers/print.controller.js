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
    const { rows: [o] } = await pool.query(
      `SELECT id, tenant_id FROM orders WHERE id = $1`,
      [order_id]
    );
    if (!o || o.tenant_id !== tenant_id) {
      return res.status(404).json({ error: 'ordine non trovato' });
    }
    const job = {
      id: crypto.randomUUID(),
      kind,
      order_id,
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
const KITCHEN_DEBOUNCE_MS = 2500;

function scheduleKitchenTicket(tenantId, orderId /* itemId ignorato */) {
  let entry = _kitchenDebounce.get(orderId);
  if (entry) clearTimeout(entry.timeoutId);
  else entry = { tenantId, timeoutId: null };
  entry.timeoutId = setTimeout(async () => {
    _kitchenDebounce.delete(orderId);
    try {
      const { rows: [hdr] } = await pool.query(
        `SELECT COALESCE(t.table_number, 'ASPORTO') AS table_number
           FROM orders o LEFT JOIN tables t ON t.id = o.table_id
          WHERE o.id = $1 AND o.tenant_id = $2`,
        [orderId, entry.tenantId]
      );
      // Tutti i piatti dell'ordine attualmente "in cucina" (production,
      // non ancora serviti/cancellati). Include sia i pending sia i
      // cooking sia i ready: il chef vuole vedere TUTTO il tavolo.
      const { rows: items } = await pool.query(
        `SELECT COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS name,
                oi.quantity
           FROM order_items oi
           LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
          WHERE oi.order_id = $1 AND oi.tenant_id = $2
            AND oi.workflow_status = 'production'
            AND oi.status NOT IN ('served', 'cancelled')
            AND COALESCE(oi.is_surcharge, false) = false
          ORDER BY name`,
        [orderId, entry.tenantId]
      );
      if (hdr && items.length > 0) {
        enqueueKitchenPassJob(entry.tenantId, orderId, null, {
          table_number: String(hdr.table_number),
          items: items.map(it => ({
            name: String(it.name),
            quantity: Number(it.quantity || 1),
          })),
        });
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

module.exports = { enqueuePrintJob, getPendingJobs, getQueueSize, enqueueAutoPrintJob, enqueueFiscalJob, enqueueKitchenPassJob, scheduleKitchenTicket };
