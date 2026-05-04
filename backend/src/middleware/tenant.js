// Tenant resolver — Step 1b of multi-tenant rollout.
//
// Order of preference:
//   1. JWT claim req.user.tenant_id  (set by login when token is issued)
//   2. X-Tenant-Slug request header  (for public endpoints, e.g. login)
//   3. Default tenant fallback       (transition window, while only Riva exists)
//
// On success, sets req.tenant = { id, slug, name, settings, is_active }
// and SKIPS DB hit on subsequent requests via in-memory cache.
//
// Cache invalidation: call clearTenantCache() after tenant CRUD.
// Cache size is bounded by tenant count (tens, not millions).

const pool = require('../config/db');

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const cacheById = new Map();
const cacheBySlug = new Map();

async function loadTenant({ id, slug }) {
  if (id && cacheById.has(id)) return cacheById.get(id);
  if (slug && cacheBySlug.has(slug)) return cacheBySlug.get(slug);

  const where = id ? 'id = $1' : 'slug = $1';
  const arg = id || slug;
  const { rows } = await pool.query(
    `SELECT id, slug, name, settings, is_active
       FROM tenants
      WHERE ${where} AND is_active = true`,
    [arg]
  );
  if (!rows[0]) return null;

  cacheById.set(rows[0].id, rows[0]);
  cacheBySlug.set(rows[0].slug, rows[0]);
  return rows[0];
}

function clearTenantCache() {
  cacheById.clear();
  cacheBySlug.clear();
}

async function resolveTenant(req, res, next) {
  try {
    let tenant = null;

    if (req.user && req.user.tenant_id) {
      tenant = await loadTenant({ id: req.user.tenant_id });
    }
    if (!tenant && req.headers['x-tenant-slug']) {
      tenant = await loadTenant({ slug: String(req.headers['x-tenant-slug']) });
    }
    if (!tenant) {
      tenant = await loadTenant({ id: DEFAULT_TENANT_ID });
    }
    if (!tenant) {
      return res.status(503).json({ error: 'Tenant non disponibile' });
    }

    req.tenant = tenant;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { resolveTenant, clearTenantCache, DEFAULT_TENANT_ID };
