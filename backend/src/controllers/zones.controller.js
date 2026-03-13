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

async function updateZone(req, res, next) {
  try {
    const { id } = req.params;
    const { name, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE zones SET
         name       = COALESCE($1, name),
         sort_order = COALESCE($2, sort_order)
       WHERE id=$3 RETURNING *`,
      [name || null, sort_order ?? null, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Zona non trovata' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteZone(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT COUNT(*) FROM tables WHERE zone_id=$1', [id]);
    if (parseInt(rows[0].count) > 0) {
      return res.status(400).json({ error: 'La zona ha tavoli attivi. Sposta i tavoli prima di eliminarla.' });
    }
    await pool.query('DELETE FROM zones WHERE id=$1', [id]);
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = { listZones, createZone, updateZone, deleteZone };
