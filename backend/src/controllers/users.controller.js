const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function listUsers(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, role, is_active, created_at FROM users ORDER BY name'
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createUser(req, res, next) {
  try {
    const { name, pin, role } = req.body;
    if (!name || !pin || !role) return res.status(400).json({ error: 'name, pin, role obbligatori' });
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN deve essere 4-6 cifre' });

    const pin_hash = await bcrypt.hash(pin, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, pin_hash, role) VALUES ($1,$2,$3)
       RETURNING id, name, role, is_active, created_at`,
      [name, pin_hash, role]
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

    if (name)       { fields.push(`name=$${i++}`);      values.push(name); }
    if (role)       { fields.push(`role=$${i++}`);      values.push(role); }
    if (is_active !== undefined) { fields.push(`is_active=$${i++}`); values.push(is_active); }
    if (pin) {
      if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN deve essere 4-6 cifre' });
      const pin_hash = await bcrypt.hash(pin, 10);
      fields.push(`pin_hash=$${i++}`);
      values.push(pin_hash);
    }

    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(',')} WHERE id=$${i}
       RETURNING id, name, role, is_active, created_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Utente non trovato' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query('UPDATE users SET is_active=false WHERE id=$1', [id]);
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
