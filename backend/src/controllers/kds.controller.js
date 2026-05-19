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
    // Effective prep_station per ITEM:
    //   1. menu_items.prep_station se non NULL (override per piatto)
    //   2. altrimenti categories.prep_station
    //   3. altrimenti 'cucina' (default backward compat)
    // Esempio Riva: "Cozze alla Tarantina" (cat Antipasti di Mare → cucina)
    // resta a cucina; "Tartare di Tonno" stessa cat ma item.prep_station='crudi'.
    const effectiveStation = `COALESCE(mi.prep_station, c.prep_station, 'cucina')`;
    const stationFilter = stationParam === 'cucina'
      ? `${effectiveStation} = 'cucina'`
      : `${effectiveStation} = $2`;
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
         mi.required_kit                    AS required_kit,
         COALESCE(c.course_type, 'altro')   AS course_type,
         COALESCE(mi.prep_station, c.prep_station, 'cucina') AS prep_station,
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
         -- Esclude 'ready' dalla coda: una volta che lo chef ha cliccato
         -- "Pronto" l'item passa al pass del cameriere, non serve piu' allo
         -- chef. Vedi /kds/history per il riepilogo di tutto cio' che e'
         -- passato (incluso ready/served/cancelled).
         AND oi.status NOT IN ('ready','served','cancelled')
         AND oi.workflow_status = 'production'
         AND oi.tenant_id = $1
         AND (c.is_beverage IS NULL OR c.is_beverage = false)
         AND ${stationFilter}
       GROUP BY o.id, o.created_at, o.order_type, o.customer_name, o.pickup_time,
                t.table_number, z.name,
                oi.id, oi.quantity, oi.status, oi.display_status, oi.workflow_status, oi.notes, oi.sent_at,
                oi.combo_menu_name, oi.combo_selections,
                mi.name, mi.prep_time_mins, mi.required_kit, mi.prep_station, c.course_type, c.prep_station
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
        required_kit:     row.required_kit,  // JSONB array di stringhe o null
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

    // 'oven_done' = fase intermedia pizza (sfornata, in attesa di finitura).
    // Non viene mai notificato al cameriere — solo internamente al pizzaiolo.
    const validStatuses = ['cooking', 'oven_done', 'ready', 'served', 'cancelled'];
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

      // ─── "10 qui = 10 là" coerenza pass ──────────────────────────
      // Quando un item diventa ready, verifico se TUTTI gli items dello
      // stesso course di QUELL'ordine sono pronti. Se sì → emette
      // 'course-ready-pass' al waiter + al pass cucina, cosi' il cameriere
      // sa che puo' portare tutto il course insieme (no piatti freddi).
      const { rows: course } = await pool.query(
        `SELECT
           COALESCE(c.course_type, 'altro') AS course_type,
           COUNT(*)                          AS total,
           COUNT(*) FILTER (
             WHERE oi.status IN ('ready','served')
           )                                 AS ready_count
         FROM order_items oi
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
         LEFT JOIN categories c  ON c.id = mi.category_id
         WHERE oi.order_id = $1 AND oi.tenant_id = $2
           AND oi.status != 'cancelled'
           AND COALESCE(c.course_type, 'altro') = (
             SELECT COALESCE(c2.course_type, 'altro')
               FROM order_items oi2
               LEFT JOIN menu_items mi2 ON mi2.id = oi2.menu_item_id
               LEFT JOIN categories c2  ON c2.id = mi2.category_id
              WHERE oi2.id = $3
           )
         GROUP BY COALESCE(c.course_type, 'altro')`,
        [item.order_id, tenantId, id]
      );
      const c0 = course[0];
      if (c0 && Number(c0.total) === Number(c0.ready_count) && Number(c0.total) >= 1 && info) {
        // Tutti gli items del course sono pronti → segnala coerenza pass.
        getIO()?.to(`user:${info.waiter_id}`).to('role:admin').to('role:manager').emit('course-ready-pass', {
          orderId: item.order_id,
          tableNumber: info.table_number,
          courseType: c0.course_type,
          itemsCount: Number(c0.total),
        });
        pushService.sendToUser(info.waiter_id, {
          title: `✅ Tavolo ${info.table_number} — ${c0.course_type} pronto`,
          body: `Tutti i ${c0.total} pezzi del ${c0.course_type} sono al pass. Servi insieme!`,
          tag: `course-ready-${item.order_id}-${c0.course_type}`,
          url: `/order/${item.order_id}`,
          vibrate: [400, 100, 200, 100, 200],
          requireInteraction: true,
        }).catch(() => {});
      }
    }

    res.json(item);
  } catch (err) { next(err); }
}

