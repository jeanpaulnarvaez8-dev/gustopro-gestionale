const pool = require('../config/db');
const { getIO } = require('../socket');
const { ORDER_ITEM_STATUSES } = require('../config/constants');

async function getPendingOrders(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         o.id            AS order_id,
         o.created_at    AS order_created_at,
         t.table_number,
         z.name          AS zone_name,
         oi.id           AS item_id,
         oi.quantity,
         oi.status       AS item_status,
         oi.notes        AS item_notes,
         oi.sent_at,
         mi.name         AS item_name,
         mi.prep_time_mins,
         COALESCE(
           json_agg(m.name ORDER BY m.name) FILTER (WHERE m.id IS NOT NULL),
           '[]'
         ) AS modifiers
       FROM order_items oi
       JOIN orders o      ON o.id = oi.order_id
       JOIN tables t      ON t.id = o.table_id
       JOIN zones z       ON z.id = t.zone_id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
       LEFT JOIN modifiers m ON m.id = oim.modifier_id
       WHERE oi.status IN ('pending','cooking')
         AND o.status = 'open'
       GROUP BY o.id, o.created_at, t.table_number, z.name,
                oi.id, oi.quantity, oi.status, oi.notes, oi.sent_at,
                mi.name, mi.prep_time_mins
       ORDER BY oi.sent_at ASC`
    );

    // Group by order
    const ordersMap = {};
    for (const row of rows) {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          order_id: row.order_id,
          order_created_at: row.order_created_at,
          table_number: row.table_number,
          zone_name: row.zone_name,
          items: [],
        };
      }
      ordersMap[row.order_id].items.push({
        id: row.item_id,
        name: row.item_name,
        quantity: row.quantity,
        status: row.item_status,
        notes: row.item_notes,
        sent_at: row.sent_at,
        prep_time_mins: row.prep_time_mins,
        modifiers: row.modifiers,
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
      'UPDATE order_items SET status=$1 WHERE id=$2 RETURNING *',
      [status, id]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });

    getIO()?.emit('item-status-updated', {
      orderId: item.order_id,
      itemId: id,
      status,
    });

    res.json(item);
  } catch (err) { next(err); }
}

module.exports = { getPendingOrders, updateItemStatus };
