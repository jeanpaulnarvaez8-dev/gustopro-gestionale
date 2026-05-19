/**
 * Comandista — Banco del pass. Lo chef (o un addetto dedicato) vede:
 *   1. Ordini con tutti items 'ready' (pronti al pass per ritiro)
 *   2. Pulsante "Chiama cameriere" per ogni ordine
 *   3. Storico chiamate aperte (acknowledge automatico al pickup)
 *
 * Workflow integrazione "10=10":
 *   - Chef marca tutti gli items di un course ready → emit course-ready-pass
 *   - Banco vede l'ordine in "pronto al pass"
 *   - Click "Chiama cameriere" → emit socket + push al waiter
 *   - Cameriere arriva, scansiona QR/NFC del tavolo → conferma pickup
 *   - Sistema: items.status='served' + pass_call.acknowledged
 */
const pool = require('../config/db');
const { getIO } = require('../socket');
const pushService = require('../services/pushService');

const TENANT = (req) => req.tenant.id;

/** GET /api/comandista/ready — ordini con tutti items 'ready' (al pass). */
async function getReadyOrders(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const { rows } = await pool.query(
      `WITH order_items_active AS (
         SELECT oi.order_id,
                COUNT(*) FILTER (WHERE oi.status = 'ready')::int AS ready_items,
                COUNT(*) FILTER (WHERE oi.status NOT IN ('cancelled','served'))::int AS total_active
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.tenant_id = $1 AND o.status = 'open' AND oi.workflow_status = 'production'
         GROUP BY oi.order_id
       )
       SELECT
         o.id AS order_id,
         o.created_at AS order_created_at,
         o.order_type,
         COALESCE(t.table_number, 'ASPORTO') AS table_number,
         t.id AS table_id,
         u.name AS waiter_name,
         u.id   AS waiter_id,
         oia.ready_items, oia.total_active,
         (SELECT jsonb_agg(jsonb_build_object(
            'id', oi2.id, 'quantity', oi2.quantity, 'status', oi2.status,
            'name', COALESCE(mi.name, oi2.combo_menu_name, 'Item'),
            'prep_station', COALESCE(mi.prep_station, c.prep_station, 'cucina'),
            'required_kit', mi.required_kit
          ) ORDER BY oi2.sent_at)
          FROM order_items oi2
          LEFT JOIN menu_items mi ON mi.id = oi2.menu_item_id
          LEFT JOIN categories c  ON c.id = mi.category_id
          WHERE oi2.order_id = o.id AND oi2.tenant_id = $1
            AND oi2.status NOT IN ('cancelled','served')) AS items,
         (SELECT MIN(called_at) FROM pass_calls
          WHERE order_id = o.id AND tenant_id = $1 AND acknowledged_at IS NULL) AS open_call_at
       FROM order_items_active oia
       JOIN orders o ON o.id = oia.order_id AND o.tenant_id = $1
       LEFT JOIN tables t ON t.id = o.table_id
       LEFT JOIN users u  ON u.id = o.waiter_id
       WHERE oia.ready_items > 0
       ORDER BY oia.ready_items::float / NULLIF(oia.total_active,0) DESC, o.created_at`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/** POST /api/comandista/call/:orderId — chef chiama il cameriere al pass. */
async function callWaiter(req, res, next) {
  try {
    const { orderId } = req.params;
    const tenantId = TENANT(req);

    const { rows: [order] } = await pool.query(
      `SELECT o.id, o.waiter_id, o.table_id,
              COALESCE(t.table_number, 'ASPORTO') AS table_number,
              u.name AS waiter_name
         FROM orders o
         LEFT JOIN tables t ON t.id = o.table_id
         LEFT JOIN users u  ON u.id = o.waiter_id
         WHERE o.id = $1 AND o.tenant_id = $2`,
      [orderId, tenantId]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

    const { rows: [call] } = await pool.query(
      `INSERT INTO pass_calls (tenant_id, order_id, called_by, called_at)
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [tenantId, orderId, req.user.id]
    );

    // Socket event al cameriere assegnato + admin (per visibilita')
    getIO()?.to(`user:${order.waiter_id}`).to('role:admin').to('role:manager').emit('pass-call', {
      callId: call.id,
      orderId,
      tableNumber: order.table_number,
      tableId: order.table_id,
      calledByName: req.user.name,
      waiterName: order.waiter_name,
    });

    // Push native al cameriere (gli arriva anche con app chiusa)
    pushService.sendToUser(order.waiter_id, {
      title: `🛎️ Tavolo ${order.table_number} — Ritira al pass`,
      body: `Banco comandista pronto. Vai a prendere i piatti.`,
      tag: `pass-call-${orderId}`,
      url: `/order/${orderId}`,
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
    }).catch(() => {});

    res.status(201).json(call);
  } catch (err) { next(err); }
}

/**
 * POST /api/comandista/pickup/:orderId — conferma ritiro al pass.
 *
 * Body: { item_ids: [uuid], method: 'manual'|'qr'|'nfc' (default manual) }
 *
 * Effetti:
 *   - order_items.status = 'served' per gli items passati
 *   - INSERT pickup_confirmations
 *   - acknowledge tutte le pass_calls aperte dell'ordine
 *   - Se TUTTI gli items dell'ordine sono served e ordine = open,
 *     emette socket per aggiornare la mappa
 */
async function confirmPickup(req, res, next) {
  const client = await pool.connect();
  try {
    const { orderId } = req.params;
    const tenantId = TENANT(req);
    const { item_ids, method = 'manual' } = req.body || {};
    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ error: 'item_ids array obbligatorio' });
    }

    await client.query('BEGIN');

    // 1. Mark items as served
    const { rows: itemsUpdated } = await client.query(
      `UPDATE order_items
          SET status = 'served', served_at = NOW()
        WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND order_id = $3
              AND status = 'ready'
        RETURNING id, order_id`,
      [item_ids, tenantId, orderId]
    );

    // 2. Get order details for socket
    const { rows: [order] } = await client.query(
      `SELECT o.id, o.waiter_id, o.table_id,
              COALESCE(t.table_number, 'ASPORTO') AS table_number
         FROM orders o LEFT JOIN tables t ON t.id = o.table_id
         WHERE o.id = $1 AND o.tenant_id = $2`,
      [orderId, tenantId]
    );

    // 3. Insert pickup confirmation
    const { rows: [conf] } = await client.query(
      `INSERT INTO pickup_confirmations
         (tenant_id, order_id, table_id, item_ids, method, picked_up_by, called_at)
       VALUES ($1, $2, $3, $4, $5, $6, (
         SELECT MAX(called_at) FROM pass_calls
          WHERE order_id = $2 AND acknowledged_at IS NULL
       ))
       RETURNING *`,
      [tenantId, orderId, order?.table_id, item_ids, method, req.user.id]
    );

    // 4. Acknowledge open pass_calls
    await client.query(
      `UPDATE pass_calls
          SET acknowledged_at = NOW(), acknowledged_by = $1
        WHERE order_id = $2 AND tenant_id = $3 AND acknowledged_at IS NULL`,
      [req.user.id, orderId, tenantId]
    );

    await client.query('COMMIT');

    // 5. Socket: emette items-served per ognuno (compat KDS UI)
    const io = getIO();
    for (const it of itemsUpdated) {
      io?.emit('item-served', { orderId, itemId: it.id });
    }
    io?.emit('items-batch-updated', {
      itemIds: itemsUpdated.map(i => i.id),
      orderIds: [orderId],
      status: 'served',
      count: itemsUpdated.length,
    });

    res.status(201).json({ confirmation: conf, served: itemsUpdated.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/** GET /api/comandista/open-calls — chiamate al pass non acknowledged (per banner). */
async function getOpenCalls(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const { rows } = await pool.query(
      `SELECT pc.id, pc.order_id, pc.called_at, pc.called_by, u.name AS called_by_name,
              COALESCE(t.table_number, 'ASPORTO') AS table_number,
              EXTRACT(EPOCH FROM (NOW() - pc.called_at))/60.0 AS minutes_ago
         FROM pass_calls pc
         LEFT JOIN orders o ON o.id = pc.order_id
         LEFT JOIN tables t ON t.id = o.table_id
         LEFT JOIN users u  ON u.id = pc.called_by
         WHERE pc.tenant_id = $1 AND pc.acknowledged_at IS NULL
         ORDER BY pc.called_at`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { getReadyOrders, callWaiter, confirmPickup, getOpenCalls };
