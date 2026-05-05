const bcrypt = require('bcrypt');
const pool = require('../config/db');

// Tenant isolation: every read/write is scoped to req.tenant.id, set by
// the resolveTenant middleware. Without this filter, an admin of tenant A
// could enumerate / modify / delete users of tenant B.
const TENANT = (req) => req.tenant.id;

async function listUsers(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, role, sub_role, is_active, created_at
         FROM users
         WHERE tenant_id = $1
         ORDER BY name`,
      [TENANT(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createUser(req, res, next) {
  try {
    const { name, pin, role, sub_role } = req.body;
    if (!name || !pin || !role) return res.status(400).json({ error: 'name, pin, role obbligatori' });
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN deve essere 4-6 cifre' });

    const pin_hash = await bcrypt.hash(pin, 10);
    const subRole = role === 'waiter' ? (sub_role || null) : null;
    const { rows } = await pool.query(
      `INSERT INTO users (tenant_id, name, pin_hash, role, sub_role)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, name, role, sub_role, is_active, created_at`,
      [TENANT(req), name, pin_hash, role, subRole]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { name, pin, role, is_active } = req.body;

    const fields = [];
    const values = [];
    let i = 1;

    const { sub_role } = req.body;
    if (name)       { fields.push(`name=$${i++}`);      values.push(name); }
    if (role)       { fields.push(`role=$${i++}`);      values.push(role); }
    if (sub_role !== undefined) { fields.push(`sub_role=$${i++}`); values.push(role === 'waiter' ? (sub_role || null) : null); }
    if (is_active !== undefined) { fields.push(`is_active=$${i++}`); values.push(is_active); }
    if (pin) {
      if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN deve essere 4-6 cifre' });
      const pin_hash = await bcrypt.hash(pin, 10);
      fields.push(`pin_hash=$${i++}`);
      values.push(pin_hash);
    }

    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    values.push(id);
    const idIdx = i++;
    values.push(TENANT(req));
    const tenantIdx = i;

    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(',')}
         WHERE id=$${idIdx} AND tenant_id=$${tenantIdx}
         RETURNING id, name, role, sub_role, is_active, created_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Utente non trovato' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE users SET is_active=false WHERE id=$1 AND tenant_id=$2',
      [id, TENANT(req)]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Utente non trovato' });
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
