const pool = require('../config/db');

// ── GET RECIPE FOR A MENU ITEM ────────────────────────────────
async function getRecipe(req, res, next) {
  try {
    const { itemId } = req.params;
    const { rows } = await pool.query(
      `SELECT r.id, r.quantity,
              i.id AS ingredient_id, i.name, i.unit, i.current_stock, i.cost_per_unit
       FROM recipes r
       JOIN ingredients i ON i.id = r.ingredient_id
       WHERE r.menu_item_id = $1
       ORDER BY i.name`,
      [itemId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// ── ADD / UPDATE INGREDIENT IN RECIPE ────────────────────────
async function upsertRecipeItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const { ingredient_id, quantity } = req.body;
    if (!ingredient_id || !quantity) {
      return res.status(400).json({ error: 'ingredient_id e quantity obbligatori' });
    }
    const { rows } = await pool.query(
      `INSERT INTO recipes (menu_item_id, ingredient_id, quantity)
       VALUES ($1,$2,$3)
       ON CONFLICT (menu_item_id, ingredient_id)
       DO UPDATE SET quantity = EXCLUDED.quantity
       RETURNING *`,
      [itemId, ingredient_id, quantity]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

// ── REMOVE INGREDIENT FROM RECIPE ────────────────────────────
async function removeRecipeItem(req, res, next) {
  try {
    const { recipeId } = req.params;
    await pool.query('DELETE FROM recipes WHERE id=$1', [recipeId]);
    res.status(204).end();
  } catch (err) { next(err); }
}

// ── COST OF RECIPE (costo materie prime per porzione) ─────────
async function getRecipeCost(req, res, next) {
  try {
    const { itemId } = req.params;
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(r.quantity * i.cost_per_unit), 0) AS cost_per_portion,
         json_agg(json_build_object(
           'name', i.name, 'unit', i.unit,
           'quantity', r.quantity,
           'cost', ROUND((r.quantity * i.cost_per_unit)::NUMERIC, 4)
         ) ORDER BY i.name) AS breakdown
       FROM recipes r
       JOIN ingredients i ON i.id = r.ingredient_id
       WHERE r.menu_item_id = $1`,
      [itemId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { getRecipe, upsertRecipeItem, removeRecipeItem, getRecipeCost };
