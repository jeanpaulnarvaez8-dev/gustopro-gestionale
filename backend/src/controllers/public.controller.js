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

// Lingue supportate per il menu cliente. 'it' = originale (colonne name/description).
const SUPPORTED_LANGS = ['en', 'de', 'fr', 'es'];

// GET /public/menu/:slug?lang=xx — categorie attive + piatti, tradotti se ?lang.
async function getPublicMenu(req, res, next) {
  try {
    const tenant = await resolveTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ error: 'Ristorante non trovato' });

    const lang = SUPPORTED_LANGS.includes(String(req.query.lang || '').toLowerCase())
      ? String(req.query.lang).toLowerCase()
      : null;
    // Traduzione con fallback all'italiano (campo originale).
    const tr = (row, field) => {
      if (lang && row.translations && row.translations[lang] && row.translations[lang][field]) {
        return row.translations[lang][field];
      }
      return row[field];
    };

    const { rows: cats } = await pool.query(
      `SELECT id, name, sort_order, course_type, is_beverage, translations
         FROM categories
        WHERE tenant_id = $1 AND is_active = true
          AND COALESCE(show_on_qr, true) = true
        ORDER BY sort_order, name`,
      [tenant.id]
    );
    const { rows: items } = await pool.query(
      `SELECT id, category_id, name, description, base_price, pricing_type, allergens, translations
         FROM menu_items
        WHERE tenant_id = $1 AND is_available = true
        ORDER BY sort_order, name`,
      [tenant.id]
    );

    const byCat = {};
    for (const it of items) {
      (byCat[it.category_id] = byCat[it.category_id] || []).push({
        id: it.id,
        name: tr(it, 'name'),
        description: tr(it, 'description'),
        base_price: parseFloat(it.base_price),
        pricing_type: it.pricing_type,
        allergens: it.allergens || [],
      });
    }

    const menu = cats
      .map(c => ({
        id: c.id,
        name: tr(c, 'name'),
        course_type: c.course_type,
        is_beverage: c.is_beverage,
        items: byCat[c.id] || [],
      }))
      .filter(c => c.items.length > 0);

    res.json({
      restaurant: tenant.name,
      slug: req.params.slug,
      lang: lang || 'it',
      coperto: parseFloat(tenant.coperto_price || 0),
      menu,
    });
  } catch (err) { next(err); }
}

// Throttle in-memory: una chiamata cameriere per tavolo ogni 30 min (richiesta
// cliente: si puo' richiamare solo dopo 30 minuti dalla chiamata precedente).
const lastCall = new Map();
const THROTTLE_MS = 30 * 60 * 1000;

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
    // Chiamata cliente → arriva a TUTTO lo staff (tutte le stanze ruolo):
    // sala, bar, cassa, cucina, manager, admin. Chiunque sia libero risponde.
    const ALL_ROLES = ['admin', 'manager', 'waiter', 'cashier', 'kitchen'];
    let emit = io;
    if (emit) { for (const r of ALL_ROLES) emit = emit.to(`role:${r}`); emit.emit('customer-call', payload); }

    // Push native a tutto lo staff (chi ha attivato le notifiche).
    const pushService = require('../services/pushService');
    const pushBody = {
      title: `🔔 Tavolo ${table.table_number} ti chiama`,
      body: 'Il cliente ha chiamato dal menu QR',
      tag: `call-${table.id}`,
      url: '/tables',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
    };
    pushService.sendToRole(tenant.id, ALL_ROLES, pushBody).catch(() => {});

    res.json({ ok: true });
  } catch (err) { next(err); }
}

// GET /public/receipt/:id — scontrino pubblico per invio digitale (link
// condivisibile via WhatsApp/SMS/Mail). L'id e' un UUID non indovinabile.
// Ritorna SOLO dati di visualizzazione: voci, totali, nome ristorante,
// tavolo, data. Nessun dato sensibile (no carte, no PII cliente).
async function getPublicReceipt(req, res, next) {
  try {
    const { id } = req.params;
    // Guard: UUID valido (evita query inutili / errori 500 su id malformati).
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) {
      return res.status(404).json({ error: 'Scontrino non trovato' });
    }
    const { rows: [r] } = await pool.query(
      `SELECT r.id, r.total_amount, r.tax_amount, r.is_split, r.split_index,
              r.split_total, r.receipt_data, r.created_at,
              t.name AS restaurant_name, t.fiscal_data,
              COALESCE(tb.table_number::text, 'Asporto') AS table_number
         FROM receipts r
         JOIN tenants t ON t.id = r.tenant_id
         JOIN orders  o ON o.id = r.order_id
         LEFT JOIN tables tb ON tb.id = o.table_id
        WHERE r.id = $1`,
      [id]
    );
    if (!r) return res.status(404).json({ error: 'Scontrino non trovato' });
    res.json({
      id: r.id,
      created_at: r.created_at,
      total_amount: parseFloat(r.total_amount),
      tax_amount: parseFloat(r.tax_amount),
      is_split: r.is_split,
      split_index: r.split_index,
      split_total: r.split_total,
      restaurant_name: r.restaurant_name,
      fiscal_data: r.fiscal_data || {},
      table_number: r.table_number,
      items: (r.receipt_data && r.receipt_data.items) || [],
    });
  } catch (err) { next(err); }
}

module.exports = { getPublicMenu, callWaiter, getPublicReceipt };
