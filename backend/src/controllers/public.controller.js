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

// ---------------------------------------------------------------------------
// PRECONTO HTML stampabile (JP 2026-06-03).
// Restituisce una pagina HTML pronta per la stampa termica 80mm, con
// window.print() onload. Pensato per essere aperto dal tablet del cameriere
// sullo stesso WiFi della stampante: il browser dialog manda direttamente
// alla TM-m30II selezionata come default.
// NESSUNA AUTH: l'order_id e' un UUID non enumerabile + non muta DB.
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const money = (n) => Number(n || 0).toFixed(2).replace('.', ',') + ' €';

async function getPrecontoHtml(req, res, next) {
  try {
    const { order_id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(String(order_id || ''))) {
      return res.status(404).type('html').send('<h1>Ordine non trovato</h1>');
    }
    const { rows: [o] } = await pool.query(
      `SELECT o.id, o.status, o.covers, o.subtotal, o.total_amount, o.notes,
              o.order_type, o.customer_name, o.created_at,
              COALESCE(tb.table_number::text, 'Asporto') AS table_number,
              z.name AS zone_name,
              t.name AS restaurant_name, t.fiscal_data,
              COALESCE(t.coperto_price, 0)::numeric AS coperto_price
         FROM orders o
         JOIN tenants t ON t.id = o.tenant_id
         LEFT JOIN tables tb ON tb.id = o.table_id
         LEFT JOIN zones z ON z.id = tb.zone_id
        WHERE o.id = $1`,
      [order_id]
    );
    if (!o) return res.status(404).type('html').send('<h1>Ordine non trovato</h1>');

    const { rows: items } = await pool.query(
      `SELECT mi.name, oi.quantity, oi.unit_price, oi.modifier_total,
              oi.subtotal, oi.notes, oi.status, oi.workflow_status
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = $1 AND oi.status <> 'cancelled'
        ORDER BY mi.name`,
      [order_id]
    );

    const fd = o.fiscal_data || {};
    const restoLine1 = esc(o.restaurant_name || '');
    const restoLine2 = [fd.address, fd.city].filter(Boolean).map(esc).join(' · ');
    const restoLine3 = [fd.piva ? 'P.IVA ' + fd.piva : null, fd.phone].filter(Boolean).map(esc).join(' · ');
    const dt = new Date(o.created_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    const itemsSum = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);
    const copertoTot = Number(o.coperto_price || 0) * Number(o.covers || 0);
    const grandTotal = itemsSum + copertoTot;

    const itemRows = items.map(it => `
      <tr>
        <td class="qty">${Number(it.quantity)}</td>
        <td class="name">
          ${esc(it.name)}
          ${it.notes ? `<div class="notes">${esc(it.notes)}</div>` : ''}
        </td>
        <td class="price">${money(it.subtotal)}</td>
      </tr>`).join('');

    const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<title>Preconto ${esc(o.table_number)} — ${esc(o.restaurant_name)}</title>
<style>
  /* 80mm thermal: area stampabile ~72mm. Font monospace per allineamento. */
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.25; padding: 4mm 3mm; width: 80mm; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .big    { font-size: 14px; }
  .huge   { font-size: 18px; font-weight: 700; }
  .sep    { border-top: 1px dashed #000; margin: 4px 0; }
  table   { width: 100%; border-collapse: collapse; }
  td      { padding: 1px 0; vertical-align: top; font-size: 12px; }
  td.qty  { width: 8mm; text-align: left; font-weight: 700; }
  td.name { font-weight: 600; }
  td.price{ width: 18mm; text-align: right; font-variant-numeric: tabular-nums; }
  .notes  { font-size: 10px; font-style: italic; color: #444; padding-left: 2px; }
  .totals td { padding: 2px 0; }
  .totals td.lbl { font-weight: 600; }
  .totals td.val { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
  .grand td { border-top: 1px solid #000; padding-top: 4px; font-size: 16px; font-weight: 800; }
  .preconto-badge { display: inline-block; padding: 2px 8px; border: 2px solid #000; font-size: 14px; font-weight: 800; margin-bottom: 4px; }
  .footer { margin-top: 6px; font-size: 10px; text-align: center; color: #333; }
  /* Schermo (preview): aggiungi cornice grigia + bottone */
  @media screen {
    body { background: #f3f3f3; padding-top: 6mm; }
    .receipt { background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.15); padding: 4mm 3mm; }
    .print-btn {
      position: fixed; top: 8px; right: 8px;
      background: #000; color: #fff; border: 0; padding: 8px 14px;
      font-weight: 700; border-radius: 6px; cursor: pointer;
    }
  }
  @media print {
    .print-btn { display: none; }
  }
</style></head>
<body>
<button class="print-btn" onclick="window.print()">🖨 STAMPA</button>
<div class="receipt">
  <div class="center bold big">${restoLine1}</div>
  ${restoLine2 ? `<div class="center" style="font-size:10px">${restoLine2}</div>` : ''}
  ${restoLine3 ? `<div class="center" style="font-size:10px">${restoLine3}</div>` : ''}
  <div class="sep"></div>
  <div class="center"><span class="preconto-badge">PRECONTO — NON FISCALE</span></div>
  <div class="center bold huge">TAVOLO ${esc(o.table_number)}</div>
  ${o.zone_name ? `<div class="center" style="font-size:10px">${esc(o.zone_name)}</div>` : ''}
  <div class="center" style="font-size:10px">${dt} · Coperti: ${Number(o.covers || 0)}</div>
  <div class="sep"></div>
  ${items.length === 0 ? '<div class="center">Nessuna voce</div>' : `
    <table>
      <tbody>${itemRows}</tbody>
    </table>`}
  <div class="sep"></div>
  <table class="totals">
    <tr><td class="lbl">Subtotale piatti</td><td class="val">${money(itemsSum)}</td></tr>
    ${copertoTot > 0 ? `<tr><td class="lbl">Coperto (${Number(o.covers || 0)} × ${money(o.coperto_price)})</td><td class="val">${money(copertoTot)}</td></tr>` : ''}
    <tr class="grand"><td>TOTALE</td><td class="val">${money(grandTotal)}</td></tr>
  </table>
  <div class="footer">
    Grazie per la visita · arrivederci<br/>
    ${esc(String(o.id).slice(0, 8))}
  </div>
</div>
<script>
  // Auto-apri il dialog di stampa appena renderizzato. Il cameriere deve
  // solo confermare. Se l'utente preme Annulla puo' ri-cliccare il bottone.
  window.addEventListener('load', () => { setTimeout(() => window.print(), 250); });
</script>
</body></html>`;

    res.type('html').send(html);
  } catch (err) { next(err); }
}

module.exports = { getPublicMenu, callWaiter, getPublicReceipt, getPrecontoHtml };
