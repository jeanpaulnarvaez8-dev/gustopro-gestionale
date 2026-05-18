/**
 * Day Close — chiusura cassa fine giornata ("Z report" non fiscale).
 *
 * NON e' uno scontrino fiscale (richiede RT certificato AdE, fuori scope).
 * E' uno snapshot totali della giornata + audit + riconciliazione fisica.
 *
 * Flow:
 *   1. GET /admin/day-close/preview?date=YYYY-MM-DD&register=X
 *      → calcola totali correnti senza creare nulla. Mostra al cassiere
 *        cosa verra' sigillato.
 *   2. POST /admin/day-close { date, register, physical_cash?, notes? }
 *      → crea record in day_closures (idempotent: UNIQUE per data+register).
 *        Calcola variance_cash = physical - total_cash.
 *   3. GET /admin/day-close/list?days=30 → storico ultime chiusure.
 */
const pool = require('../config/db');

const TENANT = (req) => req.tenant.id;

// Aggrega i totali per una data Europe/Rome + register opzionale.
async function aggregateDay(tenantId, businessDate, register) {
  const params = [tenantId, businessDate];
  let regFilter = '';
  if (register) {
    regFilter = ' AND p.register = $3';
    params.push(register);
  } else {
    regFilter = ''; // null = include tutto (anche register NULL)
  }
  const q = `
    SELECT
      COALESCE(SUM(p.amount), 0)::numeric(12,2) AS total_amount,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method = 'cash'),    0)::numeric(12,2) AS total_cash,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method = 'card'),    0)::numeric(12,2) AS total_card,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method = 'digital'), 0)::numeric(12,2) AS total_digital,
      COALESCE(SUM(p.amount) FILTER (
        WHERE p.payment_method NOT IN ('cash','card','digital')
      ), 0)::numeric(12,2) AS total_other,
      COUNT(*)::int AS num_payments,
      COUNT(DISTINCT p.order_id)::int AS num_orders
    FROM payments p
    WHERE p.tenant_id = $1
      AND DATE(p.created_at AT TIME ZONE 'Europe/Rome') = $2::date
      ${regFilter}
  `;
  const { rows: [tot] } = await pool.query(q, params);

  // num_receipts + num_covers separati (receipts ha la struttura, covers da orders)
  const { rows: [rcp] } = await pool.query(
    `SELECT COUNT(*)::int AS num_receipts FROM receipts r
      WHERE r.tenant_id = $1
        AND DATE(r.created_at AT TIME ZONE 'Europe/Rome') = $2::date
        ${register ? 'AND r.register = $3' : ''}`,
    params
  );

  const { rows: [cov] } = await pool.query(
    `SELECT COALESCE(SUM(o.covers), 0)::int AS num_covers FROM orders o
      WHERE o.tenant_id = $1
        AND DATE(o.created_at AT TIME ZONE 'Europe/Rome') = $2::date
        AND o.status = 'completed'`,
    [tenantId, businessDate]
  );

  return {
    ...tot,
    num_receipts: rcp.num_receipts,
    num_covers: cov.num_covers,
  };
}

async function preview(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const register = req.query.register || null;

    const totals = await aggregateDay(tenantId, date, register);

    // Verifica se c'e' gia' chiusura per data + register
    const { rows: [existing] } = await pool.query(
      `SELECT id, closed_at, closed_by_name, physical_cash, variance_cash, notes
         FROM day_closures
        WHERE tenant_id = $1 AND business_date = $2::date
          AND register IS NOT DISTINCT FROM $3`,
      [tenantId, date, register]
    );

    res.json({
      business_date: date,
      register,
      totals,
      existing_closure: existing || null,
    });
  } catch (err) { next(err); }
}

async function closeDay(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const { date, register = null, physical_cash, notes } = req.body;
    if (!date) return res.status(400).json({ error: 'date obbligatoria (YYYY-MM-DD)' });

    const totals = await aggregateDay(tenantId, date, register);

    // Variance: physical contato - cash registrato dal sistema
    let varianceCash = null;
    if (physical_cash != null) {
      varianceCash = (parseFloat(physical_cash) - parseFloat(totals.total_cash)).toFixed(2);
    }

    // UPSERT: una chiusura per (tenant, date, register). Se ri-chiude →
    // aggiorna i totali (utile se chiude troppo presto e poi riapre).
    const { rows: [closure] } = await pool.query(
      `INSERT INTO day_closures
         (tenant_id, business_date, register, total_amount, total_cash,
          total_card, total_digital, total_other, num_orders, num_receipts,
          num_covers, physical_cash, variance_cash, closed_by, closed_by_name, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (tenant_id, business_date, register) DO UPDATE SET
         total_amount   = EXCLUDED.total_amount,
         total_cash     = EXCLUDED.total_cash,
         total_card     = EXCLUDED.total_card,
         total_digital  = EXCLUDED.total_digital,
         total_other    = EXCLUDED.total_other,
         num_orders     = EXCLUDED.num_orders,
         num_receipts   = EXCLUDED.num_receipts,
         num_covers     = EXCLUDED.num_covers,
         physical_cash  = EXCLUDED.physical_cash,
         variance_cash  = EXCLUDED.variance_cash,
         closed_by      = EXCLUDED.closed_by,
         closed_by_name = EXCLUDED.closed_by_name,
         closed_at      = NOW(),
         notes          = EXCLUDED.notes
       RETURNING *`,
      [tenantId, date, register, totals.total_amount, totals.total_cash,
       totals.total_card, totals.total_digital, totals.total_other,
       totals.num_orders, totals.num_receipts, totals.num_covers,
       physical_cash != null ? physical_cash : null,
       varianceCash,
       req.user.id, req.user.name, notes || null]
    );

    res.status(201).json(closure);
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const days = Math.min(Math.max(parseInt(req.query.days || '30', 10), 1), 365);
    const { rows } = await pool.query(
      `SELECT * FROM day_closures
        WHERE tenant_id = $1
          AND business_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
        ORDER BY business_date DESC, register NULLS FIRST`,
      [tenantId, days]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { preview, closeDay, list };
