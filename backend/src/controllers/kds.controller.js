const pool = require('../config/db');
const { getIO } = require('../socket');
const { ORDER_ITEM_STATUSES } = require('../config/constants');
const { trackItemServed } = require('../services/performanceTracker');
const pushService = require('../services/pushService');

// Tenant isolation: KDS deve mostrare SOLO ticket della propria cucina.
// Senza filtro, una pizzeria vedrebbe gli ordini di un ristorante diverso.
const TENANT = (req) => req.tenant.id;

async function getPendingOrders(req, res, next) {
  try {
    // Filtro per stazione KDS. Default 'cucina' = NULL (backward compat).
    // Stazioni valide: cucina (default), pizzeria, crudi, pasticceria.
    // Bevande sempre escluse (vanno in /bar).
    const stationParam = (req.query.station || 'cucina').toLowerCase();
    const validStations = ['cucina', 'pizzeria', 'crudi', 'pasticceria'];
    if (!validStations.includes(stationParam)) {
      return res.status(400).json({ error: `station non valido. Valori: ${validStations.join(', ')}` });
    }
    // 'cucina' = NULL o esplicito 'cucina' (categorie senza prep_station)
    const stationFilter = stationParam === 'cucina'
      ? `(c.prep_station IS NULL OR c.prep_station = 'cucina')`
      : `c.prep_station = $2`;
    const params = stationParam === 'cucina' ? [TENANT(req)] : [TENANT(req), stationParam];

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
         COALESCE(c.course_type, 'altro')   AS course_type,
         COALESCE(c.prep_station, 'cucina') AS prep_station,
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
         AND (c.is_beverage IS NULL OR c.is_beverage = false)
         AND ${stationFilter}
       GROUP BY o.id, o.created_at, o.order_type, o.customer_name, o.pickup_time,
                t.table_number, z.name,
                oi.id, oi.quantity, oi.status, oi.display_status, oi.workflow_status, oi.notes, oi.sent_at,
                oi.combo_menu_name, oi.combo_selections,
                mi.name, mi.prep_time_mins, c.course_type, c.prep_station
       ORDER BY
         CASE oi.display_status WHEN 'active' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END,
         oi.sent_at ASC`,
      params
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
        display_status:   row.display_status,
        workflow_status:  row.workflow_status,
        course_type:      row.course_type,
        prep_station:     row.prep_station,
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
    const tenantId = TENANT(req);

    const validStatuses = ['cooking', 'ready', 'served', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status non valido. Valori: ${validStatuses.join(', ')}` });
    }

    const { rows: [item] } = await pool.query(
      `UPDATE order_items SET
         status    = $1::varchar,
         ready_at  = CASE WHEN $1::varchar = 'ready'  AND ready_at  IS NULL THEN NOW() ELSE ready_at  END,
         served_at = CASE WHEN $1::varchar = 'served' AND served_at IS NULL THEN NOW() ELSE served_at END
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, id, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });

    getIO()?.emit('item-status-updated', {
      orderId: item.order_id,
      itemId: id,
      status,
    });

    if (status === 'served') {
      await pool.query(
        'DELETE FROM service_alerts WHERE order_item_id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      getIO()?.emit('item-served', { orderId: item.order_id, itemId: id });
      const { rows: [orderInfo] } = await pool.query(
        'SELECT waiter_id FROM orders WHERE id = $1 AND tenant_id = $2',
        [item.order_id, tenantId]
      );
      if (orderInfo) {
        trackItemServed(tenantId, orderInfo.waiter_id, item.ready_at, item.served_at);
      }
    }

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
          WHERE oi.id = $1 AND oi.tenant_id = $2`,
        [id, tenantId]
      );
      if (info) {
        getIO()?.to(`user:${info.waiter_id}`).emit('item-ready-notify', {
          orderId: item.order_id,
          itemId: id,
          itemName: info.item_name,
          quantity: info.quantity,
          tableNumber: info.table_number,
        });
        // Web Push: anche se l'app del cameriere e' chiusa, riceve push.
        // tag = orderId per non duplicare alert sullo stesso ordine.
        pushService.sendToUser(info.waiter_id, {
          title: `🍽️ Tavolo ${info.table_number} — Pronto`,
          body: `${info.quantity}× ${info.item_name}`,
          tag: `ready-${item.order_id}`,
          url: `/order/${item.order_id}`,
          vibrate: [200, 100, 200],
          requireInteraction: true,
        }).catch(() => {});
      }
    }

    res.json(item);
  } catch (err) { next(err); }
}

module.exports = { getPendingOrders, updateItemStatus };
