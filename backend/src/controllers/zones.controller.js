const pool = require('../config/db');

async function listZones(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM zones ORDER BY sort_order, name');
    res.json(rows);
  } catch (err) { next(err); }
}

async function createZone(req, res, next) {
  try {
    const { name, sort_order = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'name obbligatorio' });
    const { rows } = await pool.query(
      'INSERT INTO zones (name, sort_order) VALUES ($1,$2) RETURNING *',
      [name, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { listZones, createZone };
