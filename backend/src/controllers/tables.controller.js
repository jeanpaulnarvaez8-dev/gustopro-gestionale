const pool = require('../config/db');
const { getIO } = require('../socket');
const { TABLE_STATUSES } = require('../config/constants');

// Tenant isolation: every table operation is scoped to req.tenant.id.
// The view tables_with_active_order propagates the tables.tenant_id column,
// so filtering on it is sufficient to scope the listing.
const TENANT = (req) => req.tenant.id;

async function listTables(req, res, next) {
  try {
    // Aggrega la prossima prenotazione imminente per ogni tavolo (entro 4h).
    // Schema reservations: reserved_date (date) + reserved_time (time) →
    // unisco in timestamp per il filtro temporale + sorting.
    // Frontend usa `next_reservation_at` per mostrare countdown pre-arrival.
    // JP 2026-06-07: espongo anche covers, active_waiter_name e
    // active_items_count (numero piatti vivi sul tavolo). La view base
    // tables_with_active_order non li ha → JOIN con orders + users +
    // LATERAL count su order_items.
    const { rows } = await pool.query(
      `SELECT t.*,
              o.covers,                     -- numero persone al tavolo
              o.customer_name AS order_customer_name,
              u.name AS active_waiter_name, -- chi gestisce il tavolo
              COALESCE(ic.active_items_count, 0) AS active_items_count,
              r.reservation_at,
              r.customer_name AS next_reservation_guest,
              r.party_size    AS next_reservation_party_size,
              COALESCE(w.waiting_count, 0) AS waiting_items_count
       FROM tables_with_active_order t
       LEFT JOIN orders o ON o.id = t.active_order_id AND o.status='open'
       LEFT JOIN users u ON u.id = t.active_waiter_id
       LEFT JOIN LATERAL (
         /* JP 2026-06-07: piatti vivi = non cancellati. Per badge
            "N piatti" sulla card del tavolo. */
         SELECT COUNT(*)::int AS active_items_count
         FROM order_items oi
         WHERE oi.order_id = t.active_order_id
           AND oi.status <> 'cancelled'
           AND COALESCE(oi.is_surcharge, false) = false
       ) ic ON true
       LEFT JOIN LATERAL (
         SELECT
           (reserved_date + reserved_time) AT TIME ZONE 'Europe/Rome' AS reservation_at,
           customer_name, party_size
         FROM reservations
         WHERE table_id = t.id
           AND tenant_id = $1
           AND status = 'confirmed'
           AND (reserved_date + reserved_time) AT TIME ZONE 'Europe/Rome' >= NOW()
           AND (reserved_date + reserved_time) AT TIME ZONE 'Europe/Rome' < NOW() + INTERVAL '4 hours'
         ORDER BY reserved_date, reserved_time
         LIMIT 1
       ) r ON true
       LEFT JOIN LATERAL (
         /* JP 2026-05-27: tavoli con piatti IN ATTESA (workflow_status='waiting',
            non ancora mandati in cucina) devono avere colore diverso. */
         SELECT COUNT(*)::int AS waiting_count
         FROM order_items oi
         WHERE oi.order_id = t.active_order_id
           AND oi.workflow_status = 'waiting'
           AND oi.status <> 'cancelled'
       ) w ON true
       WHERE t.tenant_id = $1
       ORDER BY t.table_number`,
      [TENANT(req)]
    );
    res.json(rows.map((row) => ({
      ...row,
      // Alias clean per il frontend (camelCase)
      next_reservation_at: row.reservation_at,
    })));
  } catch (err) { next(err); }
}

