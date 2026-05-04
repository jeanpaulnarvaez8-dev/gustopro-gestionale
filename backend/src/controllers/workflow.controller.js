const pool = require('../config/db');
const { getIO } = require('../socket');

// Tenant isolation: ogni operazione su workflow/audit è scoped al tenant.
// Helper functions che ricevono un transaction client accettano tenantId
// come parametro esplicito.
const TENANT = (req) => req.tenant.id;

// ── Audit helper ────────────────────────────────────────────
async function auditLog(client, { tenant_id, order_id, item_id, action, from_value, to_value, user_id, user_name, metadata }) {
  if (!tenant_id) {
    throw new Error('auditLog: tenant_id obbligatorio per multi-tenant safety');
  }
  return client.query(
    `INSERT INTO order_audit_log (tenant_id, order_id, item_id, action, from_value, to_value, user_id, user_name, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tenant_id, order_id, item_id, action, from_value || null, to_value || null, user_id || null, user_name || null, metadata ? JSON.stringify(metadata) : null]
  );
}

// ── Cambia workflow_status di un singolo item ───────────────
async function changeWorkflowStatus(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const { itemId } = req.params;
    const { workflow_status } = req.body;

    if (!['waiting', 'production', 'delivered'].includes(workflow_status)) {
      return res.status(400).json({ error: 'workflow_status non valido. Valori: waiting, production, delivered' });
    }

    const { rows: [item] } = await client.query(
      `SELECT oi.*, o.waiter_id, o.table_id
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.id = $1 AND oi.tenant_id = $2`,
      [itemId, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });

    const isOwner = req.user.id === item.waiter_id;
    const isPrivileged = ['admin', 'manager'].includes(req.user.role);
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ error: 'Non autorizzato a modificare questo item' });
    }

    const from = item.workflow_status;
    if (from === workflow_status) {
      return res.status(400).json({ error: 'Lo stato e\' gia\' impostato' });
    }
    if (from === 'delivered') {
      return res.status(400).json({ error: 'Una voce consegnata non puo\' cambiare stato' });
    }
    if (from === 'production' && workflow_status === 'waiting') {
      return res.status(400).json({ error: 'Una voce in produzione non puo\' tornare in attesa' });
    }
    if (from === 'waiting' && workflow_status === 'delivered') {
      return res.status(400).json({ error: 'Una voce in attesa non puo\' diventare consegnata direttamente' });
    }

    await client.query('BEGIN');

    const isRelease = from === 'waiting' && workflow_status === 'production';

    const { rows: [updated] } = await client.query(
      `UPDATE order_items SET
         workflow_status = $1,
         released_at = CASE WHEN $3 THEN NOW() ELSE released_at END,
         status = CASE WHEN $3 THEN 'pending' ELSE status END
       WHERE id = $2 AND tenant_id = $4 RETURNING *`,
      [workflow_status, itemId, isRelease, tenantId]
    );

    const action = from === 'waiting' && workflow_status === 'production' ? 'alert_released' : 'workflow_change';
    await auditLog(client, {
      tenant_id: tenantId,
      order_id: item.order_id,
      item_id: itemId,
      action,
      from_value: from,
      to_value: workflow_status,
      user_id: req.user.id,
      user_name: req.user.name,
      metadata: { table_id: item.table_id },
    });

    await client.query('COMMIT');

    const io = getIO();
    if (io) {
      io.emit('workflow-status-changed', {
        orderId: item.order_id,
        itemId,
        from: from,
        to: workflow_status,
      });
      if (from === 'waiting' && workflow_status === 'production') {
        io.emit('item-released-to-production', {
          orderId: item.order_id,
          itemId,
        });
      }
    }

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function getWaitingItems(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         oi.id AS item_id, oi.order_id, oi.quantity, oi.notes,
         oi.inserted_at, oi.workflow_status,
         COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
         COALESCE(c.course_type, 'altro') AS course_type,
         COALESCE(c.is_beverage, false) AS is_beverage,
         COALESCE(t.table_number, 'ASPORTO') AS table_number,
         COALESCE(z.name, '') AS zone_name,
         o.waiter_id,
         u.name AS waiter_name,
         o.covers,
         EXTRACT(EPOCH FROM (NOW() - oi.inserted_at))::int AS seconds_waiting
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN tables t ON t.id = o.table_id
       LEFT JOIN zones z ON z.id = t.zone_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c ON c.id = mi.category_id
       LEFT JOIN users u ON u.id = o.waiter_id
       WHERE oi.workflow_status = 'waiting'
         AND oi.status NOT IN ('served', 'cancelled')
         AND o.status = 'open'
         AND oi.tenant_id = $1
       ORDER BY oi.inserted_at ASC`,
      [TENANT(req)]
    );

    const ordersMap = {};
    for (const row of rows) {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          order_id: row.order_id,
          table_number: row.table_number,
          zone_name: row.zone_name,
          waiter_name: row.waiter_name,
          covers: row.covers,
          items: [],
        };
      }
      ordersMap[row.order_id].items.push({
        id: row.item_id,
        name: row.item_name,
        quantity: row.quantity,
        course_type: row.course_type,
        is_beverage: row.is_beverage,
        notes: row.notes,
        seconds_waiting: row.seconds_waiting,
        inserted_at: row.inserted_at,
      });
    }
    res.json(Object.values(ordersMap));
  } catch (err) { next(err); }
}

