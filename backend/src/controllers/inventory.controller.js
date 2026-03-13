const pool = require('../config/db');
const { getIO } = require('../socket');

// ── SUPPLIERS ────────────────────────────────────────────────
async function listSuppliers(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM suppliers WHERE is_active=true ORDER BY name'
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createSupplier(req, res, next) {
  try {
    const { name, contact, email, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name obbligatorio' });
    const { rows } = await pool.query(
      'INSERT INTO suppliers (name,contact,email,notes) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, contact || null, email || null, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

// ── PURCHASE ORDERS ──────────────────────────────────────────
async function listPOs(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT po.*, u.name AS created_by_name,
              COALESCE(json_agg(pi ORDER BY pi.item_name) FILTER (WHERE pi.id IS NOT NULL), '[]') AS items
       FROM purchase_orders po
       LEFT JOIN users u ON u.id = po.created_by
       LEFT JOIN po_items pi ON pi.po_id = po.id
       GROUP BY po.id, u.name
       ORDER BY po.created_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createPO(req, res, next) {
  const client = await pool.connect();
  try {
    const { supplier_id, supplier_name, expected_date, notes, items } = req.body;
    if (!supplier_name || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'supplier_name e items obbligatori' });
    }
    await client.query('BEGIN');
    const { rows: [po] } = await client.query(
      `INSERT INTO purchase_orders (supplier_id, supplier_name, created_by, expected_date, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [supplier_id || null, supplier_name, req.user.id, expected_date || null, notes || null]
    );
    for (const item of items) {
      await client.query(
        `INSERT INTO po_items (po_id, item_name, barcode, qty_ordered, unit, unit_cost, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [po.id, item.item_name, item.barcode || null, item.qty_ordered,
         item.unit || 'kg', item.unit_cost || 0, item.notes || null]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(po);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
}

async function getPO(req, res, next) {
  try {
    const { id } = req.params;
    const { rows: [po] } = await pool.query(
      'SELECT * FROM purchase_orders WHERE id=$1', [id]
    );
    if (!po) return res.status(404).json({ error: 'PO non trovato' });
    const { rows: items } = await pool.query(
      'SELECT * FROM po_items WHERE po_id=$1 ORDER BY item_name', [id]
    );
    res.json({ ...po, items });
  } catch (err) { next(err); }
}

// ── GOODS RECEIPTS ───────────────────────────────────────────
async function listReceipts(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT gr.*, u.name AS received_by_name, po.supplier_name,
              COUNT(ri.id) AS item_count,
              ROUND(AVG(ABS(
                CASE WHEN ri.qty_ordered > 0
                  THEN (ri.qty_received - ri.qty_ordered) / ri.qty_ordered * 100
                  ELSE 0 END
              ))::NUMERIC, 1) AS avg_discrepancy_pct
       FROM goods_receipts gr
       LEFT JOIN users u ON u.id = gr.received_by
       LEFT JOIN purchase_orders po ON po.id = gr.po_id
       LEFT JOIN receipt_items ri ON ri.receipt_id = gr.id
       GROUP BY gr.id, u.name, po.supplier_name
       ORDER BY gr.received_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function getReceipt(req, res, next) {
  try {
    const { id } = req.params;
    const { rows: [receipt] } = await pool.query(
      `SELECT gr.*, u.name AS received_by_name, po.supplier_name
       FROM goods_receipts gr
       LEFT JOIN users u ON u.id = gr.received_by
       LEFT JOIN purchase_orders po ON po.id = gr.po_id
       WHERE gr.id=$1`, [id]
    );
    if (!receipt) return res.status(404).json({ error: 'Ricevimento non trovato' });
    const { rows: items } = await pool.query(
      `SELECT ri.*, riwd.discrepancy_pct, riwd.loss_value,
              u.name AS confirmed_by_name
       FROM receipt_items ri
       JOIN receipt_items_with_discrepancy riwd ON riwd.id = ri.id
       LEFT JOIN users u ON u.id = ri.confirmed_by
       WHERE ri.receipt_id=$1
       ORDER BY ri.item_name`, [id]
    );
    res.json({ ...receipt, items });
  } catch (err) { next(err); }
}

async function createReceipt(req, res, next) {
  const client = await pool.connect();
  try {
    const { po_id, notes, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items obbligatori' });
    }
    await client.query('BEGIN');
    const { rows: [receipt] } = await client.query(
      'INSERT INTO goods_receipts (po_id, received_by, notes) VALUES ($1,$2,$3) RETURNING *',
      [po_id || null, req.user.id, notes || null]
    );

    const alerts = [];
    for (const item of items) {
      const { rows: [ri] } = await client.query(
        `INSERT INTO receipt_items
           (receipt_id, po_item_id, item_name, barcode, qty_ordered, qty_received, unit, unit_cost, batch_no, expiry_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [receipt.id, item.po_item_id || null, item.item_name, item.barcode || null,
         item.qty_ordered || 0, item.qty_received, item.unit || 'kg',
         item.unit_cost || 0, item.batch_no || null,
         item.expiry_date || null, item.notes || null]
      );

      // Check discrepancy
      if (item.qty_ordered > 0) {
        const pct = ((item.qty_received - item.qty_ordered) / item.qty_ordered) * 100;
        if (pct < -5) {
          alerts.push({
            item: item.item_name,
            pct: Math.round(pct),
            missing: item.qty_ordered - item.qty_received,
            unit: item.unit || 'kg',
          });
        }
      }
    }

    if (po_id) {
      await client.query(
        "UPDATE purchase_orders SET status='received' WHERE id=$1", [po_id]
      );
    }

    await client.query('COMMIT');

    // Real-time alert if discrepancies
    if (alerts.length > 0) {
      getIO()?.emit('inventory:discrepancy', {
        receiptId: receipt.id,
        receivedBy: req.user.name,
        alerts,
      });
    }

    res.status(201).json({ ...receipt, alerts });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
}

async function confirmReceiptItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const { rows: [item] } = await pool.query(
      `UPDATE receipt_items
       SET confirmed_by=$1, confirmed_at=NOW()
       WHERE id=$2 RETURNING *`,
      [req.user.id, itemId]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });
    getIO()?.emit('inventory:confirmed', { itemId, confirmedBy: req.user.name });
    res.json(item);
  } catch (err) { next(err); }
}

// ── SPOILAGE ─────────────────────────────────────────────────
async function listSpoilage(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT sl.*, u.name AS logged_by_name, cu.name AS confirmed_by_name,
              (sl.qty * sl.unit_cost) AS total_value
       FROM spoilage_log sl
       LEFT JOIN users u ON u.id = sl.logged_by
       LEFT JOIN users cu ON cu.id = sl.confirmed_by
       ORDER BY sl.logged_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createSpoilage(req, res, next) {
  try {
    const { item_name, qty, unit, unit_cost, reason } = req.body;
    if (!item_name || !qty) return res.status(400).json({ error: 'item_name e qty obbligatori' });
    const { rows } = await pool.query(
      `INSERT INTO spoilage_log (item_name, qty, unit, unit_cost, reason, logged_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [item_name, qty, unit || 'kg', unit_cost || 0, reason || null, req.user.id]
    );
    const totalValue = rows[0].qty * rows[0].unit_cost;
    if (totalValue > 200) {
      getIO()?.to('role:admin').to('role:manager').emit('inventory:spoilage-alert', {
        item: item_name, value: totalValue, loggedBy: req.user.name,
      });
    }
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

// ── INVENTORY KPIs ───────────────────────────────────────────
async function getInventoryKPIs(req, res, next) {
  try {
    // % discrepancy this week
    const { rows: [discRow] } = await pool.query(`
      SELECT
        COALESCE(AVG(ABS(
          CASE WHEN ri.qty_ordered > 0
            THEN (ri.qty_received - ri.qty_ordered) / ri.qty_ordered * 100
            ELSE 0 END
        )), 0) AS avg_discrepancy_pct,
        COALESCE(SUM(
          CASE WHEN ri.qty_ordered > ri.qty_received
            THEN (ri.qty_ordered - ri.qty_received) * ri.unit_cost
            ELSE 0 END
        ), 0) AS loss_week
      FROM receipt_items ri
      JOIN goods_receipts gr ON gr.id = ri.receipt_id
      WHERE gr.received_at >= NOW() - INTERVAL '7 days'
    `);

    // Spoilage today + this week
    const { rows: [spoilRow] } = await pool.query(`
      SELECT
        COALESCE(SUM(qty * unit_cost) FILTER (WHERE logged_at >= CURRENT_DATE), 0) AS spoilage_today,
        COALESCE(SUM(qty * unit_cost) FILTER (WHERE logged_at >= NOW() - INTERVAL '7 days'), 0) AS spoilage_week
      FROM spoilage_log
    `);

    // Top 5 loss items this month
    const { rows: topLoss } = await pool.query(`
      SELECT item_name,
             ROUND(SUM((qty_ordered - qty_received) * unit_cost)::NUMERIC, 2) AS total_loss,
             COUNT(*) AS occurrences
      FROM receipt_items ri
      JOIN goods_receipts gr ON gr.id = ri.receipt_id
      WHERE gr.received_at >= NOW() - INTERVAL '30 days'
        AND qty_ordered > qty_received
      GROUP BY item_name
      ORDER BY total_loss DESC
      LIMIT 5
    `);

    // Recent discrepancies (>5%)
    const { rows: recentAlerts } = await pool.query(`
      SELECT ri.item_name, ri.qty_ordered, ri.qty_received, ri.unit,
             ri.unit_cost, ri.batch_no, ri.expiry_date,
             ROUND(((ri.qty_received - ri.qty_ordered) / ri.qty_ordered * 100)::NUMERIC, 1) AS discrepancy_pct,
             gr.received_at, u.name AS received_by_name, po.supplier_name
      FROM receipt_items ri
      JOIN goods_receipts gr ON gr.id = ri.receipt_id
      LEFT JOIN purchase_orders po ON po.id = gr.po_id
      LEFT JOIN users u ON u.id = gr.received_by
      WHERE ri.qty_ordered > 0
        AND ABS((ri.qty_received - ri.qty_ordered) / ri.qty_ordered) > 0.05
        AND gr.received_at >= NOW() - INTERVAL '30 days'
      ORDER BY gr.received_at DESC
      LIMIT 20
    `);

    res.json({
      avg_discrepancy_pct: parseFloat(discRow.avg_discrepancy_pct),
      loss_week:           parseFloat(discRow.loss_week),
      spoilage_today:      parseFloat(spoilRow.spoilage_today),
      spoilage_week:       parseFloat(spoilRow.spoilage_week),
      top_loss_items:      topLoss,
      recent_alerts:       recentAlerts,
    });
  } catch (err) { next(err); }
}

// ── BARCODE LOOKUP ───────────────────────────────────────────
async function lookupBarcode(req, res, next) {
  try {
    const { barcode } = req.params;

    // 1. Check internal DB (past PO items — most accurate pricing/units)
    const { rows } = await pool.query(
      `SELECT pi.item_name, pi.unit, pi.unit_cost, pi.barcode,
              po.supplier_name
       FROM po_items pi
       JOIN purchase_orders po ON po.id = pi.po_id
       WHERE pi.barcode = $1
       ORDER BY po.created_at DESC LIMIT 1`,
      [barcode]
    );

    if (rows.length > 0) {
      return res.json({ source: 'internal', ...rows[0] });
    }

    // 2. Fallback: Open Food Facts (free, covers Italian GS1 barcodes)
    const offRes = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (offRes.ok) {
      const data = await offRes.json();
      if (data.status === 1 && data.product) {
        const p = data.product;
        const name = p.product_name_it || p.product_name || p.abbreviated_product_name || '';
        if (name) {
          return res.json({
            source:    'openfoodfacts',
            barcode,
            item_name: name,
            brand:     p.brands || null,
            category:  p.food_groups_tags?.[0]?.replace('en:', '') || null,
            unit:      'pz',
            unit_cost: 0,
          });
        }
      }
    }

    // 3. Not found anywhere
    res.json(null);
  } catch (err) { next(err); }
}

module.exports = {
  listSuppliers, createSupplier,
  listPOs, createPO, getPO,
  listReceipts, getReceipt, createReceipt, confirmReceiptItem,
  listSpoilage, createSpoilage,
  getInventoryKPIs, lookupBarcode,
};