async function createTable(req, res, next) {
  try {
    const { zone_id, table_number, seats = 2, pos_x = 10, pos_y = 10, shape = 'circle', width = 60, height = 60, rotation = 0 } = req.body;
    if (!zone_id || !table_number) {
      return res.status(400).json({ error: 'zone_id e table_number obbligatori' });
    }
    const { rows } = await pool.query(
      `INSERT INTO tables (tenant_id, zone_id, table_number, seats, pos_x, pos_y, shape, width, height, rotation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [TENANT(req), zone_id, table_number, seats, pos_x, pos_y, shape, width, height, rotation]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function updateTable(req, res, next) {
  try {
    const { id } = req.params;
    const { table_number, seats, pos_x, pos_y, zone_id, shape, width, height, rotation } = req.body;
    const { rows } = await pool.query(
      `UPDATE tables SET
         table_number = COALESCE($1, table_number),
         seats        = COALESCE($2, seats),
         pos_x        = COALESCE($3, pos_x),
         pos_y        = COALESCE($4, pos_y),
         zone_id      = COALESCE($5, zone_id),
         shape        = COALESCE($6, shape),
         width        = COALESCE($7, width),
         height       = COALESCE($8, height),
         rotation     = COALESCE($9, rotation)
       WHERE id=$10 AND tenant_id=$11 RETURNING *`,
      [table_number || null, seats ?? null, pos_x ?? null, pos_y ?? null, zone_id || null,
       shape ?? null, width ?? null, height ?? null, rotation ?? null, id, TENANT(req)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tavolo non trovato' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteTable(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT status FROM tables WHERE id=$1 AND tenant_id=$2`,
      [id, TENANT(req)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tavolo non trovato' });
    if (rows[0].status === 'occupied') {
      return res.status(400).json({ error: 'Impossibile eliminare un tavolo occupato.' });
    }
    const result = await pool.query(
      'DELETE FROM tables WHERE id=$1 AND tenant_id=$2',
      [id, TENANT(req)]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Tavolo non trovato' });
    res.status(204).end();
  } catch (err) { next(err); }
}

async function setTableStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!TABLE_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status non valido. Valori: ${TABLE_STATUSES.join(', ')}` });
    }
    const { rows } = await pool.query(
      'UPDATE tables SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *',
      [status, id, TENANT(req)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tavolo non trovato' });

    getIO()?.emit('table-status-changed', { tableId: id, status });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * seatTable — accomoda un cliente al tavolo (PRIMA dell'ordine).
 *
 * Workflow Riva ciclo sala:
 *   free → seated (qui) → occupied (alla createOrder) → dirty (pagamento) → free
 *
 * Imposta tables.status='seated' + seated_at=NOW(). Lo serviceTimer.js
 * monitora i tavoli seated da > 10min e emette alert "presa comanda" con
 * pulsante delega.
 *
 * Body opzionale: { covers?: number, waiter_id?: uuid }
 * Default: covers=1, waiter_id=req.user.id (l'accompagnatore).
 */
async function seatTable(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = TENANT(req);
    const { covers = 1, waiter_id } = req.body || {};

    // Verifica stato corrente: solo da 'free' o 'reserved' si puo' accomodare
    const { rows: [existing] } = await pool.query(
      'SELECT id, status FROM tables WHERE id=$1 AND tenant_id=$2',
      [id, tenantId]
    );
    if (!existing) return res.status(404).json({ error: 'Tavolo non trovato' });
    if (!['free','reserved'].includes(existing.status)) {
      return res.status(409).json({
        error: `Tavolo in stato '${existing.status}' — solo da 'free' o 'reserved' si puo' accomodare.`,
      });
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE tables
         SET status = 'seated',
             seated_at = NOW(),
             first_order_at = NULL,
             current_course = NULL,
             last_course_served_at = NULL,
             last_course_ready_at = NULL
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId]
    );

    // Audit: chi ha accomodato (per analytics + accountability)
    await pool.query(
      `INSERT INTO order_audit_log (tenant_id, order_id, action, user_id, user_name, metadata)
       VALUES ($1, NULL, 'table_seated', $2, $3, $4::jsonb)`,
      [tenantId, req.user.id, req.user.name, JSON.stringify({
        table_id: id,
        table_number: existing.id, // logged for join
        covers,
        seated_by: req.user.name,
        designated_waiter_id: waiter_id || null,
      })]
    ).catch(() => {});

    getIO()?.emit('table-status-changed', {
      tableId: id, status: 'seated', active_order_id: null,
    });
    getIO()?.emit('table-seated', {
      tableId: id, covers, waiterId: waiter_id || req.user.id,
      seatedByName: req.user.name,
    });

    res.json(updated);
  } catch (err) { next(err); }
}

/**
 * delegateTable — manda push native a un cameriere chiedendogli di prendere
 * la comanda di un tavolo seated. Usato dal maitre quando scatta l'alert
 * "tavolo seated > 10min" → click "Delega" → pick cameriere → push.
 */
async function delegateTable(req, res, next) {
  try {
    const { id } = req.params;
    const { to_waiter_id, reason } = req.body || {};
    const tenantId = TENANT(req);
    if (!to_waiter_id) return res.status(400).json({ error: 'to_waiter_id obbligatorio' });

    const { rows: [target] } = await pool.query(
      `SELECT id, name FROM users WHERE id=$1 AND tenant_id=$2 AND is_active=true AND role='waiter'`,
      [to_waiter_id, tenantId]
    );
    if (!target) return res.status(404).json({ error: 'Cameriere non valido' });

    const { rows: [tbl] } = await pool.query(
      'SELECT table_number, status FROM tables WHERE id=$1 AND tenant_id=$2',
      [id, tenantId]
    );
    if (!tbl) return res.status(404).json({ error: 'Tavolo non trovato' });

    // Audit
    await pool.query(
      `INSERT INTO order_audit_log (tenant_id, order_id, action, user_id, user_name, metadata)
       VALUES ($1, NULL, 'table_delegated', $2, $3, $4::jsonb)`,
      [tenantId, req.user.id, req.user.name, JSON.stringify({
        table_id: id, table_number: tbl.table_number,
        from_user_id: req.user.id, to_user_id: to_waiter_id,
        to_user_name: target.name, reason: reason || 'delega manuale',
      })]
    ).catch(() => {});

    // Socket: notifica al cameriere designato
    getIO()?.to(`user:${target.id}`).emit('table-delegated', {
      tableId: id, tableNumber: tbl.table_number,
      fromUserName: req.user.name, reason,
    });
    // Push native (anche se app chiusa)
    const pushService = require('../services/pushService');
    pushService.sendToUser(target.id, {
      title: `📢 Tavolo ${tbl.table_number} — Vai a prendere comanda`,
      body: `Delegato da ${req.user.name}${reason ? ' · ' + reason : ''}`,
      tag: `delega-${id}`,
      url: '/tables',
      vibrate: [300, 100, 300],
      requireInteraction: true,
    }).catch(() => {});

    res.json({ ok: true, delegated_to: { id: target.id, name: target.name } });
  } catch (err) { next(err); }
}

module.exports = { listTables, createTable, updateTable, deleteTable, setTableStatus, seatTable, delegateTable };