async function getCrossmatches(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         mi.id AS menu_item_id,
         mi.name AS item_name,
         COALESCE(c.course_type, 'altro') AS course_type,
         COUNT(DISTINCT o.id) AS order_count,
         SUM(oi.quantity)::int AS total_quantity,
         json_agg(json_build_object(
           'order_id', o.id,
           'table_number', COALESCE(t.table_number, 'ASPORTO'),
           'quantity', oi.quantity,
           'workflow_status', oi.workflow_status,
           'item_id', oi.id
         ) ORDER BY t.table_number) AS orders
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c ON c.id = mi.category_id
       LEFT JOIN tables t ON t.id = o.table_id
       WHERE oi.workflow_status IN ('waiting', 'production')
         AND oi.status NOT IN ('served', 'cancelled')
         AND o.status = 'open'
         AND oi.tenant_id = $1
       GROUP BY mi.id, mi.name, c.course_type
       HAVING COUNT(DISTINCT o.id) > 1
       ORDER BY SUM(oi.quantity) DESC`,
      [TENANT(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function respondToAlert(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const { alertId } = req.params;
    const { action, defer_minutes } = req.body;

    if (!['release', 'defer'].includes(action)) {
      return res.status(400).json({ error: 'action deve essere "release" o "defer"' });
    }

    const { rows: [alert] } = await client.query(
      `SELECT sa.*, oi.order_id, oi.workflow_status, oi.id AS oi_id
       FROM service_alerts sa
       JOIN order_items oi ON oi.id = sa.order_item_id
       WHERE sa.id = $1 AND sa.acknowledged = false AND sa.tenant_id = $2`,
      [alertId, tenantId]
    );
    if (!alert) return res.status(404).json({ error: 'Alert non trovato o gia\' gestito' });

    await client.query('BEGIN');

    if (action === 'release') {
      if (alert.workflow_status === 'waiting') {
        await client.query(
          `UPDATE order_items SET workflow_status = 'production', released_at = NOW(), status = 'pending'
             WHERE id = $1 AND tenant_id = $2`,
          [alert.oi_id, tenantId]
        );
      }
      await client.query(
        'UPDATE service_alerts SET acknowledged = true WHERE id = $1 AND tenant_id = $2',
        [alertId, tenantId]
      );
      await auditLog(client, {
        tenant_id: tenantId,
        order_id: alert.order_id,
        item_id: alert.oi_id,
        action: 'alert_released',
        from_value: 'waiting',
        to_value: 'production',
        user_id: req.user.id,
        user_name: req.user.name,
      });

      await client.query('COMMIT');

      const io = getIO();
      if (io) {
        io.emit('workflow-status-changed', {
          orderId: alert.order_id,
          itemId: alert.oi_id,
          from: 'waiting',
          to: 'production',
        });
        io.emit('item-released-to-production', {
          orderId: alert.order_id,
          itemId: alert.oi_id,
        });
      }

      res.json({ status: 'released', item_id: alert.oi_id });
    } else {
      const minutes = Math.max(1, Math.min(parseInt(defer_minutes) || 3, 30));
      const deferEntry = { deferred_at: new Date().toISOString(), minutes, user_id: req.user.id };

      await client.query(
        `UPDATE service_alerts SET
           postponed_until = NOW() + make_interval(mins => $1),
           defer_count = defer_count + 1,
           defer_history = defer_history || $2::jsonb
         WHERE id = $3 AND tenant_id = $4`,
        [minutes, JSON.stringify([deferEntry]), alertId, tenantId]
      );
      await auditLog(client, {
        tenant_id: tenantId,
        order_id: alert.order_id,
        item_id: alert.oi_id,
        action: 'alert_deferred',
        from_value: null,
        to_value: `${minutes}min`,
        user_id: req.user.id,
        user_name: req.user.name,
        metadata: { defer_minutes: minutes, defer_count: alert.defer_count + 1 },
      });

      await client.query('COMMIT');
      res.json({ status: 'deferred', minutes, defer_count: alert.defer_count + 1 });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function getPendingAlerts(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT sa.*,
              oi.order_id, oi.quantity, oi.workflow_status,
              COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
              COALESCE(t.table_number, 'ASPORTO') AS table_number,
              COALESCE(z.name, '') AS zone_name
       FROM service_alerts sa
       JOIN order_items oi ON oi.id = sa.order_item_id
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN tables t ON t.id = o.table_id
       LEFT JOIN zones z ON z.id = t.zone_id
       WHERE sa.acknowledged = false
         AND sa.is_mandatory = true
         AND o.status = 'open'
         AND (sa.target_user_id = $1 OR sa.target_user_id IS NULL)
         AND (sa.postponed_until IS NULL OR sa.postponed_until <= NOW())
         AND sa.tenant_id = $2
       ORDER BY sa.created_at ASC`,
      [req.user.id, TENANT(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function getDirectDeliveredAlerts(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT al.*,
              COALESCE(t.table_number, 'ASPORTO') AS table_number,
              COALESCE(z.name, '') AS zone_name
       FROM order_audit_log al
       LEFT JOIN orders o ON o.id = al.order_id
       LEFT JOIN tables t ON t.id = o.table_id
       LEFT JOIN zones z ON z.id = t.zone_id
       WHERE al.action = 'direct_delivered' AND al.tenant_id = $1
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [TENANT(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function deleteItem(req, res, next) {
  if (!['admin', 'manager'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Solo admin o responsabili possono cancellare voci' });
  }

  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const { itemId } = req.params;

    const { rows: [item] } = await client.query(
      `SELECT oi.*, o.table_id,
              COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
              COALESCE(t.table_number, 'ASPORTO') AS table_number
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN tables t ON t.id = o.table_id
       WHERE oi.id = $1 AND oi.tenant_id = $2`,
      [itemId, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });

    await client.query('BEGIN');

    await client.query(
      "UPDATE order_items SET status = 'cancelled' WHERE id = $1 AND tenant_id = $2",
      [itemId, tenantId]
    );

    await auditLog(client, {
      tenant_id: tenantId,
      order_id: item.order_id,
      item_id: itemId,
      action: 'item_delete',
      from_value: item.status,
      to_value: 'cancelled',
      user_id: req.user.id,
      user_name: req.user.name,
      metadata: {
        item_name: item.item_name,
        table_number: item.table_number,
        quantity: item.quantity,
        subtotal: item.subtotal,
      },
    });

    await client.query('COMMIT');

    getIO()?.emit('item-status-updated', {
      orderId: item.order_id,
      itemId,
      status: 'cancelled',
    });

    res.json({ deleted: true, item_id: itemId });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function getAuditLog(req, res, next) {
  try {
    const { orderId } = req.params;
    const { rows } = await pool.query(
      `SELECT al.*,
              COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name
       FROM order_audit_log al
       LEFT JOIN order_items oi ON oi.id = al.item_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE al.order_id = $1 AND al.tenant_id = $2
       ORDER BY al.created_at ASC`,
      [orderId, TENANT(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = {
  changeWorkflowStatus,
  getWaitingItems,
  getCrossmatches,
  respondToAlert,
  getPendingAlerts,
  getDirectDeliveredAlerts,
  deleteItem,
  getAuditLog,
  auditLog,
};
