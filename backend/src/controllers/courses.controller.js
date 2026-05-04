const pool = require('../config/db');
const { getIO } = require('../socket');

// Tenant isolation: course timing config + course events scoped al tenant.
const TENANT = (req) => req.tenant.id;

async function getTimingConfig(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM course_timing_config WHERE tenant_id=$1 ORDER BY from_course, minutes',
      [TENANT(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function updateTimingConfig(req, res, next) {
  try {
    const { minutes, pre_alert_mins } = req.body;
    const { rows: [config] } = await pool.query(
      'UPDATE course_timing_config SET minutes=$1, pre_alert_mins=$2 WHERE id=$3 AND tenant_id=$4 RETURNING *',
      [minutes, pre_alert_mins ?? 5, req.params.id, TENANT(req)]
    );
    if (!config) return res.status(404).json({ error: 'Config non trovata' });
    res.json(config);
  } catch (err) { next(err); }
}

async function updateItemDisplay(req, res, next) {
  try {
    const { itemId } = req.params;
    const { display_status } = req.body;

    if (!['active', 'waiting', 'delivered'].includes(display_status)) {
      return res.status(400).json({ error: 'display_status non valido' });
    }

    const { rows: [item] } = await pool.query(
      'UPDATE order_items SET display_status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
      [display_status, itemId, TENANT(req)]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });

    getIO()?.emit('item-display-changed', {
      orderId: item.order_id,
      itemId,
      displayStatus: display_status,
    });

    res.json(item);
  } catch (err) { next(err); }
}

async function sendCourse(req, res, next) {
  try {
    const { order_id, course_type } = req.body;
    const tenantId = TENANT(req);

    const { rows: items } = await pool.query(
      `UPDATE order_items oi SET display_status = 'active'
       FROM menu_items mi
       JOIN categories c ON c.id = mi.category_id
       WHERE oi.menu_item_id = mi.id
         AND oi.order_id = $1
         AND c.course_type = $2
         AND oi.display_status = 'waiting'
         AND oi.tenant_id = $3
       RETURNING oi.*`,
      [order_id, course_type, tenantId]
    );

    getIO()?.emit('course-activated', {
      orderId: order_id,
      courseType: course_type,
      itemCount: items.length,
    });

    res.json({ activated: items.length, items });
  } catch (err) { next(err); }
}

async function markCourseServed(req, res, next) {
  try {
    const { order_id, course_type } = req.body;
    const tenantId = TENANT(req);

    const { rows: [log] } = await pool.query(
      `INSERT INTO course_served_log (tenant_id, order_id, course_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (order_id, course_type) DO UPDATE SET served_at = NOW()
       RETURNING *`,
      [tenantId, order_id, course_type]
    );

    const { rows: timings } = await pool.query(
      'SELECT to_course, minutes, pre_alert_mins FROM course_timing_config WHERE from_course = $1 AND tenant_id = $2',
      [course_type, tenantId]
    );

    const { rows: [order] } = await pool.query(
      `SELECT o.waiter_id, COALESCE(t.table_number, 'ASPORTO') AS table_number
       FROM orders o LEFT JOIN tables t ON t.id = o.table_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [order_id, tenantId]
    );

    if (order) {
      getIO()?.to(`user:${order.waiter_id}`).emit('course-served', {
        orderId: order_id,
        courseType: course_type,
        tableNumber: order.table_number,
        nextCourses: timings.map(t => ({
          course: t.to_course,
          inMinutes: t.minutes,
          preAlertMins: t.pre_alert_mins,
        })),
      });
    }

    res.json({ log, nextTimings: timings });
  } catch (err) { next(err); }
}

async function getOrderCourseStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const tenantId = TENANT(req);

    const { rows: items } = await pool.query(
      `SELECT oi.id, oi.quantity, oi.status, oi.display_status, oi.ready_at, oi.served_at, oi.notes,
              COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
              COALESCE(c.course_type, 'altro') AS course_type,
              COALESCE(c.is_beverage, false) AS is_beverage
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c ON c.id = mi.category_id
       WHERE oi.order_id = $1 AND oi.tenant_id = $2
       ORDER BY c.sort_order, oi.display_status DESC, mi.name`,
      [orderId, tenantId]
    );

    const { rows: servedCourses } = await pool.query(
      'SELECT course_type, served_at FROM course_served_log WHERE order_id = $1 AND tenant_id = $2',
      [orderId, tenantId]
    );

    const { rows: timings } = await pool.query(
      'SELECT * FROM course_timing_config WHERE tenant_id = $1 ORDER BY from_course, minutes',
      [tenantId]
    );

    res.json({ items, servedCourses, timings });
  } catch (err) { next(err); }
}

module.exports = {
  getTimingConfig, updateTimingConfig,
  updateItemDisplay, sendCourse, markCourseServed,
  getOrderCourseStatus,
};
