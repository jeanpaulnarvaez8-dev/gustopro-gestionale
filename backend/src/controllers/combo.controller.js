const pool = require('../config/db');

// ── READ ─────────────────────────────────────────────────────

async function listCombos(req, res, next) {
  try {
    const { rows: combos } = await pool.query(
      `SELECT * FROM combo_menus ORDER BY sort_order, name`
    );
    // Attach courses + items for each combo
    for (const c of combos) {
      const { rows: courses } = await pool.query(
        `SELECT cc.*,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', cci.id,
                      'menu_item_id', cci.menu_item_id,
                      'item_name', mi.name,
                      'base_price', mi.base_price,
                      'price_supplement', cci.price_supplement
                    ) ORDER BY mi.name
                  ) FILTER (WHERE cci.id IS NOT NULL), '[]'
                ) AS items
         FROM combo_courses cc
         LEFT JOIN combo_course_items cci ON cci.course_id = cc.id
         LEFT JOIN menu_items mi ON mi.id = cci.menu_item_id
         WHERE cc.combo_id = $1
         GROUP BY cc.id
         ORDER BY cc.sort_order`,
        [c.id]
      );
      c.courses = courses;
    }
    res.json(combos);
  } catch (err) { next(err); }
}

// ── COMBO CRUD ────────────────────────────────────────────────

async function createCombo(req, res, next) {
  const client = await pool.connect();
  try {
    const { name, price, description, sort_order = 0, courses = [] } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
    if (price == null || price < 0) return res.status(400).json({ error: 'Prezzo non valido' });

    await client.query('BEGIN');

    const { rows: [combo] } = await client.query(
      `INSERT INTO combo_menus (name, price, description, sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name.trim(), price, description || null, sort_order]
    );

    for (const [i, course] of courses.entries()) {
      const { rows: [cc] } = await client.query(
        `INSERT INTO combo_courses (combo_id, name, min_choices, max_choices, sort_order)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [combo.id, course.name, course.min_choices ?? 1, course.max_choices ?? 1, i]
      );
      for (const item of (course.items ?? [])) {
        await client.query(
          `INSERT INTO combo_course_items (course_id, menu_item_id, price_supplement)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [cc.id, item.menu_item_id, item.price_supplement ?? 0]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(combo);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
}

async function updateCombo(req, res, next) {
  try {
    const { id } = req.params;
    const { name, price, description, is_active, sort_order } = req.body;
    const { rows: [c] } = await pool.query(
      `UPDATE combo_menus SET
         name        = COALESCE($1, name),
         price       = COALESCE($2, price),
         description = COALESCE($3, description),
         is_active   = COALESCE($4, is_active),
         sort_order  = COALESCE($5, sort_order)
       WHERE id=$6 RETURNING *`,
      [name || null, price ?? null, description ?? null, is_active ?? null, sort_order ?? null, id]
    );
    if (!c) return res.status(404).json({ error: 'Combo non trovata' });
    res.json(c);
  } catch (err) { next(err); }
}

async function deleteCombo(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query(`UPDATE combo_menus SET is_active=false WHERE id=$1`, [id]);
    res.status(204).end();
  } catch (err) { next(err); }
}

// ── COURSES ───────────────────────────────────────────────────

async function addCourse(req, res, next) {
  try {
    const { id: combo_id } = req.params;
    const { name, min_choices = 1, max_choices = 1 } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome portata obbligatorio' });
    const { rows: [cc] } = await pool.query(
      `INSERT INTO combo_courses (combo_id, name, min_choices, max_choices)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [combo_id, name.trim(), min_choices, max_choices]
    );
    res.status(201).json(cc);
  } catch (err) { next(err); }
}

async function removeCourse(req, res, next) {
  try {
    const { courseId } = req.params;
    await pool.query('DELETE FROM combo_courses WHERE id=$1', [courseId]);
    res.status(204).end();
  } catch (err) { next(err); }
}

async function addCourseItem(req, res, next) {
  try {
    const { courseId } = req.params;
    const { menu_item_id, price_supplement = 0 } = req.body;
    if (!menu_item_id) return res.status(400).json({ error: 'menu_item_id obbligatorio' });
    const { rows: [ci] } = await pool.query(
      `INSERT INTO combo_course_items (course_id, menu_item_id, price_supplement)
       VALUES ($1,$2,$3) ON CONFLICT (course_id, menu_item_id) DO UPDATE SET price_supplement=$3 RETURNING *`,
      [courseId, menu_item_id, price_supplement]
    );
    res.status(201).json(ci);
  } catch (err) { next(err); }
}

async function removeCourseItem(req, res, next) {
  try {
    const { itemId } = req.params;
    await pool.query('DELETE FROM combo_course_items WHERE id=$1', [itemId]);
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = {
  listCombos, createCombo, updateCombo, deleteCombo,
  addCourse, removeCourse, addCourseItem, removeCourseItem,
};
