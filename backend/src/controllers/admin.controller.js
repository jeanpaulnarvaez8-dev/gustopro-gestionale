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

async function getTopItems(req, res, next) {
  try {
    const days  = Math.min(Math.max(parseInt(req.query.days  ?? 30),  1), 365);
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? 10),  1),  50);

    const { rows } = await pool.query(
      `SELECT
         mi.id,
         mi.name,
         c.name  AS category,
         SUM(oi.quantity)              AS total_quantity,
         COALESCE(SUM(oi.subtotal),0)  AS total_revenue,
         COUNT(DISTINCT oi.order_id)   AS order_count
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       JOIN categories c  ON c.id  = mi.category_id
       JOIN orders     o  ON o.id  = oi.order_id
       WHERE o.status   = 'completed'
         AND oi.status != 'cancelled'
         AND o.created_at >= NOW() - ($1::int || ' days')::INTERVAL
       GROUP BY mi.id, mi.name, c.name
       ORDER BY total_quantity DESC
       LIMIT $2`,
      [days, limit]
    );

    res.json(rows.map(r => ({
      id:             r.id,
      name:           r.name,
      category:       r.category,
      total_quantity: parseInt(r.total_quantity),
      total_revenue:  parseFloat(r.total_revenue),
      order_count:    parseInt(r.order_count),
    })));
  } catch (err) { next(err); }
}

async function getByWeekday(req, res, next) {
  try {
    const weeks = Math.min(Math.max(parseInt(req.query.weeks ?? 8), 1), 52);

    const { rows } = await pool.query(
      `SELECT
         EXTRACT(DOW FROM created_at AT TIME ZONE 'Europe/Rome')   AS dow,
         COUNT(*)                                                   AS order_count,
         COALESCE(SUM(total_amount), 0)                            AS total_revenue,
         COALESCE(AVG(total_amount), 0)                            AS avg_revenue,
         COUNT(DISTINCT DATE(created_at AT TIME ZONE 'Europe/Rome')) AS day_count
       FROM orders
       WHERE status = 'completed'
         AND created_at >= NOW() - ($1::int || ' weeks')::INTERVAL
       GROUP BY dow
       ORDER BY dow`,
      [weeks]
    );

    // DOW 0 = Sunday (PostgreSQL); remap Mon–Sun
    const IT_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const byDow = Object.fromEntries(rows.map(r => [parseInt(r.dow), r]));

    const all = Array.from({ length: 7 }, (_, i) => {
      const r = byDow[i];
      const oc  = r ? parseInt(r.order_count) : 0;
      const dc  = r ? parseInt(r.day_count)   : 0;
      return {
        dow:               i,
        label:             IT_LABELS[i],
        order_count:       oc,
        total_revenue:     r ? parseFloat(r.total_revenue) : 0,
        avg_revenue:       r ? parseFloat(r.avg_revenue)   : 0,
        day_count:         dc,
        avg_orders_per_day: dc > 0 ? Math.round(oc / dc) : 0,
      };
    });

    // Reorder: Mon(1) … Sat(6) Sun(0)
    res.json([...all.slice(1), all[0]]);
  } catch (err) { next(err); }
}

module.exports = { getDashboardStats, getHourlyRevenue, getTopItems, getByWeekday };
