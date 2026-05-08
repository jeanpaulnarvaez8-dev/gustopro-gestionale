const pool = require('../config/db');
const { getIO } = require('../socket');
const { auditLog } = require('./workflow.controller');

// Tenant isolation: every order/item operation is scoped to req.tenant.id.
// Helper functions take tenantId as an explicit parameter because they
// receive a transaction client (not req).
const TENANT = (req) => req.tenant.id;

// ── Helpers ──────────────────────────────────────────────────

async function insertRegularItem(client, order_id, item, userId, tenantId) {
  const { menu_item_id, quantity = 1, notes: itemNotes, modifiers = [], weight_g, workflow_status = 'production' } = item;

  // menu_item must belong to the same tenant
  const { rows: [menuItem] } = await client.query(
    'SELECT base_price, pricing_type, name FROM menu_items WHERE id=$1 AND is_available=true AND tenant_id=$2',
    [menu_item_id, tenantId]
  );
  if (!menuItem) throw { status: 400, message: `Item ${menu_item_id} non disponibile` };

  let modifierTotal = 0;
  for (const mod of modifiers) {
    const { rows: [m] } = await client.query(
      'SELECT price_extra FROM modifiers WHERE id=$1 AND is_active=true AND tenant_id=$2',
      [mod.modifier_id, tenantId]
    );
    if (m) modifierTotal += parseFloat(m.price_extra);
  }

  let unitPrice = parseFloat(menuItem.base_price);
  let subtotal;

  if (menuItem.pricing_type === 'per_kg' && weight_g) {
    unitPrice = (parseFloat(menuItem.base_price) * weight_g) / 1000;
    subtotal = (unitPrice + modifierTotal) * quantity;
  } else {
    subtotal = (unitPrice + modifierTotal) * quantity;
  }

  const wfStatus = ['waiting', 'production', 'delivered'].includes(workflow_status) ? workflow_status : 'production';
  const itemStatus = wfStatus === 'delivered' ? 'served' : 'pending';
  const servedAt = wfStatus === 'delivered' ? new Date() : null;

  const { rows: [orderItem] } = await client.query(
    `INSERT INTO order_items
       (tenant_id, order_id, menu_item_id, quantity, unit_price, modifier_total, subtotal, notes, weight_g,
        workflow_status, status, inserted_by, served_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [tenantId, order_id, menu_item_id, quantity, unitPrice, modifierTotal, subtotal, itemNotes || null, weight_g || null,
     wfStatus, itemStatus, userId, servedAt]
  );

  for (const mod of modifiers) {
    const { rows: [m] } = await client.query(
      'SELECT price_extra FROM modifiers WHERE id=$1 AND tenant_id=$2',
      [mod.modifier_id, tenantId]
    );
    if (m) {
      await client.query(
        'INSERT INTO order_item_modifiers (tenant_id, order_item_id, modifier_id, price_extra) VALUES ($1,$2,$3,$4)',
        [tenantId, orderItem.id, mod.modifier_id, m.price_extra]
      );
    }
  }
  return orderItem;
}

async function insertComboItem(client, order_id, item, userId, tenantId) {
  const { combo_menu_id, quantity = 1, selections = [], notes: itemNotes, workflow_status = 'production' } = item;

  const { rows: [combo] } = await client.query(
    'SELECT id, name, price FROM combo_menus WHERE id=$1 AND is_active=true AND tenant_id=$2',
    [combo_menu_id, tenantId]
  );
  if (!combo) throw { status: 400, message: `Combo ${combo_menu_id} non disponibile` };

  const unitPrice = parseFloat(combo.price);
  const subtotal  = unitPrice * quantity;

  const wfStatus = ['waiting', 'production', 'delivered'].includes(workflow_status) ? workflow_status : 'production';
  const itemStatus = wfStatus === 'delivered' ? 'served' : 'pending';
  const servedAt = wfStatus === 'delivered' ? new Date() : null;

  const { rows: [orderItem] } = await client.query(
    `INSERT INTO order_items
       (tenant_id, order_id, menu_item_id, combo_menu_id, combo_menu_name, combo_selections,
        quantity, unit_price, modifier_total, subtotal, notes,
        workflow_status, status, inserted_by, served_at)
     VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [tenantId, order_id, combo.id, combo.name, JSON.stringify(selections),
     quantity, unitPrice, subtotal, itemNotes || null,
     wfStatus, itemStatus, userId, servedAt]
  );
  return orderItem;
}

// ── createOrder ───────────────────────────────────────────────

