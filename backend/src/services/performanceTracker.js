const pool = require('../config/db');

// Tutte le funzioni richiedono tenantId esplicito perche' chiamate sia da
// controller (req.tenant.id) sia dal serviceTimer (loop variable).
// Senza, i record finirebbero col DEFAULT del tenant Riva indipendentemente
// da chi e' il waiter.

async function trackItemServed(tenantId, waiterId, readyAt, servedAt) {
  if (!tenantId || !waiterId || !readyAt || !servedAt) return;

  const responseMs = new Date(servedAt).getTime() - new Date(readyAt).getTime();

  try {
    await pool.query(
      `INSERT INTO staff_performance_log (tenant_id, user_id, shift_date, items_served, total_response_ms)
       VALUES ($1, $2, CURRENT_DATE, 1, $3)
       ON CONFLICT (user_id, shift_date)
       DO UPDATE SET
         items_served = staff_performance_log.items_served + 1,
         total_response_ms = staff_performance_log.total_response_ms + $3`,
      [tenantId, waiterId, responseMs]
    );
  } catch (err) {
    console.error('[Performance] Errore trackItemServed:', err.message);
  }
}

async function trackAlertReceived(tenantId, waiterId) {
  if (!tenantId || !waiterId) return;
  try {
    await pool.query(
      `INSERT INTO staff_performance_log (tenant_id, user_id, shift_date, alerts_received, score)
       VALUES ($1, $2, CURRENT_DATE, 1, 95.00)
       ON CONFLICT (user_id, shift_date)
       DO UPDATE SET
         alerts_received = staff_performance_log.alerts_received + 1,
         score = GREATEST(staff_performance_log.score - 5, 0)`,
      [tenantId, waiterId]
    );
  } catch (err) {
    console.error('[Performance] Errore trackAlertReceived:', err.message);
  }
}

async function trackEscalation(tenantId, waiterId) {
  if (!tenantId || !waiterId) return;
  try {
    await pool.query(
      `INSERT INTO staff_performance_log (tenant_id, user_id, shift_date, escalations, score)
       VALUES ($1, $2, CURRENT_DATE, 1, 90.00)
       ON CONFLICT (user_id, shift_date)
       DO UPDATE SET
         escalations = staff_performance_log.escalations + 1,
         score = GREATEST(staff_performance_log.score - 10, 0)`,
      [tenantId, waiterId]
    );
  } catch (err) {
    console.error('[Performance] Errore trackEscalation:', err.message);
  }
}

module.exports = { trackItemServed, trackAlertReceived, trackEscalation };
