const pool = require('../config/db');
const { getIO } = require('../socket');

// ── Helpers ──────────────────────────────────────────────────

async function insertRegularItem(client, order_id, item) {
  const { menu_item_id, quantity = 1, notes: itemNotes, modifiers = [] } = item;

  const { rows: [menuItem] } = await client.query(
    'SELECT base_price, name FROM menu_items WHERE id=$1 AND is_available=true',
    [menu_item_id]
  );
  if (!menuItem) throw { status: 400, message: `Item ${menu_item_id} non disponibile` };

  let modifierTotal = 0;
  for (const mod of modifiers) {
    const { rows: [m] } = await client.query(
      'SELECT price_extra FROM modifiers WHERE id=$1 AND is_active=true', [mod.modifier_id]
    );
    if (m) modifierTotal += parseFloat(m.price_extra);
  }

  const unitPrice = parseFloat(menuItem.base_price);
  const subtotal  = (unitPrice + modifierTotal) * quantity;

  const { rows: [orderItem] } = await client.query(
    `INSERT INTO order_items
       (order_id, menu_item_id, quantity, unit_price, modifier_total, subtotal, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [order_id, menu_item_id, quantity, unitPrice, modifierTotal, subtotal, itemNotes || null]
  );

  for (const mod of modifiers) {
    const { rows: [m] } = await client.query(
      'SELECT price_extra FROM modifiers WHERE id=$1', [mod.modifier_id]
    );
    if (m) {
      await client.query(
        'INSERT INTO order_item_modifiers (order_item_id, modifier_id, price_extra) VALUES ($1,$2,$3)',
        [orderItem.id, mod.modifier_id, m.price_extra]
      );
    }
  }
  return orderItem;
}

async function insertComboItem(client, order_id, item) {
  const { combo_menu_id, quantity = 1, selections = [], notes: itemNotes } = item;

  const { rows: [combo] } = await client.query(
    'SELECT id, name, price FROM combo_menus WHERE id=$1 AND is_active=true',
    [combo_menu_id]
  );
  if (!combo) throw { status: 400, message: `Combo ${combo_menu_id} non disponibile` };

  const unitPrice = parseFloat(combo.price);
  const subtotal  = unitPrice * quantity;

  const { rows: [orderItem] } = await client.query(
    `INSERT INTO order_items
       (order_id, menu_item_id, combo_menu_id, combo_menu_name, combo_selections,
        quantity, unit_price, modifier_total, subtotal, notes)
     VALUES ($1,NULL,$2,$3,$4,$5,$6,0,$7,$8) RETURNING *`,
    [order_id, combo.id, combo.name, JSON.stringify(selections),
     quantity, unitPrice, subtotal, itemNotes || null]
  );
  return orderItem;
}

// ── createOrder ───────────────────────────────────────────────

async function createOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      table_id, items, notes,
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

    const { rows: [order] } = await client.query(
      `INSERT INTO orders
         (table_id, waiter_id, notes, order_type, customer_name, customer_phone, pickup_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [table_id || null, req.user.id, notes || null,
       order_type, customer_name || null, customer_phone || null, pickup_time || null]
    );

    const orderItems = [];
    for (const item of items) {
      try {
        const oi = item.type === 'combo'
          ? await insertComboItem(client, order.id, item)
          : await insertRegularItem(client, order.id, item);
        orderItems.push(oi);
      } catch (e) {
        await client.query('ROLLBACK');
        return res.status(e.status || 400).json({ error: e.message || 'Errore item' });
      }
    }

    await client.query('COMMIT');

    // Re-fetch order so trigger-recalculated totals are included
    const { rows: [updatedOrder] } = await pool.query('SELECT * FROM orders WHERE id=$1', [order.id]);

    // Emit events
    if (table_id) {
      const tableInfo = await pool.query('SELECT table_number FROM tables WHERE id=$1', [table_id]);
      getIO()?.to('role:kitchen').emit('new-order', {
        orderId: order.id, tableId: table_id,
        tableNumber: tableInfo.rows[0]?.table_number,
        itemCount: orderItems.length,
        orderType: order_type,
      });
      getIO()?.emit('table-status-changed', {
        tableId: table_id, status: 'occupied', active_order_id: order.id,
      });
    } else {
      // Asporto → notify kitchen directly
      getIO()?.to('role:kitchen').emit('new-order', {
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
    const { rows: [order] } = await pool.query('SELECT * FROM orders WHERE id=$1', [id]);
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

    const { rows: items } = await pool.query(
      `SELECT oi.*,
              COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = $1
       ORDER BY oi.sent_at`,
      [id]
    );

    res.json({ ...order, items });
  } catch (err) { next(err); }
}

// ── addItems ─────────────────────────────────────────────────

async function addItems(req, res, next) {
  const client = await pool.connect();
  try {
    const { id: order_id } = req.params;
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items obbligatori' });
    }

    await client.query('BEGIN');

    const { rows: [order] } = await client.query(
      "SELECT * FROM orders WHERE id=$1 AND status='open'", [order_id]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato o già chiuso' });

    const addedItems = [];
    for (const item of items) {
      try {
        const oi = item.type === 'combo'
          ? await insertComboItem(client, order_id, item)
          : await insertRegularItem(client, order_id, item);
        addedItems.push(oi);
      } catch (e) {
        await client.query('ROLLBACK');
        return res.status(e.status || 400).json({ error: e.message || 'Errore item' });
      }
    }

    await client.query('COMMIT');

    getIO()?.to('role:kitchen').emit('order-item-added', { orderId: order_id, items: addedItems });
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
    const { rows: [item] } = await pool.query(
      `UPDATE order_items SET status='cancelled' WHERE id=$1 AND order_id=$2 RETURNING *`,
      [itemId, order_id]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });
    res.json(item);
  } catch (err) { next(err); }
}

// ── cancelOrder ──────────────────────────────────────────────

async function cancelOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rows: [order] } = await client.query(
      "SELECT * FROM orders WHERE id=$1 AND status='open'", [id]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato o già chiuso' });

    await client.query('BEGIN');

    // Cancel all non-cancelled items
    await client.query(
      "UPDATE order_items SET status='cancelled' WHERE order_id=$1 AND status != 'cancelled'",
      [id]
    );

    // Mark order cancelled
    const { rows: [updated] } = await client.query(
      "UPDATE orders SET status='cancelled' WHERE id=$1 RETURNING *", [id]
    );

    await client.query('COMMIT');

    // Free the table
    if (order.table_id) {
      await pool.query("UPDATE tables SET status='free' WHERE id=$1", [order.table_id]);
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