async function createOrder(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const {
      table_id, items, notes, covers = 1,
      order_type = 'table',
      customer_name, customer_phone, pickup_time,
    } = req.body;

    if (order_type === 'table' && !table_id) {
      return res.status(400).json({ error: 'table_id obbligatorio per ordini al tavolo' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items obbligatori' });
    }

    await client.query('BEGIN');

    // Race-condition guard, tenant-scoped
    if (order_type === 'table' && table_id) {
      await client.query(
        'SELECT id FROM tables WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [table_id, tenantId]
      );
      const { rows: existing } = await client.query(
        `SELECT id FROM orders WHERE table_id = $1 AND tenant_id = $2 AND status = 'open' LIMIT 1`,
        [table_id, tenantId]
      );
      if (existing.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Tavolo ha già un ordine aperto',
          existing_order_id: existing[0].id,
        });
      }
    }

    const { rows: [order] } = await client.query(
      `INSERT INTO orders
         (tenant_id, table_id, waiter_id, notes, order_type, customer_name, customer_phone, pickup_time, covers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tenantId, table_id || null, req.user.id, notes || null,
       order_type, customer_name || null, customer_phone || null, pickup_time || null,
       Math.max(1, parseInt(covers, 10) || 1)]
    );

    const orderItems = [];
    for (const item of items) {
      try {
        const oi = item.type === 'combo'
          ? await insertComboItem(client, order.id, item, req.user.id, tenantId)
          : await insertRegularItem(client, order.id, item, req.user.id, tenantId);
        orderItems.push(oi);

        const action = oi.workflow_status === 'delivered' ? 'direct_delivered' : 'item_insert';
        await auditLog(client, {
          tenant_id: tenantId,
          order_id: order.id,
          item_id: oi.id,
          action,
          to_value: oi.workflow_status,
          user_id: req.user.id,
          user_name: req.user.name,
          metadata: { item_name: item.type === 'combo' ? oi.combo_menu_name : undefined, quantity: oi.quantity },
        });
      } catch (e) {
        await client.query('ROLLBACK');
        return res.status(e.status || 400).json({ error: e.message || 'Errore item' });
      }
    }

    await client.query('COMMIT');

    // Re-fetch order so trigger-recalculated totals are included
    const { rows: [updatedOrder] } = await pool.query(
      'SELECT * FROM orders WHERE id=$1 AND tenant_id=$2',
      [order.id, tenantId]
    );

    // Alert admin per voci consegnato diretto
    const directDelivered = orderItems.filter(oi => oi.workflow_status === 'delivered');
    if (directDelivered.length > 0) {
      const tableInfo2 = table_id
        ? await pool.query('SELECT table_number FROM tables WHERE id=$1 AND tenant_id=$2', [table_id, tenantId])
        : null;
      const tNum = tableInfo2?.rows[0]?.table_number || 'ASPORTO';

      for (const dd of directDelivered) {
        const itemNameQ = await pool.query(
          "SELECT COALESCE(mi.name, $2) AS name FROM menu_items mi WHERE mi.id = $1 AND mi.tenant_id = $3",
          [dd.menu_item_id, dd.combo_menu_name || 'Item', tenantId]
        );
        const iName = itemNameQ.rows[0]?.name || 'Item';

        await pool.query(
          `INSERT INTO service_alerts (tenant_id, order_item_id, alert_type, is_mandatory, table_number, waiter_name, item_name)
           VALUES ($1, $2, 'direct_delivered', true, $3, $4, $5)
           ON CONFLICT (order_item_id, alert_type) DO NOTHING`,
          [tenantId, dd.id, tNum, req.user.name, iName]
        );

        getIO()?.to('role:admin').to('role:manager').emit('direct-delivered-alert', {
          orderId: order.id,
          itemId: dd.id,
          itemName: iName,
          quantity: dd.quantity,
          tableNumber: tNum,
          waiterName: req.user.name,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (table_id) {
      const tableInfo = await pool.query(
        'SELECT table_number FROM tables WHERE id=$1 AND tenant_id=$2',
        [table_id, tenantId]
      );
      getIO()?.emit('new-order', {
        orderId: order.id, tableId: table_id,
        tableNumber: tableInfo.rows[0]?.table_number,
        itemCount: orderItems.length,
        orderType: order_type,
      });
      getIO()?.emit('table-status-changed', {
        tableId: table_id, status: 'occupied', active_order_id: order.id,
      });
    } else {
      getIO()?.emit('new-order', {
        orderId: order.id, tableId: null,
        tableNumber: `ASPORTO - ${customer_name || ''}`,
        itemCount: orderItems.length,
        orderType: order_type,
        pickupTime: pickup_time,
      });
    }

    res.status(201).json({ ...updatedOrder, items: orderItems });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ── getOrder ─────────────────────────────────────────────────

async function getOrder(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = TENANT(req);
    const { rows: [order] } = await pool.query(
      'SELECT * FROM orders WHERE id=$1 AND tenant_id=$2',
      [id, tenantId]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

    const { rows: items } = await pool.query(
      `SELECT oi.*,
              COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = $1 AND oi.tenant_id = $2
       ORDER BY oi.sent_at`,
      [id, tenantId]
    );

    res.json({ ...order, items });
  } catch (err) { next(err); }
}

// ── addItems ─────────────────────────────────────────────────

async function addItems(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const { id: order_id } = req.params;
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items obbligatori' });
    }

    await client.query('BEGIN');

    const { rows: [order] } = await client.query(
      "SELECT * FROM orders WHERE id=$1 AND tenant_id=$2 AND status='open'",
      [order_id, tenantId]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato o già chiuso' });

    const addedItems = [];
    for (const item of items) {
      try {
        const oi = item.type === 'combo'
          ? await insertComboItem(client, order_id, item, req.user.id, tenantId)
          : await insertRegularItem(client, order_id, item, req.user.id, tenantId);
        addedItems.push(oi);

        const action = oi.workflow_status === 'delivered' ? 'direct_delivered' : 'item_insert';
        await auditLog(client, {
          tenant_id: tenantId,
          order_id,
          item_id: oi.id,
          action,
          to_value: oi.workflow_status,
          user_id: req.user.id,
          user_name: req.user.name,
          metadata: { quantity: oi.quantity },
        });
      } catch (e) {
        await client.query('ROLLBACK');
        return res.status(e.status || 400).json({ error: e.message || 'Errore item' });
      }
    }

    await client.query('COMMIT');

    const directDelivered = addedItems.filter(oi => oi.workflow_status === 'delivered');
    if (directDelivered.length > 0) {
      const tableInfo = order.table_id
        ? await pool.query('SELECT table_number FROM tables WHERE id=$1 AND tenant_id=$2', [order.table_id, tenantId])
        : null;
      const tNum = tableInfo?.rows[0]?.table_number || 'ASPORTO';

      for (const dd of directDelivered) {
        const itemNameQ = await pool.query(
          "SELECT COALESCE(mi.name, $2) AS name FROM menu_items mi WHERE mi.id = $1 AND mi.tenant_id = $3",
          [dd.menu_item_id, dd.combo_menu_name || 'Item', tenantId]
        );
        const iName = itemNameQ.rows[0]?.name || 'Item';

        await pool.query(
          `INSERT INTO service_alerts (tenant_id, order_item_id, alert_type, is_mandatory, table_number, waiter_name, item_name)
           VALUES ($1, $2, 'direct_delivered', true, $3, $4, $5)
           ON CONFLICT (order_item_id, alert_type) DO NOTHING`,
          [tenantId, dd.id, tNum, req.user.name, iName]
        );

        getIO()?.to('role:admin').to('role:manager').emit('direct-delivered-alert', {
          orderId: order_id,
          itemId: dd.id,
          itemName: iName,
          quantity: dd.quantity,
          tableNumber: tNum,
          waiterName: req.user.name,
          timestamp: new Date().toISOString(),
        });
      }
    }

    getIO()?.emit('order-item-added', { orderId: order_id, items: addedItems });
    res.status(201).json(addedItems);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ── cancelItem ───────────────────────────────────────────────

async function cancelItem(req, res, next) {
  try {
    const { id: order_id, itemId } = req.params;
    const tenantId = TENANT(req);

    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Solo admin o responsabili possono cancellare voci. Contatta un responsabile.' });
    }

    const { rows: [item] } = await pool.query(
      `UPDATE order_items SET status='cancelled' WHERE id=$1 AND order_id=$2 AND tenant_id=$3 RETURNING *`,
      [itemId, order_id, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });

    const itemNameQ = await pool.query(
      "SELECT COALESCE(mi.name, oi.combo_menu_name, 'Item') AS name FROM order_items oi LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id WHERE oi.id = $1 AND oi.tenant_id = $2",
      [itemId, tenantId]
    );
    await pool.query(
      `INSERT INTO order_audit_log (tenant_id, order_id, item_id, action, from_value, to_value, user_id, user_name, metadata)
       VALUES ($1,$2,$3,'item_delete',$4,'cancelled',$5,$6,$7)`,
      [tenantId, order_id, itemId, item.status, req.user.id, req.user.name,
       JSON.stringify({ item_name: itemNameQ.rows[0]?.name, quantity: item.quantity })]
    );

    res.json(item);
  } catch (err) { next(err); }
}

// ── cancelOrder ──────────────────────────────────────────────

async function cancelOrder(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const { id } = req.params;
    const { rows: [order] } = await client.query(
      "SELECT * FROM orders WHERE id=$1 AND tenant_id=$2 AND status='open'",
      [id, tenantId]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato o già chiuso' });

    await client.query('BEGIN');

    await client.query(
      "UPDATE order_items SET status='cancelled' WHERE order_id=$1 AND tenant_id=$2 AND status != 'cancelled'",
      [id, tenantId]
    );

    const { rows: [updated] } = await client.query(
      "UPDATE orders SET status='cancelled' WHERE id=$1 AND tenant_id=$2 RETURNING *",
      [id, tenantId]
    );

    await client.query('COMMIT');

    if (order.table_id) {
      await pool.query(
        "UPDATE tables SET status='free' WHERE id=$1 AND tenant_id=$2",
        [order.table_id, tenantId]
      );
      getIO()?.emit('table-status-changed', {
        tableId: order.table_id,
        status: 'free',
        active_order_id: null,
      });
    }

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { createOrder, getOrder, addItems, cancelItem, cancelOrder };
