const pool = require('../config/db');
const { getIO } = require('../socket');
const { TABLE_STATUSES } = require('../config/constants');

async function listTables(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tables_with_active_order ORDER BY table_number`
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createTable(req, res, next) {
  try {
    const { zone_id, table_number, seats = 2, pos_x = 10, pos_y = 10 } = req.body;
    if (!zone_id || !table_number) {
      return res.status(400).json({ error: 'zone_id e table_number obbligatori' });
    }
    const { rows } = await pool.query(
      `INSERT INTO tables (zone_id, table_number, seats, pos_x, pos_y)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [zone_id, table_number, seats, pos_x, pos_y]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function updateTable(req, res, next) {
  try {
    const { id } = req.params;
    const { table_number, seats, pos_x, pos_y, zone_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE tables SET
         table_number = COALESCE($1, table_number),
         seats        = COALESCE($2, seats),
         pos_x        = COALESCE($3, pos_x),
         pos_y        = COALESCE($4, pos_y),
         zone_id      = COALESCE($5, zone_id)
       WHERE id=$6 RETURNING *`,
      [table_number || null, seats ?? null, pos_x ?? null, pos_y ?? null, zone_id || null, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tavolo non trovato' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteTable(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT status FROM tables WHERE id=$1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tavolo non trovato' });
    if (rows[0].status === 'occupied') {
      return res.status(400).json({ error: 'Impossibile eliminare un tavolo occupato.' });
    }
    await pool.query('DELETE FROM tables WHERE id=$1', [id]);
    res.status(204).end();
  } catch (err) { next(err); }
}

async function setTableStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!TABLE_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status non valido. Valori: ${TABLE_STATUSES.join(', ')}` });
    }
    const { rows } = await pool.query(
      'UPDATE tables SET status=$1 WHERE id=$2 RETURNING *',
      [status, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tavolo non trovato' });

    getIO()?.emit('table-status-changed', { tableId: id, status });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { listTables, createTable, updateTable, deleteTable, setTableStatus };
