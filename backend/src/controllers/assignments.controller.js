const pool = require('../config/db');
const { getIO } = require('../socket');

/**
 * GET /api/assignments?date=YYYY-MM-DD — Assegnazioni del giorno
 */
async function listAssignments(req, res, next) {
  try {
    const date = req.query.date || 'today';
    const dateFilter = date === 'today' ? 'CURRENT_DATE' : `$1::date`;
    const params = date === 'today' ? [] : [date];

    const { rows } = await pool.query(
      `SELECT za.id, za.user_id, za.zone_id, za.shift_date, za.created_at,
              u.name AS user_name, u.role AS user_role, u.sub_role,
              z.name AS zone_name
       FROM zone_assignments za
       JOIN users u ON u.id = za.user_id
       JOIN zones z ON z.id = za.zone_id
       WHERE za.shift_date = ${dateFilter}
       ORDER BY z.sort_order, u.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * GET /api/assignments/my — Zone assegnate all'utente corrente oggi
 */
async function myAssignments(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT za.id, za.zone_id, za.shift_date,
              z.name AS zone_name, z.sort_order
       FROM zone_assignments za
       JOIN zones z ON z.id = za.zone_id
       WHERE za.user_id = $1 AND za.shift_date = CURRENT_DATE
       ORDER BY z.sort_order`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/assignments — Crea assegnazione
 */
async function createAssignment(req, res, next) {
  try {
    const { user_id, zone_id, shift_date } = req.body;
    const date = shift_date || new Date().toISOString().split('T')[0];

    const { rows: [assignment] } = await pool.query(
      `INSERT INTO zone_assignments (user_id, zone_id, shift_date, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, zone_id, shift_date) DO NOTHING
       RETURNING *`,
      [user_id, zone_id, date, req.user.id]
    );

    if (!assignment) {
      return res.status(409).json({ error: 'Assegnazione già esistente' });
    }

    // Notifica il cameriere
    getIO()?.to(`user:${user_id}`).emit('assignments-updated');
    getIO()?.to('role:admin').to('role:manager').emit('assignments-updated');

    res.status(201).json(assignment);
  } catch (err) { next(err); }
}

/**
 * DELETE /api/assignments/:id — Rimuovi assegnazione
 */
async function deleteAssignment(req, res, next) {
  try {
    const { rows: [deleted] } = await pool.query(
      'DELETE FROM zone_assignments WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!deleted) return res.status(404).json({ error: 'Assegnazione non trovata' });

    getIO()?.to(`user:${deleted.user_id}`).emit('assignments-updated');
    getIO()?.to('role:admin').to('role:manager').emit('assignments-updated');

    res.json({ success: true });
  } catch (err) { next(err); }
}

/**
 * POST /api/assignments/copy-yesterday — Copia assegnazioni da ieri a oggi
 */
async function copyFromYesterday(req, res, next) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO zone_assignments (user_id, zone_id, shift_date, created_by)
       SELECT user_id, zone_id, CURRENT_DATE, $1
       FROM zone_assignments
       WHERE shift_date = CURRENT_DATE - INTERVAL '1 day'
       ON CONFLICT (user_id, zone_id, shift_date) DO NOTHING
       RETURNING *`,
      [req.user.id]
    );

    getIO()?.emit('assignments-updated');
    res.json({ copied: rows.length, assignments: rows });
  } catch (err) { next(err); }
}

module.exports = { listAssignments, myAssignments, createAssignment, deleteAssignment, copyFromYesterday };
