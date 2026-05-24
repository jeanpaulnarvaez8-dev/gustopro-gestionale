const pool = require('../config/db');
const { getIO } = require('../socket');

// Endpoint PUBBLICI (nessun login): menu cliente via QR + chiamata cameriere.
// Tenant risolto dallo slug nell'URL (es. 'riva-beach'), NON dal JWT.

async function resolveTenantBySlug(slug) {
  if (!slug) return null;
  const { rows: [t] } = await pool.query(
    'SELECT id, name, coperto_price FROM tenants WHERE slug = $1 AND is_active = true',
    [String(slug).toLowerCase().trim()]
  );
  return t || null;
}

// GET /public/menu/:slug — categorie attive + piatti disponibili, raggruppati.
async function getPublicMenu(req, res, next) {
  try {
    const tenant = await resolveTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ error: 'Ristorante non trovato' });

    const { rows: cats } = await pool.query(
      `SELECT id, name, sort_order, course_type, is_beverage
         FROM categories
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY sort_order, name`,
      [tenant.id]
    );
    const { rows: items } = await pool.query(
      `SELECT id, category_id, name, description, base_price, pricing_type, allergens
         FROM menu_items
        WHERE tenant_id = $1 AND is_available = true
        ORDER BY sort_order, name`,
      [tenant.id]
    );

    const byCat = {};
    for (const it of items) {
      (byCat[it.category_id] = byCat[it.category_id] || []).push({
        id: it.id,
        name: it.name,
        description: it.description,
        base_price: parseFloat(it.base_price),
        pricing_type: it.pricing_type,
        allergens: it.allergens || [],
      });
    }

    const menu = cats
      .map(c => ({
        id: c.id,
        name: c.name,
        course_type: c.course_type,
        is_beverage: c.is_beverage,
        items: byCat[c.id] || [],
      }))
      .filter(c => c.items.length > 0);

    res.json({
      restaurant: tenant.name,
      slug: req.params.slug,
      coperto: parseFloat(tenant.coperto_price || 0),
      menu,
    });
  } catch (err) { next(err); }
}

// Throttle in-memory: una chiamata per tavolo ogni 15s (anti-spam dal QR).
const lastCall = new Map();
const THROTTLE_MS = 15_000;

// POST /public/call-waiter/:slug { table_number } — il cliente chiama.
async function callWaiter(req, res, next) {
  try {
    const tenant = await resolveTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ error: 'Ristorante non trovato' });

    const tableNumber = String(req.body?.table_number || '').trim();
    if (!tableNumber) return res.status(400).json({ error: 'table_number obbligatorio' });

    const { rows: [table] } = await pool.query(
      `SELECT t.id, t.table_number, t.zone_id,
              o.id AS order_id, o.waiter_id
         FROM tables t
         LEFT JOIN orders o
           ON o.table_id = t.id AND o.status = 'open' AND o.tenant_id = t.tenant_id
        WHERE t.tenant_id = $1 AND t.table_number = $2
        LIMIT 1`,
      [tenant.id, tableNumber]
    );
    if (!table) return res.status(404).json({ error: 'Tavolo non trovato' });

    // Anti-spam per tavolo
    const key = `${tenant.id}:${table.table_number}`;
    const now = Date.now();
    if (lastCall.has(key) && now - lastCall.get(key) < THROTTLE_MS) {
      return res.json({ ok: true, throttled: true });
    }
    lastCall.set(key, now);

    const io = getIO();
    const payload = {
      tenantId: tenant.id,
      tableId: table.id,
      tableNumber: table.table_number,
      timestamp: new Date().toISOString(),
    };
    // Socket: admin/manager sempre + cameriere dell'ordine (se aperto)
    io?.to('role:admin').to('role:manager').emit('customer-call', payload);
    if (table.waiter_id) io?.to(`user:${table.waiter_id}`).emit('customer-call', payload);

    // Push native
    const pushService = require('../services/pushService');
    const pushBody = {
      title: `🔔 Tavolo ${table.table_number} ti chiama`,
      body: 'Il cliente ha chiamato dal menu QR',
      tag: `call-${table.id}`,
      url: '/tables',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
    };
    if (table.waiter_id) {
      pushService.sendToUser(table.waiter_id, pushBody).catch(() => {});
    }
    // Sempre anche a maitre/admin/manager (così qualcuno risponde se il
    // cameriere non c'e' o il tavolo non ha ancora un ordine aperto).
    pushService.sendToRole(tenant.id, ['admin', 'manager'], pushBody).catch(() => {});

    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { getPublicMenu, callWaiter };
