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
         -- Esclude 'ready' dalla coda: dopo "Pronto" il drink passa al
         -- pass del cameriere; il bartender vede solo pending/cooking.
         AND oi.status NOT IN ('ready','served','cancelled')
         AND oi.workflow_status = 'production'
         AND oi.tenant_id = $1
         -- JP 2026-06-04: bartender sub_role='asporto' vede SOLO gli ordini
         -- takeaway (food + drink). Bar generico (sub_role 'bar' / 'bar/
         -- caffetteria') vede dine-in beverages + takeaway intero come prima.
         AND ${req.user?.sub_role === 'asporto'
           ? `o.order_type = 'takeaway'`
           : `(c.is_beverage = true OR o.order_type = 'takeaway')`}
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

/**
 * getBarItemsForTable — bevande di UN tavolo specifico, incluso storico
 * della serata (anche servite/cancellate). Usato dal modal "Bevande tavolo X"
 * che il bartender apre cliccando un tavolo dalla mappa.
 *
 * Differenza da getBarOrders: ritorna TUTTI gli items beverage del tavolo
 * (anche già served), non solo pending/cooking/ready come la coda.
 */
async function getBarItemsForTable(req, res, next) {
  try {
    const { tableId } = req.params;
    const tenantId = TENANT(req);
    const { rows } = await pool.query(
      `SELECT
         oi.id, oi.quantity, oi.status, oi.notes, oi.sent_at, oi.ready_at, oi.served_at,
         COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
         c.name AS category_name,
         o.id          AS order_id,
         o.created_at  AS order_created_at,
         u.name        AS waiter_name
       FROM order_items oi
       JOIN orders o        ON o.id = oi.order_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c  ON c.id = mi.category_id
       LEFT JOIN users u    ON u.id = o.waiter_id
       WHERE o.table_id = $1
         AND oi.tenant_id = $2
         AND o.status IN ('open','completed')
         AND (c.is_beverage = true OR o.order_type = 'takeaway')
       ORDER BY oi.sent_at DESC`,
      [tableId, tenantId]
    );

    // Aggrega counts per status (utile UI: 3 pending, 1 ready, 2 served)
    const counts = { pending: 0, cooking: 0, ready: 0, served: 0, cancelled: 0 };
    for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;

    const { rows: [tbl] } = await pool.query(
      'SELECT table_number FROM tables WHERE id = $1 AND tenant_id = $2',
      [tableId, tenantId]
    );

    res.json({
      table_id: tableId,
      table_number: tbl?.table_number,
      counts,
      items: rows,
    });
  } catch (err) { next(err); }
}

/**
 * getBarCount — conteggio rapido cocktail "da fare" (pending+cooking+ready) per
 * il badge persistente. Sub-second response, usato in polling/socket-driven.
 */
async function getBarCount(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const { rows: [row] } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE oi.status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE oi.status = 'cooking')::int AS cooking,
         COUNT(*) FILTER (WHERE oi.status = 'ready')::int   AS ready,
         COUNT(*)::int AS total
       FROM order_items oi
       JOIN orders o     ON o.id = oi.order_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c  ON c.id = mi.category_id
       WHERE oi.tenant_id = $1
         AND o.status = 'open'
         AND oi.status NOT IN ('served','cancelled')
         AND oi.workflow_status = 'production'
         AND ${req.user?.sub_role === 'asporto'
           ? `o.order_type = 'takeaway'`
           : `(c.is_beverage = true OR o.order_type = 'takeaway')`}`,
      [tenantId]
    );
    res.json(row);
  } catch (err) { next(err); }
}

module.exports = { getBarOrders, getBarItemsForTable, getBarCount };
