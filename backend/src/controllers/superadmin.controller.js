const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { clearTenantCache } = require('../middleware/tenant');

const SLUG_RX = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const PIN_RX = /^\d{4,6}$/;

async function listTenants(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, fiscal_data, settings, is_active, created_at
         FROM tenants
         ORDER BY created_at`
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// POST /superadmin/tenants
// Body: { slug, name, fiscal_data?, settings?, admin: { name, pin } }
// Creates a new tenant and seeds an initial admin user inside it.
// Returns the tenant + the created admin (without pin_hash).
async function createTenant(req, res, next) {
  const client = await pool.connect();
  try {
    const { slug, name, fiscal_data, settings, admin } = req.body;

    if (!slug || !SLUG_RX.test(slug)) {
      return res.status(400).json({ error: 'slug invalido (a-z, 0-9, trattino, 1-50 char)' });
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'name obbligatorio (min 2 char)' });
    }
    if (!admin || !admin.name || !admin.pin) {
      return res.status(400).json({ error: 'admin.name e admin.pin obbligatori' });
    }
    if (!PIN_RX.test(admin.pin)) {
      return res.status(400).json({ error: 'admin.pin invalido (4-6 cifre)' });
    }

    await client.query('BEGIN');

    const { rows: [tenant] } = await client.query(
      `INSERT INTO tenants (slug, name, fiscal_data, settings)
         VALUES ($1, $2, $3, $4)
         RETURNING id, slug, name, fiscal_data, settings, is_active, created_at`,
      [
        slug,
        name.trim(),
        fiscal_data || {},
        settings || {},
      ]
    );

    const pinHash = await bcrypt.hash(admin.pin, 12);
    const { rows: [adminUser] } = await client.query(
      `INSERT INTO users (tenant_id, name, pin_hash, role, is_active)
         VALUES ($1, $2, $3, 'admin', true)
         RETURNING id, name, role, is_active, created_at`,
      [tenant.id, admin.name.trim(), pinHash]
    );

    await client.query('COMMIT');
    clearTenantCache();

    res.status(201).json({ tenant, admin: adminUser });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'slug già esistente o PIN admin duplicato in questo tenant' });
    }
    next(err);
  } finally {
    client.release();
  }
}

// PATCH /superadmin/tenants/:id
// Body: { name?, fiscal_data?, settings?, is_active? }
async function updateTenant(req, res, next) {
  try {
    const { id } = req.params;
    const { name, fiscal_data, settings, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE tenants SET
         name        = COALESCE($1, name),
         fiscal_data = COALESCE($2, fiscal_data),
         settings    = COALESCE($3, settings),
         is_active   = COALESCE($4, is_active)
       WHERE id = $5
       RETURNING id, slug, name, fiscal_data, settings, is_active, created_at, updated_at`,
      [name ?? null, fiscal_data ?? null, settings ?? null, is_active ?? null, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tenant non trovato' });
    clearTenantCache();
    res.json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { listTenants, createTenant, updateTenant };
