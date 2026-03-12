const pool = require('../config/db');

async function getDashboardStats(req, res, next) {
  try {
    const { rows: [stats] } = await pool.query(
      `SELECT
         COALESCE(SUM(total_amount) FILTER (
           WHERE status='completed' AND DATE(created_at AT TIME ZONE 'Europe/Rome') = CURRENT_DATE
         ), 0) AS revenue_today,
         COALESCE(SUM(total_amount) FILTER (
           WHERE status='completed' AND DATE(created_at AT TIME ZONE 'Europe/Rome') = CURRENT_DATE - 1
         ), 0) AS revenue_yesterday,
         COUNT(*) FILTER (WHERE status='open') AS tables_open,
         COUNT(*) FILTER (
           WHERE payment_status='paid' AND DATE(created_at AT TIME ZONE 'Europe/Rome') = CURRENT_DATE
         ) AS covers_today,
         COALESCE(AVG(total_amount) FILTER (
           WHERE status='completed' AND DATE(created_at AT TIME ZONE 'Europe/Rome') = CURRENT_DATE
         ), 0) AS avg_ticket_today
       FROM orders`
    );

    res.json({
      revenue_today: parseFloat(stats.revenue_today),
      revenue_yesterday: parseFloat(stats.revenue_yesterday),
      tables_open: parseInt(stats.tables_open),
      covers_today: parseInt(stats.covers_today),
      avg_ticket_today: parseFloat(stats.avg_ticket_today),
    });
  } catch (err) { next(err); }
}

async function getHourlyRevenue(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Rome') AS hour,
         COALESCE(SUM(total_amount), 0) AS revenue
       FROM orders
       WHERE status = 'completed'
         AND DATE(created_at AT TIME ZONE 'Europe/Rome') = CURRENT_DATE
       GROUP BY hour
       ORDER BY hour`
    );

    // Fill missing hours with 0
    const hourMap = {};
    rows.forEach(r => { hourMap[parseInt(r.hour)] = parseFloat(r.revenue); });
    const result = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      revenue: hourMap[h] || 0,
    }));

    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { getDashboardStats, getHourlyRevenue };
