const pool = require('../config/db');

/**
 * Registra un item servito e calcola il punteggio del cameriere.
 * Chiamato da kds.controller quando status → 'served'
 */
async function trackItemServed(waiterId, readyAt, servedAt) {
  if (!waiterId || !readyAt || !servedAt) return;

  const responseMs = new Date(servedAt).getTime() - new Date(readyAt).getTime();

  try {
    await pool.query(
      `INSERT INTO staff_performance_log (user_id, shift_date, items_served, total_response_ms)
       VALUES ($1, CURRENT_DATE, 1, $2)
       ON CONFLICT (user_id, shift_date)
       DO UPDATE SET
         items_served = staff_performance_log.items_served + 1,
         total_response_ms = staff_performance_log.total_response_ms + $2`,
      [waiterId, responseMs]
    );
  } catch (err) {
    console.error('[Performance] Errore trackItemServed:', err.message);
  }
}

/**
 * Registra un alert ricevuto (penalità -5 punti)
 */
async function trackAlertReceived(waiterId) {
  if (!waiterId) return;
  try {
    await pool.query(
      `INSERT INTO staff_performance_log (user_id, shift_date, alerts_received, score)
       VALUES ($1, CURRENT_DATE, 1, 95.00)
       ON CONFLICT (user_id, shift_date)
       DO UPDATE SET
         alerts_received = staff_performance_log.alerts_received + 1,
         score = GREATEST(staff_performance_log.score - 5, 0)`,
      [waiterId]
    );
  } catch (err) {
    console.error('[Performance] Errore trackAlertReceived:', err.message);
  }
}

/**
 * Registra una escalation (penalità -10 punti)
 */
async function trackEscalation(waiterId) {
  if (!waiterId) return;
  try {
    await pool.query(
      `INSERT INTO staff_performance_log (user_id, shift_date, escalations, score)
       VALUES ($1, CURRENT_DATE, 1, 90.00)
       ON CONFLICT (user_id, shift_date)
       DO UPDATE SET
         escalations = staff_performance_log.escalations + 1,
         score = GREATEST(staff_performance_log.score - 10, 0)`,
      [waiterId]
    );
  } catch (err) {
    console.error('[Performance] Errore trackEscalation:', err.message);
  }
}

module.exports = { trackItemServed, trackAlertReceived, trackEscalation };
