const pool = require('../config/db');
const { getIO } = require('../socket');

// Tenant isolation: zone assignments scoped al tenant.
const TENANT = (req) => req.tenant.id;

async function listAssignments(req, res, next) {
  try {
    const date = req.query.date || 'today';
    const tenantId = TENANT(req);
    const params = date === 'today' ? [tenantId] : [date, tenantId];
    const dateFilter = date === 'today' ? 'CURRENT_DATE' : '$1::date';
    const tenantParamIdx = date === 'today' ? '$1' : '$2';

    const { rows } = await pool.query(
      `SELECT za.id, za.user_id, za.zone_id, za.shift_date, za.created_at,
              u.name AS user_name, u.role AS user_role, u.sub_role,
              z.name AS zone_name
       FROM zone_assignments za
       JOIN users u ON u.id = za.user_id
       JOIN zones z ON z.id = za.zone_id
       WHERE za.shift_date = ${dateFilter}
         AND za.tenant_id = ${tenantParamIdx}
       ORDER BY z.sort_order, u.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function myAssignments(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT za.id, za.zone_id, za.shift_date,
              z.name AS zone_name, z.sort_order
       FROM zone_assignments za
       JOIN zones z ON z.id = za.zone_id
       WHERE za.user_id = $1 AND za.shift_date = CURRENT_DATE
         AND za.tenant_id = $2
       ORDER BY z.sort_order`,
      [req.user.id, TENANT(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createAssignment(req, res, next) {
  try {
    const { user_id, zone_id, shift_date } = req.body;
    const date = shift_date || new Date().toISOString().split('T')[0];
    const tenantId = TENANT(req);

    const { rows: [assignment] } = await pool.query(
      `INSERT INTO zone_assignments (tenant_id, user_id, zone_id, shift_date, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, zone_id, shift_date) DO NOTHING
       RETURNING *`,
      [tenantId, user_id, zone_id, date, req.user.id]
    );

    if (!assignment) {
      return res.status(409).json({ error: 'Assegnazione già esistente' });
    }

    getIO()?.to(`user:${user_id}`).emit('assignments-updated');
    getIO()?.to('role:admin').to('role:manager').emit('assignments-updated');

    res.status(201).json(assignment);
  } catch (err) { next(err); }
}

async function deleteAssignment(req, res, next) {
  try {
    const { rows: [deleted] } = await pool.query(
      'DELETE FROM zone_assignments WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, TENANT(req)]
    );
    if (!deleted) return res.status(404).json({ error: 'Assegnazione non trovata' });

    getIO()?.to(`user:${deleted.user_id}`).emit('assignments-updated');
    getIO()?.to('role:admin').to('role:manager').emit('assignments-updated');

    res.json({ success: true });
  } catch (err) { next(err); }
}

async function copyFromYesterday(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const { rows } = await pool.query(
      `INSERT INTO zone_assignments (tenant_id, user_id, zone_id, shift_date, created_by)
       SELECT tenant_id, user_id, zone_id, CURRENT_DATE, $1
       FROM zone_assignments
       WHERE shift_date = CURRENT_DATE - INTERVAL '1 day'
         AND tenant_id = $2
       ON CONFLICT (user_id, zone_id, shift_date) DO NOTHING
       RETURNING *`,
      [req.user.id, tenantId]
    );

    getIO()?.emit('assignments-updated');
    res.json({ copied: rows.length, assignments: rows });
  } catch (err) { next(err); }
}

module.exports = { listAssignments, myAssignments, createAssignment, deleteAssignment, copyFromYesterday };
