const pool = require('../config/db');
const { getIO } = require('../socket');

/**
 * GET /api/service/alerts — Alert attivi per l'utente corrente
 */
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
       ORDER BY sa.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * GET /api/service/ready-items — Item pronti non serviti per i tavoli del cameriere
 */
async function getReadyItems(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT oi.id AS item_id, oi.order_id, oi.quantity, oi.ready_at,
              COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS item_name,
              COALESCE(t.table_number, 'ASPORTO') AS table_number,
              COALESCE(z.name, '') AS zone_name,
              COALESCE(c.is_beverage, false) AS is_beverage
       FROM order_items oi
       JOIN orders o       ON o.id = oi.order_id
       LEFT JOIN tables t  ON t.id = o.table_id
       LEFT JOIN zones z   ON z.id = t.zone_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c  ON c.id = mi.category_id
       WHERE oi.status = 'ready'
         AND oi.served_at IS NULL
         AND o.waiter_id = $1
         AND o.status = 'open'
       ORDER BY oi.ready_at ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/service/alerts/:id/postpone — Posticipa alert di 5 minuti
 */
async function postponeAlert(req, res, next) {
  try {
    const { id } = req.params;
    const { rows: [alert] } = await pool.query(
      `UPDATE service_alerts
       SET postponed_until = NOW() + INTERVAL '5 minutes'
       WHERE id = $1 AND target_user_id = $2
       RETURNING *`,
      [id, req.user.id]
    );
    if (!alert) return res.status(404).json({ error: 'Alert non trovato' });

    // Notifica admin/manager del postpone
    getIO()?.to('role:admin').to('role:manager').emit('alert-postponed', {
      alertId: id,
      waiterName: req.user.name,
      newDeadline: alert.postponed_until,
    });

    res.json(alert);
  } catch (err) { next(err); }
}

/**
 * POST /api/service/alerts/:id/acknowledge — Cameriere conferma presa in carico
 */
async function acknowledgeAlert(req, res, next) {
  try {
    const { id } = req.params;
    const { rows: [alert] } = await pool.query(
      `UPDATE service_alerts
       SET acknowledged = true
       WHERE id = $1 AND target_user_id = $2
       RETURNING *`,
      [id, req.user.id]
    );
    if (!alert) return res.status(404).json({ error: 'Alert non trovato' });
    res.json(alert);
  } catch (err) { next(err); }
}

module.exports = { getAlerts, getReadyItems, postponeAlert, acknowledgeAlert };
