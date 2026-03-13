const pool = require('../config/db');

async function listCustomers(req, res, next) {
  try {
    const { q } = req.query;
    let query = `SELECT * FROM customers`;
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      query += ` WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1`;
    }
    query += ` ORDER BY name LIMIT 100`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
}

async function getCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const { rows: [customer] } = await pool.query(
      'SELECT * FROM customers WHERE id=$1', [id]
    );
    if (!customer) return res.status(404).json({ error: 'Cliente non trovato' });

    // Last 20 receipts for this customer (if linked)
    const { rows: history } = await pool.query(
      `SELECT r.*, t.table_number
       FROM receipts r
       LEFT JOIN orders o ON o.id = r.order_id
       LEFT JOIN tables t ON t.id = o.table_id
       WHERE r.customer_id = $1
       ORDER BY r.created_at DESC LIMIT 20`,
      [id]
    );

    res.json({ ...customer, history });
  } catch (err) { next(err); }
}

async function createCustomer(req, res, next) {
  try {
    const { name, phone, email, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
    const { rows: [c] } = await pool.query(
      `INSERT INTO customers (name, phone, email, notes)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name.trim(), phone || null, email || null, notes || null]
    );
    res.status(201).json(c);
  } catch (err) { next(err); }
}

async function updateCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const { name, phone, email, notes } = req.body;
    const { rows: [c] } = await pool.query(
      `UPDATE customers SET
         name       = COALESCE($1, name),
         phone      = COALESCE($2, phone),
         email      = COALESCE($3, email),
         notes      = COALESCE($4, notes),
         updated_at = NOW()
       WHERE id=$5 RETURNING *`,
      [name || null, phone || null, email || null, notes || null, id]
    );
    if (!c) return res.status(404).json({ error: 'Cliente non trovato' });
    res.json(c);
  } catch (err) { next(err); }
}

async function deleteCustomer(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM customers WHERE id=$1', [id]);
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer };
