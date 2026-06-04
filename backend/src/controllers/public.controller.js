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

// ---------------------------------------------------------------------------
// PRECONTO ESC/POS raw (JP 2026-06-03).
// La stampante .24 e' un print-server TP808 raw socket 9100 (no AirPrint,
// no IPP, no ePOS-Print). L'unica via di stampa e' inviare i byte ESC/POS
// direttamente alla porta 9100. Questo endpoint ritorna il buffer pronto:
//
//   curl -s https://gestione.gustopro.it/api/public/preconto-escpos/:id \
//     | nc -w1 192.168.1.24 9100
//
// Larghezza assunta: 48 colonne (font A 12cpi su carta 80mm).
// Charset ASCII-safe: accenti italiani translitterati per evitare problemi
// con codepage del firmware TP808 (variabile).
// ---------------------------------------------------------------------------
const COLS = 48;
const asciiSafe = (s) => String(s ?? '')
  .replace(/[àÀ]/g, 'a').replace(/[èéÈÉ]/g, 'e').replace(/[ìÌ]/g, 'i')
  .replace(/[òÒ]/g, 'o').replace(/[ùÙ]/g, 'u')
  .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/€/g, 'EUR').replace(/[^\x20-\x7E\n]/g, '');
// Layout helpers — ritornano stringhe ASCII con padding a COLS.
const left = (s) => asciiSafe(s);
const center = (s) => {
  const t = asciiSafe(s);
  if (t.length >= COLS) return t.slice(0, COLS);
  const pad = Math.floor((COLS - t.length) / 2);
  return ' '.repeat(pad) + t;
};
const lineSep = (ch = '-') => ch.repeat(COLS);
// Riga "voce ............... prezzo": prezzo a destra in monospace.
const row2 = (label, value) => {
  const L = asciiSafe(label);
  const V = asciiSafe(value);
  const space = Math.max(1, COLS - L.length - V.length);
  if (L.length + V.length + 1 > COLS) {
    // wrap del label se troppo lungo: prima riga label troncato, seconda riga prezzo a destra
    const labMax = COLS - V.length - 1;
    return L.slice(0, labMax) + ' ' + V;
  }
  return L + ' '.repeat(space) + V;
};
// Bytes ESC/POS
const ESC = 0x1B, GS = 0x1D, LF = 0x0A;
const INIT       = Buffer.from([ESC, 0x40]);
const ALIGN_L    = Buffer.from([ESC, 0x61, 0]);
const ALIGN_C    = Buffer.from([ESC, 0x61, 1]);
const BOLD_ON    = Buffer.from([ESC, 0x45, 1]);
const BOLD_OFF   = Buffer.from([ESC, 0x45, 0]);
const DBL_ON     = Buffer.from([GS, 0x21, 0x11]); // double w + double h
const DBL_H_ON   = Buffer.from([GS, 0x21, 0x01]); // solo altezza doppia (non wrappa righe lunghe)
const DBL_OFF    = Buffer.from([GS, 0x21, 0x00]);
const CUT        = Buffer.from([GS, 0x56, 0x00]); // full cut
const FEED5      = Buffer.from([ESC, 0x64, 5]);
const FEED3      = Buffer.from([ESC, 0x64, 3]);
const txt = (s) => Buffer.from(asciiSafe(s) + '\n', 'ascii');

async function getPrecontoEscpos(req, res, next) {
  try {
    const { order_id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(String(order_id || ''))) {
      return res.status(404).type('text/plain').send('not found');
    }
    const { rows: [o] } = await pool.query(
      `SELECT o.id, o.covers, o.notes, o.order_type, o.created_at,
              COALESCE(tb.table_number::text, 'Asporto') AS table_number,
              z.name AS zone_name,
              t.name AS restaurant_name, t.fiscal_data,
              COALESCE(t.coperto_price, 0)::numeric AS coperto_price
         FROM orders o
         JOIN tenants t ON t.id = o.tenant_id
         LEFT JOIN tables tb ON tb.id = o.table_id
         LEFT JOIN zones z ON z.id = tb.zone_id
        WHERE o.id = $1`, [order_id]);
    if (!o) return res.status(404).type('text/plain').send('not found');
    const { rows: items } = await pool.query(
      `SELECT mi.name, oi.quantity, oi.subtotal, oi.notes
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = $1 AND oi.status <> 'cancelled'
        ORDER BY mi.name`, [order_id]);
    const fd = o.fiscal_data || {};
    const dt = new Date(o.created_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    const itemsSum = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);
    const copertoTot = Number(o.coperto_price || 0) * Number(o.covers || 0);
    const grandTotal = itemsSum + copertoTot;
    const money = (n) => Number(n || 0).toFixed(2).replace('.', ',');

    // JP 2026-06-04: 2 copie del preconto (una al cliente, una al banco).
    const buildOneCopy = (copyLabel) => {
      const c = [];
      c.push(INIT, ALIGN_C);
      c.push(BOLD_ON, txt(o.restaurant_name || ''), BOLD_OFF);
      if (fd.address || fd.city) c.push(txt([fd.address, fd.city].filter(Boolean).join(' ')));
      if (fd.piva) c.push(txt('P.IVA ' + fd.piva));
      if (fd.phone) c.push(txt(fd.phone));
      c.push(txt(lineSep('=')));
      c.push(BOLD_ON, txt('PRECONTO - NON FISCALE'), BOLD_OFF);
      if (copyLabel) c.push(txt(copyLabel));
      c.push(DBL_ON, txt('TAVOLO ' + o.table_number), DBL_OFF);
      if (o.zone_name) c.push(txt(o.zone_name));
      c.push(txt(dt + '  Coperti: ' + Number(o.covers || 0)));
      c.push(txt(lineSep('=')));
      c.push(ALIGN_L);
      if (items.length === 0) {
        c.push(txt('Nessuna voce'));
      } else {
        for (const it of items) {
          const lab = `${Number(it.quantity)}x ${it.name}`;
          c.push(txt(row2(lab, money(it.subtotal))));
          if (it.notes) c.push(txt('   ' + it.notes));
        }
      }
      c.push(txt(lineSep('-')));
      c.push(txt(row2('Subtotale piatti', money(itemsSum))));
      if (copertoTot > 0) {
        c.push(txt(row2(`Coperto (${Number(o.covers || 0)} x ${money(o.coperto_price)})`, money(copertoTot))));
      }
      c.push(txt(lineSep('=')));
      c.push(BOLD_ON, DBL_ON);
      c.push(txt(row2('TOT', money(grandTotal))));
      c.push(DBL_OFF, BOLD_OFF);
      c.push(txt(lineSep('=')));
      c.push(ALIGN_C, txt('Grazie e arrivederci'));
      c.push(txt(String(o.id).slice(0, 8)));
      c.push(FEED5, CUT);
      return c;
    };
    const chunks = [...buildOneCopy('— COPIA CLIENTE —'), ...buildOneCopy('— COPIA BANCO —')];

    const out = Buffer.concat(chunks);
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="preconto-${o.table_number}.bin"`);
    res.set('Content-Length', String(out.length));
    res.send(out);
  } catch (err) { next(err); }
}

// Variante per comodita': risolve l'ordine open corrente dal numero tavolo.
// Uso: curl /preconto-escpos/by-table/2 | nc 192.168.1.24 9100
async function getPrecontoEscposByTable(req, res, next) {
  try {
    const { tenant_slug, table_number } = req.params;
    const tenant = await resolveTenantBySlug(tenant_slug);
    if (!tenant) return res.status(404).type('text/plain').send('tenant not found');
    const { rows: [r] } = await pool.query(
      `SELECT o.id FROM orders o
         JOIN tables tb ON tb.id = o.table_id
        WHERE o.tenant_id = $1 AND o.status = 'open' AND tb.table_number = $2
        ORDER BY o.created_at DESC LIMIT 1`,
      [tenant.id, String(table_number)]);
    if (!r) return res.status(404).type('text/plain').send('no open order for table');
    req.params.order_id = r.id;
    return getPrecontoEscpos(req, res, next);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// AUTO-PRINT sala (.24) — JP 2026-06-03
// Mini-ticket ESC/POS per le bevande/dessert appena ordinati. Pensato per
// uscire automaticamente sulla stampante sala quando il cameriere manda
// l'ordine: il banco vede subito che ha acque/vino/calici/dessert/birra
// alla spina da portare al tavolo.
//
// URL: /api/public/auto-print-escpos/:order_id?items=id1,id2,...
// ---------------------------------------------------------------------------
async function getAutoPrintEscpos(req, res, next) {
  try {
    const { order_id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(String(order_id || ''))) {
      return res.status(404).type('text/plain').send('not found');
    }
    const itemsParam = String(req.query.items || '').trim();
    if (!itemsParam) return res.status(400).type('text/plain').send('items query required');
    const itemIds = itemsParam.split(',').filter(s => /^[0-9a-f-]{36}$/i.test(s));
    if (itemIds.length === 0) return res.status(400).type('text/plain').send('no valid item ids');

    const { rows: [o] } = await pool.query(
      `SELECT o.id, o.order_type,
              COALESCE(tb.table_number::text, 'Asporto') AS table_number,
              t.name AS restaurant_name
         FROM orders o
         JOIN tenants t ON t.id = o.tenant_id
         LEFT JOIN tables tb ON tb.id = o.table_id
        WHERE o.id = $1`, [order_id]);
    if (!o) return res.status(404).type('text/plain').send('not found');

    const { rows: items } = await pool.query(
      `SELECT mi.name, oi.quantity, oi.notes
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = $1 AND oi.id = ANY($2::uuid[])
          AND oi.status <> 'cancelled'`,
      [order_id, itemIds]);
    if (items.length === 0) return res.status(404).type('text/plain').send('items not found');

    const dt = new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    // JP 2026-06-04: ticket sala con scritte piu' grandi. I nomi piatto
    // in altezza doppia (DBL_H_ON) per non wrappare; il TAVOLO X in
    // altezza+larghezza doppia perche' e' la cosa piu' importante.
    const chunks = [];
    chunks.push(INIT, ALIGN_C);
    chunks.push(BOLD_ON, DBL_ON, txt('SALA'), DBL_OFF, BOLD_OFF);
    chunks.push(txt(lineSep('=')));
    chunks.push(BOLD_ON, DBL_ON, txt('TAVOLO ' + o.table_number), DBL_OFF, BOLD_OFF);
    chunks.push(txt(dt));
    chunks.push(txt(lineSep('=')));
    chunks.push(ALIGN_L);
    for (const it of items) {
      const lab = `${Number(it.quantity)}x ${it.name}`;
      // Bold + altezza doppia: leggibile da lontano, non wrappa righe lunghe
      chunks.push(BOLD_ON, DBL_H_ON, txt(lab), DBL_OFF, BOLD_OFF);
      if (it.notes) chunks.push(BOLD_ON, txt('   ' + it.notes), BOLD_OFF);
    }
    chunks.push(txt(lineSep('-')));
    chunks.push(ALIGN_C, BOLD_ON, txt('Da preparare/portare in sala'), BOLD_OFF);
    chunks.push(FEED3, CUT);

    const out = Buffer.concat(chunks);
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="auto-${o.table_number}.bin"`);
    res.set('Content-Length', String(out.length));
    res.send(out);
  } catch (err) { next(err); }
}

module.exports = {
  getPublicMenu, callWaiter, getPublicReceipt, getPrecontoHtml,
  getPrecontoEscpos, getPrecontoEscposByTable,
  getAutoPrintEscpos,
};
