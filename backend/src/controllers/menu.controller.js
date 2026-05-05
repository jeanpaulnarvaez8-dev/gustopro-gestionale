const pool = require('../config/db');

// Tenant isolation: every menu query is scoped to req.tenant.id.
const TENANT = (req) => req.tenant.id;

async function listCategories(req, res, next) {
  try {
    const all = req.query.all === 'true';
    const { rows } = await pool.query(
      all
        ? 'SELECT * FROM categories WHERE tenant_id=$1 ORDER BY sort_order, name'
        : 'SELECT * FROM categories WHERE tenant_id=$1 AND is_active=true ORDER BY sort_order, name',
      [TENANT(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function listItems(req, res, next) {
  try {
    const { categoryId } = req.query;
    const all = req.query.all === 'true';
    let query = all
      ? 'SELECT * FROM menu_items WHERE tenant_id=$1'
      : 'SELECT * FROM menu_items WHERE tenant_id=$1 AND is_available=true';
    const params = [TENANT(req)];
    if (categoryId) {
      params.push(categoryId);
      query += ` AND category_id=$${params.length}`;
    }
    query += ' ORDER BY sort_order, name';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
}

async function getItemModifiers(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT
         mg.id          AS group_id,
         mg.name        AS group_name,
         mg.min_selection,
         mg.max_selection,
         mg.is_required,
         m.id           AS modifier_id,
         m.name         AS modifier_name,
         m.price_extra,
         m.sort_order
       FROM item_modifier_groups img
       JOIN modifier_groups mg ON mg.id = img.group_id
       JOIN modifiers m        ON m.group_id = mg.id AND m.is_active = true
       WHERE img.item_id = $1
         AND img.tenant_id = $2
         AND mg.tenant_id = $2
       ORDER BY mg.id, m.sort_order`,
      [id, TENANT(req)]
    );
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.group_id]) {
        grouped[row.group_id] = {
          id: row.group_id,
          name: row.group_name,
          min_selection: row.min_selection,
          max_selection: row.max_selection,
          is_required: row.is_required,
          modifiers: [],
        };
      }
      grouped[row.group_id].modifiers.push({
        id: row.modifier_id,
        name: row.modifier_name,
        price_extra: parseFloat(row.price_extra),
        sort_order: row.sort_order,
      });
    }
    res.json(Object.values(grouped));
  } catch (err) { next(err); }
}

async function createCategory(req, res, next) {
  try {
    const { name, sort_order = 0, tax_rate = 10.00 } = req.body;
    if (!name) return res.status(400).json({ error: 'name obbligatorio' });
    const { rows } = await pool.query(
      'INSERT INTO categories (tenant_id, name, sort_order, tax_rate) VALUES ($1,$2,$3,$4) RETURNING *',
      [TENANT(req), name, sort_order, tax_rate]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const { name, sort_order, tax_rate, is_active, course_type, is_beverage } = req.body;
    const { rows } = await pool.query(
      `UPDATE categories SET
         name        = COALESCE($1, name),
         sort_order  = COALESCE($2, sort_order),
         tax_rate    = COALESCE($3, tax_rate),
         is_active   = COALESCE($4, is_active),
         course_type = COALESCE($5, course_type),
         is_beverage = COALESCE($6, is_beverage)
       WHERE id=$7 AND tenant_id=$8 RETURNING *`,
      [name || null, sort_order ?? null, tax_rate ?? null, is_active ?? null, course_type ?? null, is_beverage ?? null, id, TENANT(req)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Categoria non trovata' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE categories SET is_active=false WHERE id=$1 AND tenant_id=$2',
      [id, TENANT(req)]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Categoria non trovata' });
    res.status(204).end();
  } catch (err) { next(err); }
}

async function createItem(req, res, next) {
  try {
    const { category_id, name, description, base_price, prep_time_mins, sort_order = 0, allergens = [], pricing_type = 'fixed' } = req.body;
    if (!category_id || !name || base_price == null) {
      return res.status(400).json({ error: 'category_id, name, base_price obbligatori' });
    }
    const { rows } = await pool.query(
      `INSERT INTO menu_items (tenant_id, category_id, name, description, base_price, prep_time_mins, sort_order, allergens, pricing_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [TENANT(req), category_id, name, description || null, base_price, prep_time_mins || null, sort_order, JSON.stringify(allergens), pricing_type]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function updateItem(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, base_price, is_available, sort_order, prep_time_mins, allergens, pricing_type } = req.body;
    const { rows } = await pool.query(
      `UPDATE menu_items SET
         name           = COALESCE($1, name),
         description    = COALESCE($2, description),
         base_price     = COALESCE($3, base_price),
         is_available   = COALESCE($4, is_available),
         sort_order     = COALESCE($5, sort_order),
         prep_time_mins = COALESCE($6, prep_time_mins),
         allergens      = COALESCE($7, allergens),
         pricing_type   = COALESCE($8, pricing_type)
       WHERE id=$9 AND tenant_id=$10 RETURNING *`,
      [name || null, description ?? null, base_price ?? null, is_available ?? null,
       sort_order ?? null, prep_time_mins ?? null,
       allergens !== undefined ? JSON.stringify(allergens) : null,
       pricing_type ?? null, id, TENANT(req)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Item non trovato' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteItem(req, res, next) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE menu_items SET is_available=false WHERE id=$1 AND tenant_id=$2',
      [id, TENANT(req)]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item non trovato' });
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = {
  listCategories, listItems, getItemModifiers,
  createCategory, updateCategory, deleteCategory,
  createItem, updateItem, deleteItem,
};
