const pool = require('../config/db');
const { getIO } = require('../socket');

async function generatePreConto(req, res, next) {
  try {
    const { orderId } = req.params;
    const { rows: [order] } = await pool.query('SELECT * FROM orders WHERE id=$1', [orderId]);
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

    const { rows: items } = await pool.query(
      `SELECT
         oi.id, oi.quantity, oi.unit_price, oi.modifier_total, oi.subtotal, oi.notes, oi.status,
         COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
         COALESCE(
           json_agg(json_build_object('name', m.name, 'price_extra', oim.price_extra))
           FILTER (WHERE m.id IS NOT NULL), '[]'
         ) AS modifiers
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
       LEFT JOIN modifiers m ON m.id = oim.modifier_id
       WHERE oi.order_id = $1 AND oi.status != 'cancelled'
       GROUP BY oi.id, mi.name, oi.combo_menu_name
       ORDER BY oi.sent_at`,
      [orderId]
    );

    const tableInfo = await pool.query(
      'SELECT table_number, zone_id FROM tables WHERE id=$1', [order.table_id]
    );

    res.json({
      order_id: order.id,
      table_number: tableInfo.rows[0]?.table_number,
      subtotal: parseFloat(order.subtotal),
      tax_amount: parseFloat(order.tax_amount),
      total_amount: parseFloat(order.total_amount),
      payment_status: order.payment_status,
      items,
    });
  } catch (err) { next(err); }
}

async function processPayment(req, res, next) {
  const client = await pool.connect();
  try {
    const { order_id, amount, payment_method, is_split = false, split_index = 1, split_total = 1 } = req.body;
    const VALID_METHODS = ['cash', 'card', 'digital', 'room_charge'];
    if (!order_id || amount == null || !payment_method) {
      return res.status(400).json({ error: 'order_id, amount, payment_method obbligatori' });
    }
    if (parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'amount deve essere maggiore di 0' });
    }
    if (!VALID_METHODS.includes(payment_method)) {
      return res.status(400).json({ error: `Metodo non valido. Valori: ${VALID_METHODS.join(', ')}` });
    }

    await client.query('BEGIN');

    const { rows: [order] } = await client.query(
      "SELECT * FROM orders WHERE id=$1 AND status='open'", [order_id]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato o già chiuso' });

    // Insert payment
    const { rows: [payment] } = await client.query(
      `INSERT INTO payments (order_id, amount, payment_method, processed_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [order_id, amount, payment_method, req.user.id]
    );

    // Snapshot receipt data
    const { rows: items } = await client.query(
      `SELECT oi.quantity, oi.subtotal,
              COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id=$1 AND oi.status != 'cancelled'`,
      [order_id]
    );

    // Insert receipt
    const { rows: [receipt] } = await client.query(
      `INSERT INTO receipts (order_id, issued_by, total_amount, tax_amount, is_split, split_index, split_total, receipt_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [order_id, req.user.id, amount, order.tax_amount, is_split, split_index, split_total, JSON.stringify({ items })]
    );

    // Check if fully paid
    const { rows: [totals] } = await client.query(
      'SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id=$1',
      [order_id]
    );
    const totalPaid = parseFloat(totals.paid);
    const orderTotal = parseFloat(order.total_amount);
    const newPaymentStatus = totalPaid >= orderTotal ? 'paid' : 'partial';

    // If fully paid, close the order
    if (newPaymentStatus === 'paid') {
      await client.query(
        "UPDATE orders SET payment_status='paid', status='completed' WHERE id=$1",
        [order_id]
      );
    } else {
      await client.query(
        "UPDATE orders SET payment_status='partial' WHERE id=$1",
        [order_id]
      );
    }

    await client.query('COMMIT');

    if (newPaymentStatus === 'paid') {
      getIO()?.emit('order-settled', { orderId: order_id, tableId: order.table_id });
      // Notify TableMap: table is now dirty (trigger updated DB, push to clients)
      if (order.table_id) {
        getIO()?.emit('table-status-changed', {
          tableId: order.table_id,
          status: 'dirty',
          active_order_id: null,
        });
      }
    }

    res.status(201).json({ payment, receipt, payment_status: newPaymentStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function listReceipts(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, COALESCE(t.table_number, 'Asporto') AS table_number, u.name AS issued_by_name
       FROM receipts r
       JOIN orders o ON o.id = r.order_id
       LEFT JOIN tables t ON t.id = o.table_id
       LEFT JOIN users u ON u.id = r.issued_by
       ORDER BY r.created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { generatePreConto, processPayment, listReceipts };
