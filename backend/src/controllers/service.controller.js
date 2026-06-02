const pool = require('../config/db');
const { getIO } = require('../socket');

// Tenant isolation: alert e ready items scoped al tenant + utente.
const TENANT = (req) => req.tenant.id;

async function getAlerts(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT sa.*,
              COALESCE(t.table_number, 'ASPORTO') AS table_number,
              COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS item_name,
              oi.quantity, oi.ready_at,
              COALESCE(z.name, '') AS zone_name
       FROM service_alerts sa
       JOIN order_items oi ON oi.id = sa.order_item_id
       JOIN orders o       ON o.id = oi.order_id
       LEFT JOIN tables t  ON t.id = o.table_id
       LEFT JOIN zones z   ON z.id = t.zone_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE sa.acknowledged = false
         AND oi.served_at IS NULL
         AND (sa.target_user_id = $1 OR sa.alert_type = 'manager_25min')
         AND sa.tenant_id = $2
       ORDER BY sa.created_at DESC
       LIMIT 200`,
      [req.user.id, TENANT(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function getReadyItems(req, res, next) {
  try {
    // JP 2026-06-02: TUTTI i camerieri (e admin/manager) vedono TUTTI i
    // piatti pronti, non solo quelli dei propri tavoli. Cosi' qualsiasi
    // cameriere libero puo' portare il piatto a tavola, non bloccato
    // dall'assegnazione formale dell'ordine. waiter_name nel payload
    // per sapere chi tiene formalmente il tavolo.
    const { rows } = await pool.query(
      `SELECT oi.id AS item_id, oi.order_id, oi.quantity, oi.ready_at,
              COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS item_name,
              COALESCE(t.table_number, 'ASPORTO') AS table_number,
              COALESCE(z.name, '') AS zone_name,
              COALESCE(c.is_beverage, false) AS is_beverage,
              o.waiter_id,
              COALESCE(u.name, '') AS waiter_name
       FROM order_items oi
       JOIN orders o       ON o.id = oi.order_id
       LEFT JOIN users u   ON u.id = o.waiter_id
       LEFT JOIN tables t  ON t.id = o.table_id
       LEFT JOIN zones z   ON z.id = t.zone_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c  ON c.id = mi.category_id
       WHERE oi.status = 'ready'
         AND oi.served_at IS NULL
         AND o.status = 'open'
         AND oi.tenant_id = $1
       ORDER BY oi.ready_at ASC`,
      [TENANT(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// Limite massimo di posticipi consecutivi per alert. Oltre questo,
// l'alert e' considerato "ignorato" e escalation immediata al manager.
const MAX_POSTPONE_COUNT = 2;
const POSTPONE_MINUTES = 3;

async function postponeAlert(req, res, next) {
  try {
    const { id } = req.params;

    // Recupera defer_count attuale per limitare i posticipi
    const { rows: [current] } = await pool.query(
      `SELECT defer_count FROM service_alerts
       WHERE id = $1 AND target_user_id = $2 AND tenant_id = $3`,
      [id, req.user.id, TENANT(req)]
    );
    if (!current) return res.status(404).json({ error: 'Alert non trovato' });
    if (current.defer_count >= MAX_POSTPONE_COUNT) {
      return res.status(409).json({
        error: `Limite posticipi raggiunto (${MAX_POSTPONE_COUNT}). Servi o chiama il responsabile.`,
        defer_count: current.defer_count,
      });
    }

    const { rows: [alert] } = await pool.query(
      `UPDATE service_alerts
       SET postponed_until = NOW() + ($4 || ' minutes')::INTERVAL,
           defer_count     = defer_count + 1,
           defer_history   = COALESCE(defer_history, '[]'::jsonb) || jsonb_build_object(
             'at',           NOW(),
             'by_user_id',   $2::uuid,
             'by_user_name', $5::text,
             'minutes',      $4::int
           )
       WHERE id = $1 AND target_user_id = $2 AND tenant_id = $3
       RETURNING *`,
      [id, req.user.id, TENANT(req), POSTPONE_MINUTES, req.user.name]
    );
    if (!alert) return res.status(404).json({ error: 'Alert non trovato' });

    getIO()?.to('role:admin').to('role:manager').emit('alert-postponed', {
      alertId: id,
      waiterName: req.user.name,
      newDeadline: alert.postponed_until,
      deferCount: alert.defer_count,
      isLastChance: alert.defer_count >= MAX_POSTPONE_COUNT,
    });

    res.json(alert);
  } catch (err) { next(err); }
}

async function acknowledgeAlert(req, res, next) {
  try {
    const { id } = req.params;
    const { rows: [alert] } = await pool.query(
      `UPDATE service_alerts
       SET acknowledged = true
       WHERE id = $1 AND target_user_id = $2 AND tenant_id = $3
       RETURNING *`,
      [id, req.user.id, TENANT(req)]
    );
    if (!alert) return res.status(404).json({ error: 'Alert non trovato' });
    res.json(alert);
  } catch (err) { next(err); }
}

module.exports = { getAlerts, getReadyItems, postponeAlert, acknowledgeAlert };
