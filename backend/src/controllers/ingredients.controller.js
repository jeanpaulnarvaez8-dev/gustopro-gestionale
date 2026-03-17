const pool = require('../config/db');

// ── LIST ─────────────────────────────────────────────────────
async function listIngredients(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT i.*,
              s.name AS supplier_name,
              CASE WHEN i.min_stock > 0 AND i.current_stock <= i.min_stock THEN true ELSE false END AS low_stock
       FROM ingredients i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       WHERE i.is_active = true
       ORDER BY i.name`
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function getLowStock(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, s.name AS supplier_name
       FROM ingredients i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       WHERE i.is_active = true AND i.min_stock > 0 AND i.current_stock <= i.min_stock
       ORDER BY (i.current_stock / NULLIF(i.min_stock, 0)) ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// ── CREATE ───────────────────────────────────────────────────
async function createIngredient(req, res, next) {
  try {
    const { name, unit = 'kg', current_stock = 0, min_stock = 0, cost_per_unit = 0, supplier_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name obbligatorio' });
    const { rows } = await pool.query(
      `INSERT INTO ingredients (name, unit, current_stock, min_stock, cost_per_unit, supplier_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, unit, current_stock, min_stock, cost_per_unit, supplier_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

// ── UPDATE ───────────────────────────────────────────────────
async function updateIngredient(req, res, next) {
  try {
    const { id } = req.params;
    const { name, unit, min_stock, cost_per_unit, supplier_id, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE ingredients SET
         name          = COALESCE($1, name),
         unit          = COALESCE($2, unit),
         min_stock     = COALESCE($3, min_stock),
         cost_per_unit = COALESCE($4, cost_per_unit),
         supplier_id   = COALESCE($5, supplier_id),
         is_active     = COALESCE($6, is_active)
       WHERE id=$7 RETURNING *`,
      [name || null, unit || null, min_stock ?? null, cost_per_unit ?? null,
       supplier_id || null, is_active ?? null, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Ingrediente non trovato' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// ── ADJUST STOCK ─────────────────────────────────────────────
async function adjustStock(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { quantity, type, notes } = req.body;
    if (!quantity || !type) return res.status(400).json({ error: 'quantity e type obbligatori' });
    if (!['in', 'out', 'adjustment'].includes(type)) {
      return res.status(400).json({ error: 'type deve essere: in, out, adjustment' });
    }

    await client.query('BEGIN');

    const delta = type === 'out' ? -Math.abs(quantity) : Math.abs(quantity);
    const { rows } = await client.query(
      `UPDATE ingredients
       SET current_stock = GREATEST(0, current_stock + $1), updated_at = NOW()
       WHERE id=$2 RETURNING *`,
      [delta, id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ingrediente non trovato' }); }

    await client.query(
      `INSERT INTO stock_movements (ingredient_id, type, quantity, reference_type, notes, created_by)
       VALUES ($1,$2,$3,'manual',$4,$5)`,
      [id, type, Math.abs(quantity), notes || null, req.user.id]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
}

// ── STOCK MOVEMENTS ───────────────────────────────────────────
async function getMovements(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT sm.*, u.name AS created_by_name
       FROM stock_movements sm
       LEFT JOIN users u ON u.id = sm.created_by
       WHERE sm.ingredient_id = $1
       ORDER BY sm.created_at DESC
       LIMIT 100`,
      [id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = {
  listIngredients, getLowStock,
  createIngredient, updateIngredient,
  adjustStock, getMovements,
};
