const pool = require('../config/db');
const { getIO } = require('../socket');

/**
 * GET /api/courses/timing — Configurazione tempi tra portate
 */
async function getTimingConfig(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM course_timing_config ORDER BY from_course, minutes');
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * PUT /api/courses/timing/:id — Aggiorna tempo tra portate
 */
async function updateTimingConfig(req, res, next) {
  try {
    const { minutes, pre_alert_mins } = req.body;
    const { rows: [config] } = await pool.query(
      'UPDATE course_timing_config SET minutes=$1, pre_alert_mins=$2 WHERE id=$3 RETURNING *',
      [minutes, pre_alert_mins ?? 5, req.params.id]
    );
    if (!config) return res.status(404).json({ error: 'Config non trovata' });
    res.json(config);
  } catch (err) { next(err); }
}

/**
 * PATCH /api/courses/items/:itemId/display — Cambia display_status di un item
 * Body: { display_status: 'active' | 'waiting' | 'delivered' }
 */
async function updateItemDisplay(req, res, next) {
  try {
    const { itemId } = req.params;
    const { display_status } = req.body;

    if (!['active', 'waiting', 'delivered'].includes(display_status)) {
      return res.status(400).json({ error: 'display_status non valido' });
    }

    const { rows: [item] } = await pool.query(
      'UPDATE order_items SET display_status = $1 WHERE id = $2 RETURNING *',
      [display_status, itemId]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });

    // Notifica cucina e camerieri del cambio
    getIO()?.emit('item-display-changed', {
      orderId: item.order_id,
      itemId,
      displayStatus: display_status,
    });

    res.json(item);
  } catch (err) { next(err); }
}

/**
 * POST /api/courses/send-course — Cameriere conferma invio portata
 * Cambia tutti gli items 'waiting' di un corso a 'active' per un ordine
 * Body: { order_id, course_type }
 */
async function sendCourse(req, res, next) {
  try {
    const { order_id, course_type } = req.body;

    // Trova items di questo corso in attesa
    const { rows: items } = await pool.query(
      `UPDATE order_items oi SET display_status = 'active'
       FROM menu_items mi
       JOIN categories c ON c.id = mi.category_id
       WHERE oi.menu_item_id = mi.id
         AND oi.order_id = $1
         AND c.course_type = $2
         AND oi.display_status = 'waiting'
       RETURNING oi.*`,
      [order_id, course_type]
    );

    // Notifica cucina
    getIO()?.emit('course-activated', {
      orderId: order_id,
      courseType: course_type,
      itemCount: items.length,
    });

    res.json({ activated: items.length, items });
  } catch (err) { next(err); }
}

/**
 * POST /api/courses/mark-course-served — Segna un'intera portata come servita
 * Chiamato automaticamente quando tutti gli items active di un corso diventano 'served'
 * Body: { order_id, course_type }
 */
async function markCourseServed(req, res, next) {
  try {
    const { order_id, course_type } = req.body;

    // Registra il momento in cui la portata è stata completata
    const { rows: [log] } = await pool.query(
      `INSERT INTO course_served_log (order_id, course_type)
       VALUES ($1, $2)
       ON CONFLICT (order_id, course_type) DO UPDATE SET served_at = NOW()
       RETURNING *`,
      [order_id, course_type]
    );

    // Carica i tempi per le portate successive
    const { rows: timings } = await pool.query(
      'SELECT to_course, minutes, pre_alert_mins FROM course_timing_config WHERE from_course = $1',
      [course_type]
    );

    // Trova il waiter dell'ordine
    const { rows: [order] } = await pool.query(
      `SELECT o.waiter_id, COALESCE(t.table_number, 'ASPORTO') AS table_number
       FROM orders o LEFT JOIN tables t ON t.id = o.table_id WHERE o.id = $1`,
      [order_id]
    );

    // Per ogni portata successiva, notifica il cameriere del timer
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

/**
 * GET /api/courses/order/:orderId/status — Stato completo delle portate di un ordine
 */
async function getOrderCourseStatus(req, res, next) {
  try {
    const { orderId } = req.params;

    const { rows: items } = await pool.query(
      `SELECT oi.id, oi.quantity, oi.status, oi.display_status, oi.ready_at, oi.served_at, oi.notes,
              COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
              COALESCE(c.course_type, 'altro') AS course_type,
              COALESCE(c.is_beverage, false) AS is_beverage
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c ON c.id = mi.category_id
       WHERE oi.order_id = $1
       ORDER BY c.sort_order, oi.display_status DESC, mi.name`,
      [orderId]
    );

    const { rows: servedCourses } = await pool.query(
      'SELECT course_type, served_at FROM course_served_log WHERE order_id = $1',
      [orderId]
    );

    const { rows: timings } = await pool.query(
      'SELECT * FROM course_timing_config ORDER BY from_course, minutes'
    );

    res.json({ items, servedCourses, timings });
  } catch (err) { next(err); }
}

module.exports = {
  getTimingConfig, updateTimingConfig,
  updateItemDisplay, sendCourse, markCourseServed,
  getOrderCourseStatus,
};
