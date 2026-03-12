const pool = require('../config/db');

async function listCategories(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM categories WHERE is_active=true ORDER BY sort_order, name'
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function listItems(req, res, next) {
  try {
    const { categoryId } = req.query;
    let query = 'SELECT * FROM menu_items WHERE is_available=true';
    const params = [];
    if (categoryId) {
      query += ' AND category_id=$1';
      params.push(categoryId);
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
       ORDER BY mg.id, m.sort_order`,
      [id]
    );
    // Group by modifier group
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
      'INSERT INTO categories (name, sort_order, tax_rate) VALUES ($1,$2,$3) RETURNING *',
      [name, sort_order, tax_rate]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function createItem(req, res, next) {
  try {
    const { category_id, name, description, base_price, prep_time_mins, sort_order = 0 } = req.body;
    if (!category_id || !name || base_price == null) {
      return res.status(400).json({ error: 'category_id, name, base_price obbligatori' });
    }
    const { rows } = await pool.query(
      `INSERT INTO menu_items (category_id, name, description, base_price, prep_time_mins, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [category_id, name, description, base_price, prep_time_mins, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function updateItem(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, base_price, is_available, sort_order } = req.body;
    const fields = [], values = [];
    let i = 1;
    if (name)              { fields.push(`name=$${i++}`);         values.push(name); }
    if (description)       { fields.push(`description=$${i++}`);  values.push(description); }
    if (base_price != null){ fields.push(`base_price=$${i++}`);   values.push(base_price); }
    if (is_available != null){ fields.push(`is_available=$${i++}`); values.push(is_available); }
    if (sort_order != null){ fields.push(`sort_order=$${i++}`);   values.push(sort_order); }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo' });
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE menu_items SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Item non trovato' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { listCategories, listItems, getItemModifiers, createCategory, createItem, updateItem };
