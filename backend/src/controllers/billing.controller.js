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

    // JP 2026-06-06: aggiunto weight_g per UI checkout (bottone "Modifica peso").
    const { rows: items } = await pool.query(
      `SELECT
         oi.id, oi.quantity, oi.unit_price, oi.modifier_total, oi.subtotal, oi.notes, oi.status,
         oi.weight_g,
         COALESCE(oi.is_surcharge, false) AS is_surcharge,
         oi.custom_name, oi.menu_item_id,
         COALESCE(mi.name, oi.combo_menu_name, oi.custom_name, 'Item') AS item_name,
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
       -- JP 2026-05-27: i coperti devono uscire per primi nel conto.
       ORDER BY (CASE WHEN oi.custom_name = 'Coperto' THEN 0 ELSE 1 END), oi.sent_at NULLS FIRST`,
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
    const { order_id, amount, payment_method, is_split = false, split_index = 1, split_total = 1, register } = req.body;
    const VALID_METHODS = ['cash', 'card', 'digital', 'room_charge'];
    // register: identificativo cassa fisica (cassa_1/cassa_2/...). Free-form
    // ma normalizzato lowercase per consistenza analytics. Nullable.
    const registerNorm = register ? String(register).toLowerCase().trim().slice(0, 32) : null;
    if (!order_id || amount == null || !payment_method) {
      return res.status(400).json({ error: 'order_id, amount, payment_method obbligatori' });
    }
    // JP 2026-06-07: waiter+sub_role='asporto' (Alessandra) puo' chiudere
    // SOLO asporti. Cassa/admin/manager qualsiasi ordine.
    if (req.user.role === 'waiter') {
      if (req.user.sub_role !== 'asporto') {
        return res.status(403).json({ error: 'Cassa riservata' });
      }
      const { rows: [ord] } = await pool.query(
        `SELECT order_type FROM orders WHERE id=$1 AND tenant_id=$2`,
        [order_id, tenantId]
      );
      if (!ord || ord.order_type !== 'takeaway') {
        return res.status(403).json({ error: 'Puoi fare cassa solo degli asporti' });
      }
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
      `INSERT INTO payments (tenant_id, order_id, amount, payment_method, processed_by, register)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId, order_id, effectiveAmount, payment_method, req.user.id, registerNorm]
    );
    payment.change_given = changeGiven;
    payment.received_amount = parseFloat(amount);

    // Snapshot receipt data — JP 2026-05-27: voci uguali accumulate (×N) e
    // coperti per primi. Raggruppo per nome+prezzo unitario, sommo qty/subtotal.
    const { rows: items } = await client.query(
      `SELECT
         SUM(oi.quantity)::int AS quantity,
         SUM(oi.subtotal) AS subtotal,
         COALESCE(mi.name, oi.combo_menu_name, oi.custom_name, 'Item') AS item_name,
         BOOL_OR(oi.custom_name = 'Coperto') AS is_coperto
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id=$1 AND oi.tenant_id=$2 AND oi.status != 'cancelled'
       GROUP BY COALESCE(mi.name, oi.combo_menu_name, oi.custom_name, 'Item'), oi.unit_price
       ORDER BY (CASE WHEN BOOL_OR(oi.custom_name = 'Coperto') THEN 0 ELSE 1 END), MIN(oi.sent_at) NULLS FIRST`,
      [order_id, tenantId]
    );

    // Insert receipt (con register per audit cassa incrociato con payment)
    const { rows: [receipt] } = await client.query(
      `INSERT INTO receipts (tenant_id, order_id, issued_by, total_amount, tax_amount, is_split, split_index, split_total, receipt_data, register)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [tenantId, order_id, req.user.id, amount, order.tax_amount, is_split, split_index, split_total, JSON.stringify({ items }), registerNorm]
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
      // Bug fix 2026-05-18: il pagamento NON aggiornava tables.status, emetteva
      // solo il socket event. Risultato: ricaricando il tablet il tavolo
      // tornava 'occupied' perche' il DB non era stato persistito. Adesso
      // l'UPDATE viene fatto nella stessa transazione del payment.
      if (order.table_id) {
        await client.query(
          "UPDATE tables SET status='dirty' WHERE id=$1 AND tenant_id=$2",
          [order.table_id, tenantId]
        );
      }
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