/**
 * getHistory — storico items KDS (tutto cio' che e' passato dalla coda,
 * incluso ready/served/cancelled). Usato per la pagina "Storico" del KDS.
 *
 * Query params:
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD  default oggi
 *   ?station=cucina|pizzeria|crudi|pasticceria|bar  default tutto
 *   ?status=ready|served|cancelled|all  default all
 *
 * Ritorna max 500 item, ordinati per sent_at DESC.
 */
async function getHistory(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const today = new Date().toISOString().slice(0, 10);
    const from = req.query.from || today;
    const to   = req.query.to   || today;
    const station = (req.query.station || 'all').toLowerCase();
    const statusFilter = (req.query.status || 'all').toLowerCase();

    const VALID_STATIONS = ['all','cucina','pizzeria','crudi','pasticceria','bar'];
    const VALID_STATUS   = ['all','pending','cooking','oven_done','ready','served','cancelled'];
    if (!VALID_STATIONS.includes(station)) return res.status(400).json({ error: 'station invalido' });
    if (!VALID_STATUS.includes(statusFilter)) return res.status(400).json({ error: 'status invalido' });

    const params = [tenantId, from, to];
    let where = `oi.tenant_id = $1
                 AND DATE(oi.sent_at AT TIME ZONE 'Europe/Rome') BETWEEN $2 AND $3`;

    if (station === 'bar') {
      where += ' AND c.is_beverage = true';
    } else if (station !== 'all') {
      where += ' AND (c.is_beverage IS NULL OR c.is_beverage = false)';
      if (station === 'cucina') {
        where += ` AND COALESCE(mi.prep_station, c.prep_station, 'cucina') = 'cucina'`;
      } else {
        params.push(station);
        where += ` AND COALESCE(mi.prep_station, c.prep_station, 'cucina') = $${params.length}`;
      }
    }
    if (statusFilter !== 'all') {
      params.push(statusFilter);
      where += ` AND oi.status = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT
         oi.id, oi.quantity, oi.status, oi.notes,
         oi.sent_at, oi.ready_at, oi.served_at,
         COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
         c.name AS category,
         COALESCE(mi.prep_station, c.prep_station, 'cucina') AS prep_station,
         c.is_beverage,
         o.id AS order_id,
         COALESCE(t.table_number, 'ASPORTO') AS table_number,
         u.name AS waiter_name,
         -- Durata cottura (sent → ready) in minuti
         CASE WHEN oi.ready_at IS NOT NULL
              THEN ROUND(EXTRACT(EPOCH FROM (oi.ready_at - oi.sent_at))/60.0, 1)
         END AS prep_minutes,
         -- Durata pass (ready → served) in minuti
         CASE WHEN oi.served_at IS NOT NULL AND oi.ready_at IS NOT NULL
              THEN ROUND(EXTRACT(EPOCH FROM (oi.served_at - oi.ready_at))/60.0, 1)
         END AS pass_minutes
       FROM order_items oi
       JOIN orders o          ON o.id = oi.order_id
       LEFT JOIN tables t     ON t.id = o.table_id
       LEFT JOIN users u      ON u.id = o.waiter_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c  ON c.id = mi.category_id
       WHERE ${where}
       ORDER BY oi.sent_at DESC
       LIMIT 500`,
      params
    );

    // Aggregati: totali per status + per stazione
    const { rows: [agg] } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE oi.status = 'served')::int AS served,
         COUNT(*) FILTER (WHERE oi.status = 'cancelled')::int AS cancelled,
         COALESCE(AVG(EXTRACT(EPOCH FROM (oi.ready_at - oi.sent_at))/60.0)
                  FILTER (WHERE oi.ready_at IS NOT NULL), 0)::numeric(10,1) AS avg_prep_min
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c  ON c.id = mi.category_id
       WHERE ${where}`,
      params
    );

    res.json({
      periodo: { from, to },
      filtro: { station, status: statusFilter },
      aggregati: agg,
      items: rows,
    });
  } catch (err) { next(err); }
}

module.exports = { getPendingOrders, updateItemStatus, getHistory };
