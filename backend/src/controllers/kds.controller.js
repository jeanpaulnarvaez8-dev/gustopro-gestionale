const pool = require('../config/db');
const { getIO } = require('../socket');
const { ORDER_ITEM_STATUSES } = require('../config/constants');
const { trackItemServed } = require('../services/performanceTracker');

async function getPendingOrders(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         o.id             AS order_id,
         o.created_at     AS order_created_at,
         o.order_type,
         o.customer_name  AS order_customer_name,
         o.pickup_time,
         COALESCE(t.table_number, 'ASPORTO') AS table_number,
         COALESCE(z.name, '')                AS zone_name,
         oi.id             AS item_id,
         oi.quantity,
         oi.status         AS item_status,
         oi.notes          AS item_notes,
         oi.sent_at,
         oi.combo_menu_name,
         oi.combo_selections,
         COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
         mi.prep_time_mins,
         COALESCE(
           json_agg(m.name ORDER BY m.name) FILTER (WHERE m.id IS NOT NULL),
           '[]'
         ) AS modifiers
       FROM order_items oi
       JOIN orders o        ON o.id = oi.order_id
       LEFT JOIN tables t   ON t.id = o.table_id
       LEFT JOIN zones z    ON z.id = t.zone_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
       LEFT JOIN modifiers m ON m.id = oim.modifier_id
       WHERE oi.status IN ('pending','cooking')
         AND o.status = 'open'
       GROUP BY o.id, o.created_at, o.order_type, o.customer_name, o.pickup_time,
                t.table_number, z.name,
                oi.id, oi.quantity, oi.status, oi.notes, oi.sent_at,
                oi.combo_menu_name, oi.combo_selections,
                mi.name, mi.prep_time_mins
       ORDER BY oi.sent_at ASC`
    );

    // Group by order
    const ordersMap = {};
    for (const row of rows) {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          order_id:          row.order_id,
          order_created_at:  row.order_created_at,
          order_type:        row.order_type,
          order_customer_name: row.order_customer_name,
          pickup_time:       row.pickup_time,
          table_number:      row.table_number,
          zone_name:         row.zone_name,
          items: [],
        };
      }
      ordersMap[row.order_id].items.push({
        id:               row.item_id,
        name:             row.item_name,
        quantity:         row.quantity,
        status:           row.item_status,
        notes:            row.item_notes,
        sent_at:          row.sent_at,
        prep_time_mins:   row.prep_time_mins,
        modifiers:        row.modifiers,
        combo_selections: row.combo_selections,
        is_combo:         !!row.combo_menu_name,
      });
    }
    res.json(Object.values(ordersMap));
  } catch (err) { next(err); }
}

async function updateItemStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['cooking', 'ready', 'served', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status non valido. Valori: ${validStatuses.join(', ')}` });
    }

    const { rows: [item] } = await pool.query(
      `UPDATE order_items SET
         status    = $1::varchar,
         ready_at  = CASE WHEN $1::varchar = 'ready'  AND ready_at  IS NULL THEN NOW() ELSE ready_at  END,
         served_at = CASE WHEN $1::varchar = 'served' AND served_at IS NULL THEN NOW() ELSE served_at END
       WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });

    getIO()?.emit('item-status-updated', {
      orderId: item.order_id,
      itemId: id,
      status,
    });

    // Quando servito: pulisci alert, traccia performance, notifica tutti
    if (status === 'served') {
      await pool.query('DELETE FROM service_alerts WHERE order_item_id = $1', [id]);
      getIO()?.emit('item-served', { orderId: item.order_id, itemId: id });
      // Traccia performance cameriere
      const { rows: [orderInfo] } = await pool.query(
        'SELECT waiter_id FROM orders WHERE id = $1', [item.order_id]
      );
      if (orderInfo) {
        trackItemServed(orderInfo.waiter_id, item.ready_at, item.served_at);
      }
    }

    // Notifica diretta al cameriere quando il piatto è pronto
    if (status === 'ready') {
      const { rows: [info] } = await pool.query(
        `SELECT o.waiter_id,
                COALESCE(t.table_number, 'ASPORTO') AS table_number,
                COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS item_name,
                oi.quantity
           FROM order_items oi
           JOIN orders o       ON o.id = oi.order_id
           LEFT JOIN tables t  ON t.id = o.table_id
           LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
          WHERE oi.id = $1`,
        [id]
      );
      if (info) {
        getIO()?.to(`user:${info.waiter_id}`).emit('item-ready-notify', {
          orderId: item.order_id,
          itemId: id,
          itemName: info.item_name,
          quantity: info.quantity,
          tableNumber: info.table_number,
        });
      }
    }

    res.json(item);
  } catch (err) { next(err); }
}

module.exports = { getPendingOrders, updateItemStatus };
