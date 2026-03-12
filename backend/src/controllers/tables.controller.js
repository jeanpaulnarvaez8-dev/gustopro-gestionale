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
    const fields = [], values = [];
    let i = 1;
    if (table_number) { fields.push(`table_number=$${i++}`); values.push(table_number); }
    if (seats)        { fields.push(`seats=$${i++}`);        values.push(seats); }
    if (pos_x != null){ fields.push(`pos_x=$${i++}`);        values.push(pos_x); }
    if (pos_y != null){ fields.push(`pos_y=$${i++}`);        values.push(pos_y); }
    if (zone_id)      { fields.push(`zone_id=$${i++}`);      values.push(zone_id); }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo' });
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE tables SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tavolo non trovato' });
    res.json(rows[0]);
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

module.exports = { listTables, createTable, updateTable, setTableStatus };
