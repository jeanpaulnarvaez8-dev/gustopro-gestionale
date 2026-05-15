const pool = require('../config/db');
const { getIO } = require('../socket');

// Tenant isolation: pre-conti, pagamenti, ricevute scoped al tenant.
const TENANT = (req) => req.tenant.id;

async function generatePreConto(req, res, next) {
  try {
    const { orderId } = req.params;
    const tenantId = TENANT(req);
    const { rows: [order] } = await pool.query(
      'SELECT * FROM orders WHERE id=$1 AND tenant_id=$2',
      [orderId, tenantId]
    );
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
       WHERE oi.order_id = $1 AND oi.tenant_id = $2 AND oi.status != 'cancelled'
       GROUP BY oi.id, mi.name, oi.combo_menu_name
       ORDER BY oi.sent_at`,
      [orderId, tenantId]
    );

    const tableInfo = await pool.query(
      'SELECT table_number, zone_id FROM tables WHERE id=$1 AND tenant_id=$2',
      [order.table_id, tenantId]
    );

    // Tenant info (nome ristorante + dati fiscali) per la ricevuta
    const { rows: [tenant] } = await pool.query(
      'SELECT name, fiscal_data FROM tenants WHERE id=$1',
      [tenantId]
    );

    res.json({
      order_id: order.id,
      table_number: tableInfo.rows[0]?.table_number,
      subtotal: parseFloat(order.subtotal),
      tax_amount: parseFloat(order.tax_amount),
      total_amount: parseFloat(order.total_amount),
      payment_status: order.payment_status,
      order_type: order.order_type,           // takeaway / dine-in
      customer_name: order.customer_name,     // per asporto
      customer_phone: order.customer_phone,
      covers: order.covers,
      created_at: order.created_at,
      items,
      tenant: {
        name: tenant?.name,
        fiscal_data: tenant?.fiscal_data || {},
      },
    });
  } catch (err) { next(err); }
}

async function processPayment(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
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
      "SELECT * FROM orders WHERE id=$1 AND tenant_id=$2 AND status='open'",
      [order_id, tenantId]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato o già chiuso' });

    // Calcola resto da dare al cliente (solo su pagamento cash, ultima tranche)
    const { rows: [prevPaid] } = await client.query(
      'SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id=$1 AND tenant_id=$2',
      [order_id, tenantId]
    );
    const alreadyPaid = parseFloat(prevPaid.paid);
    const orderTotalRemaining = parseFloat(order.total_amount) - alreadyPaid;
    const overpayment = parseFloat(amount) - orderTotalRemaining;
    const changeGiven = (payment_method === 'cash' && overpayment > 0) ? overpayment : 0;
    // Se cash e overpayment, registriamo l'importo effettivo (= dovuto) e il resto separato
    const effectiveAmount = changeGiven > 0 ? orderTotalRemaining : parseFloat(amount);

    // Insert payment (amount = importo effettivo incassato, eventuale resto già dedotto)
    const { rows: [payment] } = await client.query(
      `INSERT INTO payments (tenant_id, order_id, amount, payment_method, processed_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [tenantId, order_id, effectiveAmount, payment_method, req.user.id]
    );
    payment.change_given = changeGiven;
    payment.received_amount = parseFloat(amount);

    // Snapshot receipt data
    const { rows: items } = await client.query(
      `SELECT oi.quantity, oi.subtotal,
              COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id=$1 AND oi.tenant_id=$2 AND oi.status != 'cancelled'`,
      [order_id, tenantId]
    );

    // Insert receipt
    const { rows: [receipt] } = await client.query(
      `INSERT INTO receipts (tenant_id, order_id, issued_by, total_amount, tax_amount, is_split, split_index, split_total, receipt_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tenantId, order_id, req.user.id, amount, order.tax_amount, is_split, split_index, split_total, JSON.stringify({ items })]
    );

    // Check if fully paid
    const { rows: [totals] } = await client.query(
      'SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id=$1 AND tenant_id=$2',
      [order_id, tenantId]
    );
    const totalPaid = parseFloat(totals.paid);
    const orderTotal = parseFloat(order.total_amount);
    const newPaymentStatus = totalPaid >= orderTotal ? 'paid' : 'partial';

    if (newPaymentStatus === 'paid') {
      await client.query(
        "UPDATE orders SET payment_status='paid', status='completed' WHERE id=$1 AND tenant_id=$2",
        [order_id, tenantId]
      );
    } else {
      await client.query(
        "UPDATE orders SET payment_status='partial' WHERE id=$1 AND tenant_id=$2",
        [order_id, tenantId]
      );
    }

    await client.query('COMMIT');

    if (newPaymentStatus === 'paid') {
      getIO()?.emit('order-settled', { orderId: order_id, tableId: order.table_id });
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
       WHERE r.tenant_id = $1
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [TENANT(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { generatePreConto, processPayment, listReceipts };
