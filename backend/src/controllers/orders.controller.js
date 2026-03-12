const pool = require('../config/db');
const { getIO } = require('../socket');

async function createOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const { table_id, items, notes } = req.body;
    if (!table_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'table_id e items obbligatori' });
    }

    await client.query('BEGIN');

    // Create order
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (table_id, waiter_id, notes)
       VALUES ($1,$2,$3) RETURNING *`,
      [table_id, req.user.id, notes || null]
    );

    const orderItems = [];
    for (const item of items) {
      const { menu_item_id, quantity = 1, notes: itemNotes, modifiers = [] } = item;

      // Fetch current price from DB (never trust client price)
      const { rows: [menuItem] } = await client.query(
        'SELECT base_price FROM menu_items WHERE id=$1 AND is_available=true',
        [menu_item_id]
      );
      if (!menuItem) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Item ${menu_item_id} non disponibile` });
      }

      // Calculate modifier total
      let modifierTotal = 0;
      for (const mod of modifiers) {
        const { rows: [modifier] } = await client.query(
          'SELECT price_extra FROM modifiers WHERE id=$1 AND is_active=true',
          [mod.modifier_id]
        );
        if (modifier) modifierTotal += parseFloat(modifier.price_extra);
      }

      const unitPrice = parseFloat(menuItem.base_price);
      const subtotal = (unitPrice + modifierTotal) * quantity;

      const { rows: [orderItem] } = await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, modifier_total, subtotal, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [order.id, menu_item_id, quantity, unitPrice, modifierTotal, subtotal, itemNotes || null]
      );

      // Insert modifiers
      for (const mod of modifiers) {
        const { rows: [modifier] } = await client.query(
          'SELECT price_extra FROM modifiers WHERE id=$1',
          [mod.modifier_id]
        );
        if (modifier) {
          await client.query(
            'INSERT INTO order_item_modifiers (order_item_id, modifier_id, price_extra) VALUES ($1,$2,$3)',
            [orderItem.id, mod.modifier_id, modifier.price_extra]
          );
        }
      }
      orderItems.push(orderItem);
    }

    await client.query('COMMIT');

    // Emit to kitchen + update table status for all clients
    const tableInfo = await pool.query('SELECT table_number FROM tables WHERE id=$1', [table_id]);
    getIO()?.to('role:kitchen').emit('new-order', {
      orderId: order.id,
      tableId: table_id,
      tableNumber: tableInfo.rows[0]?.table_number,
      itemCount: orderItems.length,
    });
    getIO()?.emit('table-status-changed', {
      tableId: table_id,
      status: 'occupied',
      active_order_id: order.id,
    });

    res.status(201).json({ ...order, items: orderItems });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function getOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { rows: [order] } = await pool.query('SELECT * FROM orders WHERE id=$1', [id]);
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

    const { rows: items } = await pool.query(
      `SELECT oi.*, mi.name AS item_name
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = $1
       ORDER BY oi.sent_at`,
      [id]
    );

    res.json({ ...order, items });
  } catch (err) { next(err); }
}

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
      const { menu_item_id, quantity = 1, notes: itemNotes, modifiers = [] } = item;
      const { rows: [menuItem] } = await client.query(
        'SELECT base_price FROM menu_items WHERE id=$1 AND is_available=true', [menu_item_id]
      );
      if (!menuItem) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Item ${menu_item_id} non disponibile` });
      }
      let modifierTotal = 0;
      for (const mod of modifiers) {
        const { rows: [m] } = await client.query(
          'SELECT price_extra FROM modifiers WHERE id=$1 AND is_active=true', [mod.modifier_id]
        );
        if (m) modifierTotal += parseFloat(m.price_extra);
      }
      const unitPrice = parseFloat(menuItem.base_price);
      const subtotal = (unitPrice + modifierTotal) * quantity;
      const { rows: [orderItem] } = await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, modifier_total, subtotal, notes)
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
      addedItems.push(orderItem);
    }

    await client.query('COMMIT');

    getIO()?.to('role:kitchen').emit('order-item-added', {
      orderId: order_id,
      items: addedItems,
    });

    res.status(201).json(addedItems);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function cancelItem(req, res, next) {
  try {
    const { id: order_id, itemId } = req.params;
    const { rows: [item] } = await pool.query(
      `UPDATE order_items SET status='cancelled' WHERE id=$1 AND order_id=$2
       RETURNING *`,
      [itemId, order_id]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });
    res.json(item);
  } catch (err) { next(err); }
}

module.exports = { createOrder, getOrder, addItems, cancelItem };
