// ────────────────────────────────────────────────────────────────────
// fiscal.controller.js — JP 2026-06-04
//
// Emissione scontrino fiscale RT (Custom Q3X-F al Riva). Flusso:
//   1. Cassiere/admin preme "Paga CARTA" su CheckoutPage
//   2. Backend carica ordine + items raggruppati per aliquota IVA
//   3. Genera job kind='fiscal' con payload completo
//   4. Agent locale (fiscal-agent.js) polla, costruisce protocollo
//      Custom Q3X e invia via TCP alla RT (IP + porta da env)
//   5. RT stampa scontrino fiscale numerato/firmato e invia i
//      corrispettivi all'Agenzia Entrate entro 12 giorni in auto.
//   6. Agent ritorna il numero documento → backend marca ordine
//      completed + payment_status=paid + receipts row con dati RT
//
// NOTA: il payload XML/binario Custom Q3X-F va finalizzato con
// l'IP della stampante + manuale comandi forniti dal tecnico
// PdiEsse (0832 231105). Il backend qui costruisce un PAYLOAD
// STRUTTURATO che l'agent traduce nel protocollo nativo Custom.
// ────────────────────────────────────────────────────────────────────
const pool = require('../config/db');
const { enqueueFiscalJob } = require('./print.controller');

const TENANT = (req) => req.user?.tenant_id || req.tenantId;

async function emitFiscal(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const { order_id, payment_method = 'card', amount } = req.body || {};
    if (!/^[0-9a-f-]{36}$/i.test(String(order_id || ''))) {
      return res.status(400).json({ error: 'order_id non valido' });
    }
    if (!['card', 'cash', 'digital', 'ticket'].includes(payment_method)) {
      return res.status(400).json({ error: 'payment_method non supportato' });
    }
    // Tenant ownership
    const { rows: [o] } = await pool.query(
      `SELECT o.id, o.covers, o.total_amount, o.order_type,
              o.customer_name, o.created_at,
              COALESCE(tb.table_number::text, 'Asporto') AS table_number,
              t.name AS restaurant_name, t.fiscal_data,
              COALESCE(t.coperto_price, 0)::numeric AS coperto_price
         FROM orders o
         JOIN tenants t ON t.id = o.tenant_id
         LEFT JOIN tables tb ON tb.id = o.table_id
        WHERE o.id = $1 AND o.tenant_id = $2 AND o.status = 'open'`,
      [order_id, tenantId]
    );
    if (!o) return res.status(404).json({ error: 'Ordine non trovato o gia\' chiuso' });

    // Items con aliquota IVA effettiva (override mi.tax_rate o c.tax_rate
    // o fallback 10% per food / 22% alcolici).
    const { rows: items } = await pool.query(
      `SELECT mi.name, oi.quantity, oi.unit_price, oi.subtotal,
              COALESCE(mi.tax_rate, c.tax_rate, 10) AS tax_rate,
              COALESCE(c.is_beverage, false) AS is_beverage
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         LEFT JOIN categories c ON c.id = mi.category_id
        WHERE oi.order_id = $1 AND oi.status <> 'cancelled'`,
      [order_id]
    );

    const isTakeaway = o.order_type === 'takeaway';
    const itemsSum = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);
    const copertoTot = isTakeaway ? 0 : Number(o.coperto_price || 0) * Number(o.covers || 0);
    const grandTotal = Number((itemsSum + copertoTot).toFixed(2));

    // Sanity check importo (frontend manda amount per controllo doppio)
    if (amount !== undefined && Math.abs(Number(amount) - grandTotal) > 0.05) {
      return res.status(400).json({
        error: `Importo non corrisponde (atteso ${grandTotal.toFixed(2)}, ricevuto ${Number(amount).toFixed(2)})`,
      });
    }

    // Payload strutturato per agent (poi tradotto in protocollo Custom Q3X)
    const payload = {
      restaurant: o.restaurant_name,
      fiscal_data: o.fiscal_data || {},
      table_number: o.table_number,
      customer_name: o.customer_name || null,
      order_type: o.order_type,
      covers: Number(o.covers || 0),
      coperto_price: Number(o.coperto_price || 0),
      coperto_total: copertoTot,
      payment_method,
      total: grandTotal,
      items: items.map(it => ({
        name: String(it.name),
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        subtotal: Number(it.subtotal),
        tax_rate: Number(it.tax_rate),
      })),
    };

    const job = enqueueFiscalJob(tenantId, order_id, payload);
    res.json({ enqueued: true, job });
  } catch (err) { next(err); }
}

module.exports = { emitFiscal };
