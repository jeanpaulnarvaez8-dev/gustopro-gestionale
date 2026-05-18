/**
 * Bar controller — coda separata per item bevande (is_beverage=true).
 *
 * Funzionalmente identico al KDS cucina, ma filtra per category.is_beverage.
 * Riusa updateItemStatus dal kds.controller (logica di cambio status identica).
 *
 * Endpoint: GET /api/bar/pending — solo bevande pending/cooking/ready
 *
 * Accesso: waiter (sub_role bar/bar-caffetteria), manager, admin.
 */
const pool = require('../config/db');

const TENANT = (req) => req.tenant.id;

async function getBarOrders(req, res, next) {
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
         oi.display_status AS display_status,
         oi.workflow_status AS workflow_status,
         oi.notes          AS item_notes,
         oi.sent_at,
         oi.combo_menu_name,
         oi.combo_selections,
         COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
         mi.prep_time_mins,
         COALESCE(c.course_type, 'bevanda')   AS course_type,
         COALESCE(
           json_agg(m.name ORDER BY m.name) FILTER (WHERE m.id IS NOT NULL),
           '[]'
         ) AS modifiers
       FROM order_items oi
       JOIN orders o        ON o.id = oi.order_id
       LEFT JOIN tables t   ON t.id = o.table_id
       LEFT JOIN zones z    ON z.id = t.zone_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c  ON c.id = mi.category_id
       LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
       LEFT JOIN modifiers m ON m.id = oim.modifier_id
       WHERE o.status = 'open'
         AND oi.status NOT IN ('served','cancelled')
         AND oi.workflow_status = 'production'
         AND oi.tenant_id = $1
         AND c.is_beverage = true   -- ← unico delta vs KDS cucina
       GROUP BY o.id, o.created_at, o.order_type, o.customer_name, o.pickup_time,
                t.table_number, z.name,
                oi.id, oi.quantity, oi.status, oi.display_status, oi.workflow_status, oi.notes, oi.sent_at,
                oi.combo_menu_name, oi.combo_selections,
                mi.name, mi.prep_time_mins, c.course_type
       ORDER BY
         CASE oi.display_status WHEN 'active' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END,
         oi.sent_at ASC`,
      [TENANT(req)]
    );

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
        display_status:   row.display_status,
        workflow_status:  row.workflow_status,
        course_type:      row.course_type,
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

module.exports = { getBarOrders };
