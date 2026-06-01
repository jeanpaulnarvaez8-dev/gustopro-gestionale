const pool = require('../config/db');
const { getIO } = require('../socket');
const { auditLog } = require('./workflow.controller');

// Tenant isolation: every order/item operation is scoped to req.tenant.id.
// Helper functions take tenantId as an explicit parameter because they
// receive a transaction client (not req).
const TENANT = (req) => req.tenant.id;

// ── Helpers ──────────────────────────────────────────────────

async function insertRegularItem(client, order_id, item, userId, tenantId) {
  const { menu_item_id, quantity = 1, notes: itemNotes, modifiers = [], weight_g, workflow_status = 'production' } = item;

  // menu_item must belong to the same tenant
  const { rows: [menuItem] } = await client.query(
    'SELECT base_price, pricing_type, name FROM menu_items WHERE id=$1 AND is_available=true AND tenant_id=$2',
    [menu_item_id, tenantId]
  );
  if (!menuItem) throw { status: 400, message: `Item ${menu_item_id} non disponibile` };

  let modifierTotal = 0;
  for (const mod of modifiers) {
    const { rows: [m] } = await client.query(
      'SELECT price_extra FROM modifiers WHERE id=$1 AND is_active=true AND tenant_id=$2',
      [mod.modifier_id, tenantId]
    );
    if (m) modifierTotal += parseFloat(m.price_extra);
  }

  let unitPrice = parseFloat(menuItem.base_price);
  let subtotal;

  if (menuItem.pricing_type === 'per_kg' && weight_g) {
    unitPrice = (parseFloat(menuItem.base_price) * weight_g) / 1000;
    subtotal = (unitPrice + modifierTotal) * quantity;
  } else {
    subtotal = (unitPrice + modifierTotal) * quantity;
  }

  const wfStatus = ['waiting', 'production', 'delivered'].includes(workflow_status) ? workflow_status : 'production';
  const itemStatus = wfStatus === 'delivered' ? 'served' : 'pending';
  const servedAt = wfStatus === 'delivered' ? new Date() : null;

  const { rows: [orderItem] } = await client.query(
    `INSERT INTO order_items
       (tenant_id, order_id, menu_item_id, quantity, unit_price, modifier_total, subtotal, notes, weight_g,
        workflow_status, status, inserted_by, served_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [tenantId, order_id, menu_item_id, quantity, unitPrice, modifierTotal, subtotal, itemNotes || null, weight_g || null,
     wfStatus, itemStatus, userId, servedAt]
  );

  for (const mod of modifiers) {
    const { rows: [m] } = await client.query(
      'SELECT price_extra FROM modifiers WHERE id=$1 AND tenant_id=$2',
      [mod.modifier_id, tenantId]
    );
    if (m) {
      await client.query(
        'INSERT INTO order_item_modifiers (tenant_id, order_item_id, modifier_id, price_extra) VALUES ($1,$2,$3,$4)',
        [tenantId, orderItem.id, mod.modifier_id, m.price_extra]
      );
    }
  }
  return orderItem;
}

async function insertComboItem(client, order_id, item, userId, tenantId) {
  const { combo_menu_id, quantity = 1, selections = [], notes: itemNotes, workflow_status = 'production' } = item;

  const { rows: [combo] } = await client.query(
    'SELECT id, name, price FROM combo_menus WHERE id=$1 AND is_active=true AND tenant_id=$2',
    [combo_menu_id, tenantId]
  );
  if (!combo) throw { status: 400, message: `Combo ${combo_menu_id} non disponibile` };

  const unitPrice = parseFloat(combo.price);
  const subtotal  = unitPrice * quantity;

  const wfStatus = ['waiting', 'production', 'delivered'].includes(workflow_status) ? workflow_status : 'production';
  const itemStatus = wfStatus === 'delivered' ? 'served' : 'pending';
  const servedAt = wfStatus === 'delivered' ? new Date() : null;

  const { rows: [orderItem] } = await client.query(
    `INSERT INTO order_items
       (tenant_id, order_id, menu_item_id, combo_menu_id, combo_menu_name, combo_selections,
        quantity, unit_price, modifier_total, subtotal, notes,
        workflow_status, status, inserted_by, served_at)
     VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [tenantId, order_id, combo.id, combo.name, JSON.stringify(selections),
     quantity, unitPrice, subtotal, itemNotes || null,
     wfStatus, itemStatus, userId, servedAt]
  );
  return orderItem;
}

// Riga "surcharge": coperto automatico o voce a prezzo libero della cassa.
// NON e' un piatto di cucina: entra nel totale (trigger somma subtotal) ma
// viene inserita gia' come 'served'/'delivered' cosi' non finisce sul KDS.
async function insertSurchargeItem(client, order_id, { label, unit_price, quantity = 1 }, userId, tenantId) {
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const price = Math.round((parseFloat(unit_price) || 0) * 100) / 100;
  // JP 2026-05-31: prezzo NEGATIVO ammesso per gli sconti (label "Sconto …").
  // Il privilegio sta sul route (solo cashier/manager/admin possono usare
  // type='custom' nel POST /orders/:id/items, vedi addItems).
  if (!Number.isFinite(price)) throw { status: 400, message: 'Prezzo voce non valido' };
  const subtotal = Math.round(price * qty * 100) / 100;
  const name = String(label || 'Extra').trim().slice(0, 120) || 'Extra';
  const { rows: [oi] } = await client.query(
    `INSERT INTO order_items
       (tenant_id, order_id, menu_item_id, quantity, unit_price, modifier_total, subtotal,
        custom_name, is_surcharge, workflow_status, status, inserted_by, served_at)
     VALUES ($1,$2,NULL,$3,$4,0,$5,$6,true,'delivered','served',$7,NOW()) RETURNING *`,
    [tenantId, order_id, qty, price, subtotal, name, userId]
  );
  return oi;
}

// Pizze → Simone: push native al pizzaiolo (kitchen, sub_role 'pizzeria').
// Le pizze "arrivano solo a Simone": oltre alla stazione dedicata, riceve
// una notifica anche se non sta guardando lo schermo.
async function pushToPizzaioli(tenantId, tableNumber, qty, orderId) {
  const { rows: pizzaioli } = await pool.query(
    `SELECT id FROM users
      WHERE tenant_id = $1 AND is_active = true
        AND role = 'kitchen' AND sub_role = 'pizzeria'`,
    [tenantId]
  );
  // JP 2026-06-01: emetti subito un socket dedicato cosi' la KDS pizzeria
  // (Simone) lo intercetta in tempo reale e suona il beep ANCHE su pizze
  // aggiunte a un ordine gia' aperto (prima il beep partiva solo su new-order).
  getIO()?.emit('pizza-added', { orderId, qty, tableNumber });
  if (pizzaioli.length === 0) return;
  const pushService = require('../services/pushService');
  await Promise.all(pizzaioli.map(p => pushService.sendToUser(p.id, {
    title: `🍕 Tavolo ${tableNumber} — ${qty} pizz${qty === 1 ? 'a' : 'e'}`,
    body: 'Nuova comanda pizzeria',
    tag: `pizza-${orderId}`,
    url: '/kds/pizzeria',
    vibrate: [200, 100, 200],
    requireInteraction: true,
  }).catch(() => {})));
}

// ── createOrder ───────────────────────────────────────────────

async function createOrder(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const {
      table_id, items, notes, covers = 1,
      order_type = 'table',
      customer_name, customer_phone, pickup_time,
    } = req.body;

    if (order_type === 'table' && !table_id) {
      return res.status(400).json({ error: 'table_id obbligatorio per ordini al tavolo' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items obbligatori' });
    }

    // Numero coperti (persone): minimo 1. Usato sia sull'ordine sia per il
    // coperto automatico piu' sotto.
    const coversN = Math.max(1, parseInt(covers, 10) || 1);

    await client.query('BEGIN');

    // Race-condition guard, tenant-scoped
    if (order_type === 'table' && table_id) {
      await client.query(
        'SELECT id FROM tables WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [table_id, tenantId]
      );
      const { rows: existing } = await client.query(
        `SELECT id FROM orders WHERE table_id = $1 AND tenant_id = $2 AND status = 'open' LIMIT 1`,
        [table_id, tenantId]
      );
      if (existing.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Tavolo ha già un ordine aperto',
          existing_order_id: existing[0].id,
        });
      }
    }

    // Sprint 7: per asporto, assegna numero progressivo giornaliero
    // (T101, T102, ...). Reset automatico ogni giorno via PRIMARY KEY
    // (tenant_id, business_date) sulla tabella counter.
    let takeawayNumber = null;
    if (order_type === 'takeaway') {
      const today = new Date().toISOString().slice(0, 10);
      const { rows: [counter] } = await client.query(
        `INSERT INTO takeaway_counters (tenant_id, business_date, last_number)
         VALUES ($1, $2::date, 101)
         ON CONFLICT (tenant_id, business_date) DO UPDATE SET
           last_number = takeaway_counters.last_number + 1
         RETURNING last_number`,
        [tenantId, today]
      );
      takeawayNumber = counter.last_number;
    }

    const { rows: [order] } = await client.query(
      `INSERT INTO orders
         (tenant_id, table_id, waiter_id, notes, order_type, customer_name, customer_phone, pickup_time, covers, takeaway_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [tenantId, table_id || null, req.user.id, notes || null,
       order_type, customer_name || null, customer_phone || null, pickup_time || null,
       coversN, takeawayNumber]
    );

    const orderItems = [];
    for (const item of items) {
      try {
        const oi = item.type === 'combo'
          ? await insertComboItem(client, order.id, item, req.user.id, tenantId)
          : await insertRegularItem(client, order.id, item, req.user.id, tenantId);
        orderItems.push(oi);

        const action = oi.workflow_status === 'delivered' ? 'direct_delivered' : 'item_insert';
        await auditLog(client, {
          tenant_id: tenantId,
          order_id: order.id,
          item_id: oi.id,
          action,
          to_value: oi.workflow_status,
          user_id: req.user.id,
          user_name: req.user.name,
          metadata: { item_name: item.type === 'combo' ? oi.combo_menu_name : undefined, quantity: oi.quantity },
        });
      } catch (e) {
        await client.query('ROLLBACK');
        return res.status(e.status || 400).json({ error: e.message || 'Errore item' });
      }
    }

    // Coperto automatico: N coperti * prezzo tenant. Solo ordini al tavolo
    // (l'asporto non ha coperto). Inserito come riga surcharge (no cucina) DENTRO
    // la transazione, cosi' il trigger ricalcola il totale includendolo.
    if (order_type === 'table') {
      const { rows: [tcfg] } = await client.query(
        'SELECT coperto_price FROM tenants WHERE id = $1',
        [tenantId]
      );
      const copertoPrice = parseFloat(tcfg?.coperto_price || 0);
      if (copertoPrice > 0) {
        const copertoItem = await insertSurchargeItem(
          client, order.id,
          { label: 'Coperto', unit_price: copertoPrice, quantity: coversN },
          req.user.id, tenantId
        );
        await auditLog(client, {
          tenant_id: tenantId,
          order_id: order.id,
          item_id: copertoItem.id,
          action: 'item_insert',
          to_value: 'delivered',
          user_id: req.user.id,
          user_name: req.user.name,
          metadata: { surcharge: true, kind: 'coperto', covers: coversN, unit_price: copertoPrice },
        });
      }
    }

    await client.query('COMMIT');

    // Re-fetch order so trigger-recalculated totals are included
    const { rows: [updatedOrder] } = await pool.query(
      'SELECT * FROM orders WHERE id=$1 AND tenant_id=$2',
      [order.id, tenantId]
    );

    // Alert admin per voci consegnato diretto
    const directDelivered = orderItems.filter(oi => oi.workflow_status === 'delivered');
    if (directDelivered.length > 0) {
      const tableInfo2 = table_id
        ? await pool.query('SELECT table_number FROM tables WHERE id=$1 AND tenant_id=$2', [table_id, tenantId])
        : null;
      const tNum = tableInfo2?.rows[0]?.table_number || 'ASPORTO';

      for (const dd of directDelivered) {
        const itemNameQ = await pool.query(
          "SELECT COALESCE(mi.name, $2) AS name FROM menu_items mi WHERE mi.id = $1 AND mi.tenant_id = $3",
          [dd.menu_item_id, dd.combo_menu_name || 'Item', tenantId]
        );
        const iName = itemNameQ.rows[0]?.name || 'Item';

        await pool.query(
          `INSERT INTO service_alerts (tenant_id, order_item_id, alert_type, is_mandatory, table_number, waiter_name, item_name)
           VALUES ($1, $2, 'direct_delivered', true, $3, $4, $5)
           ON CONFLICT (order_item_id, alert_type) DO NOTHING`,
          [tenantId, dd.id, tNum, req.user.name, iName]
        );

        getIO()?.to('role:admin').to('role:manager').emit('direct-delivered-alert', {
          orderId: order.id,
          itemId: dd.id,
          itemName: iName,
          quantity: dd.quantity,
          tableNumber: tNum,
          waiterName: req.user.name,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (table_id) {
      const tableInfo = await pool.query(
        'SELECT table_number, status, seated_at FROM tables WHERE id=$1 AND tenant_id=$2',
        [table_id, tenantId]
      );
      // Avanza il tavolo da 'seated' (o 'free') a 'occupied' + traccia
      // first_order_at per analytics turnover. seated_at viene preservato
      // se gia' impostato (cliente ha aspettato N minuti prima di ordinare).
      await pool.query(
        `UPDATE tables
            SET status = 'occupied',
                first_order_at = COALESCE(first_order_at, NOW()),
                seated_at = COALESCE(seated_at, NOW())
          WHERE id = $1 AND tenant_id = $2`,
        [table_id, tenantId]
      );
      getIO()?.emit('new-order', {
        orderId: order.id, tableId: table_id,
        tableNumber: tableInfo.rows[0]?.table_number,
        itemCount: orderItems.length,
        orderType: order_type,
      });
      getIO()?.emit('table-status-changed', {
        tableId: table_id, status: 'occupied', active_order_id: order.id,
      });
    } else {
      getIO()?.emit('new-order', {
        orderId: order.id, tableId: null,
        tableNumber: `ASPORTO - ${customer_name || ''}`,
        itemCount: orderItems.length,
        orderType: order_type,
        pickupTime: pickup_time,
      });
    }

    // Notifica bar: se l'ordine contiene bevande (is_beverage=true), push
    // native ai bartender (waiter con sub_role bar/bar-caffetteria) anche
    // se sono su un'altra pagina. Cosi' Desire' si accorge che ha cocktail
    // da preparare anche quando non e' su /bar.
    try {
      const { rows: barItems } = await pool.query(
        `SELECT COUNT(*)::int AS n,
                COALESCE(t.table_number, 'ASPORTO') AS table_number
           FROM order_items oi
           JOIN menu_items mi ON mi.id = oi.menu_item_id
           JOIN categories c  ON c.id = mi.category_id
           LEFT JOIN orders o ON o.id = oi.order_id
           LEFT JOIN tables t ON t.id = o.table_id
          WHERE oi.order_id = $1 AND oi.tenant_id = $2
            AND c.is_beverage = true
          GROUP BY t.table_number`,
        [order.id, tenantId]
      );
      if (barItems.length > 0 && barItems[0].n > 0) {
        const tn = barItems[0].table_number;
        const n = barItems[0].n;
        getIO()?.emit('new-bar-order', {
          orderId: order.id, tableNumber: tn, itemCount: n,
        });
        // Push native: trova bartender attivi del tenant
        const { rows: bartenders } = await pool.query(
          `SELECT id FROM users
            WHERE tenant_id = $1 AND is_active = true
              AND role = 'waiter' AND sub_role IN ('bar','bar/caffetteria')`,
          [tenantId]
        );
        const pushService = require('../services/pushService');
        await Promise.all(bartenders.map(b => pushService.sendToUser(b.id, {
          title: `🍷 Tavolo ${tn} — ${n} drink`,
          body: 'Nuovo ordine bar da preparare',
          tag: `bar-${order.id}`,
          url: '/bar',
          vibrate: [200, 100, 200],
          requireInteraction: true,
        }).catch(() => {})));
      }
    } catch (e) {
      req.log?.warn({ err: e?.message }, 'bar push failed');
    }

    // Pizzeria → Simone: se l'ordine contiene pizze (prep_station=pizzeria),
    // notifica il pizzaiolo. Le pizze arrivano SOLO a lui.
    try {
      const { rows: pz } = await pool.query(
        `SELECT COALESCE(SUM(oi.quantity), 0)::int AS qty,
                COALESCE(t.table_number, 'ASPORTO') AS table_number
           FROM order_items oi
           JOIN menu_items mi ON mi.id = oi.menu_item_id
           LEFT JOIN categories c ON c.id = mi.category_id
           LEFT JOIN orders o ON o.id = oi.order_id
           LEFT JOIN tables t ON t.id = o.table_id
          WHERE oi.order_id = $1 AND oi.tenant_id = $2
            AND COALESCE(oi.is_surcharge, false) = false
            AND COALESCE(mi.prep_station, c.prep_station, 'cucina') = 'pizzeria'
          GROUP BY t.table_number`,
        [order.id, tenantId]
      );
      if (pz.length > 0 && pz[0].qty > 0) {
        await pushToPizzaioli(tenantId, pz[0].table_number, pz[0].qty, order.id);
      }
    } catch (e) {
      req.log?.warn({ err: e?.message }, 'pizzeria push failed');
    }

    // Pre-allerta crudi: se l'ordine contiene almeno un item di prep_station
    // 'crudi' (ostriche, tartare, antipasti di mare), notifica la cucina crudi
    // IMMEDIATAMENTE — la sicurezza alimentare richiede prep tempestiva e
    // i crudi devono essere serviti freschi.
    try {
      const { rows: crudiItems } = await pool.query(
        `SELECT oi.id, oi.quantity, mi.name AS item_name,
                COALESCE(t.table_number, 'ASPORTO') AS table_number
           FROM order_items oi
           LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
           LEFT JOIN categories c  ON c.id = mi.category_id
           LEFT JOIN orders o      ON o.id = oi.order_id
           LEFT JOIN tables t      ON t.id = o.table_id
          WHERE oi.order_id = $1 AND oi.tenant_id = $2
            -- Pre-allerta sicurezza alimentare: flag requires_preallerta
            -- (decoupled dalla stazione: i crudi ora si mostrano con gli
            -- antipasti ma mantengono l'allerta tempestiva).
            AND mi.requires_preallerta = true`,
        [order.id, tenantId]
      );
      if (crudiItems.length > 0) {
        const totalQty = crudiItems.reduce((s, i) => s + Number(i.quantity || 1), 0);
        const summary = crudiItems.map(i => `${i.quantity}× ${i.item_name}`).join(', ');
        const tableNumber = crudiItems[0]?.table_number;
        getIO()?.emit('crudi-preallerta', {
          orderId: order.id,
          tableNumber,
          totalQty,
          items: crudiItems.map(i => ({ id: i.id, name: i.item_name, qty: i.quantity })),
          summary,
        });
        // Push native a tutto staff cucina del tenant (ne arrivera' una sola
        // per device, ma e' OK — la cucina crudi e' chiunque sia sull KDS crudi).
        const pushService = require('../services/pushService');
        pushService.sendToRole(tenantId, ['kitchen','admin','manager'], {
          title: `🦪 PRE-ALLERTA CRUDI — Tavolo ${tableNumber}`,
          body: summary,
          tag: `crudi-${order.id}`,
          url: '/kds/crudi',
          vibrate: [400, 100, 400, 100, 400],
          requireInteraction: true,
        }).catch(() => {});
      }
    } catch (e) {
      // Non bloccare il flusso ordine se la preallerta fallisce
      req.log?.warn({ err: e?.message, orderId: order.id }, 'crudi preallerta failed');
    }

    res.status(201).json({ ...updatedOrder, items: orderItems });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ── getOrder ─────────────────────────────────────────────────

async function getOrder(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = TENANT(req);
    const { rows: [order] } = await pool.query(
      'SELECT * FROM orders WHERE id=$1 AND tenant_id=$2',
      [id, tenantId]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

    const { rows: items } = await pool.query(
      `SELECT oi.*,
              COALESCE(mi.name, oi.combo_menu_name, oi.custom_name, 'Item') AS item_name
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = $1 AND oi.tenant_id = $2
       ORDER BY oi.sent_at`,
      [id, tenantId]
    );

    res.json({ ...order, items });
  } catch (err) { next(err); }
}

// ── addItems ─────────────────────────────────────────────────

async function addItems(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const { id: order_id } = req.params;
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items obbligatori' });
    }

    await client.query('BEGIN');

    const { rows: [order] } = await client.query(
      "SELECT * FROM orders WHERE id=$1 AND tenant_id=$2 AND status='open'",
      [order_id, tenantId]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato o già chiuso' });

    const addedItems = [];      // piatti veri (cucina/bar) → feed KDS/bar/direct-delivered
    const surchargeItems = [];  // voci libere cassa → solo conto, no cucina
    for (const item of items) {
      try {
        // Voce a prezzo libero (cassa): qualcosa fuori menu da mettere sul conto.
        // Solo cassa/manager/admin possono fissare un prezzo arbitrario.
        if (item.type === 'custom') {
          if (!['cashier', 'manager', 'admin'].includes(req.user.role)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Solo la cassa può aggiungere voci a prezzo libero' });
          }
          const si = await insertSurchargeItem(
            client, order_id,
            { label: item.custom_name, unit_price: item.unit_price, quantity: item.quantity },
            req.user.id, tenantId
          );
          surchargeItems.push(si);
          await auditLog(client, {
            tenant_id: tenantId,
            order_id,
            item_id: si.id,
            action: 'item_insert',
            to_value: 'delivered',
            user_id: req.user.id,
            user_name: req.user.name,
            metadata: { surcharge: true, kind: 'custom', item_name: si.custom_name, unit_price: si.unit_price, quantity: si.quantity },
          });
          continue;
        }

        const oi = item.type === 'combo'
          ? await insertComboItem(client, order_id, item, req.user.id, tenantId)
          : await insertRegularItem(client, order_id, item, req.user.id, tenantId);
        addedItems.push(oi);

        const action = oi.workflow_status === 'delivered' ? 'direct_delivered' : 'item_insert';
        await auditLog(client, {
          tenant_id: tenantId,
          order_id,
          item_id: oi.id,
          action,
          to_value: oi.workflow_status,
          user_id: req.user.id,
          user_name: req.user.name,
          metadata: { quantity: oi.quantity },
        });
      } catch (e) {
        await client.query('ROLLBACK');
        return res.status(e.status || 400).json({ error: e.message || 'Errore item' });
      }
    }

    await client.query('COMMIT');

    const directDelivered = addedItems.filter(oi => oi.workflow_status === 'delivered');
    if (directDelivered.length > 0) {
      const tableInfo = order.table_id
        ? await pool.query('SELECT table_number FROM tables WHERE id=$1 AND tenant_id=$2', [order.table_id, tenantId])
        : null;
      const tNum = tableInfo?.rows[0]?.table_number || 'ASPORTO';

      for (const dd of directDelivered) {
        const itemNameQ = await pool.query(
          "SELECT COALESCE(mi.name, $2) AS name FROM menu_items mi WHERE mi.id = $1 AND mi.tenant_id = $3",
          [dd.menu_item_id, dd.combo_menu_name || 'Item', tenantId]
        );
        const iName = itemNameQ.rows[0]?.name || 'Item';

        await pool.query(
          `INSERT INTO service_alerts (tenant_id, order_item_id, alert_type, is_mandatory, table_number, waiter_name, item_name)
           VALUES ($1, $2, 'direct_delivered', true, $3, $4, $5)
           ON CONFLICT (order_item_id, alert_type) DO NOTHING`,
          [tenantId, dd.id, tNum, req.user.name, iName]
        );

        getIO()?.to('role:admin').to('role:manager').emit('direct-delivered-alert', {
          orderId: order_id,
          itemId: dd.id,
          itemName: iName,
          quantity: dd.quantity,
          tableNumber: tNum,
          waiterName: req.user.name,
          timestamp: new Date().toISOString(),
        });
      }
    }

    getIO()?.emit('order-item-added', { orderId: order_id, items: addedItems });

    // Push bar se almeno uno degli items aggiunti e' beverage (stesso flow
    // di createOrder, codice riusato + parametrizzato).
    try {
      const itemIds = addedItems.map(i => i.id);
      if (itemIds.length > 0) {
        const { rows: barNew } = await pool.query(
          `SELECT COUNT(*)::int AS n,
                  COALESCE(t.table_number, 'ASPORTO') AS table_number
             FROM order_items oi
             JOIN menu_items mi ON mi.id = oi.menu_item_id
             JOIN categories c  ON c.id = mi.category_id
             LEFT JOIN orders o ON o.id = oi.order_id
             LEFT JOIN tables t ON t.id = o.table_id
            WHERE oi.id = ANY($1::uuid[]) AND oi.tenant_id = $2
              AND c.is_beverage = true
            GROUP BY t.table_number`,
          [itemIds, tenantId]
        );
        if (barNew.length > 0 && barNew[0].n > 0) {
          const tn = barNew[0].table_number;
          const n = barNew[0].n;
          getIO()?.emit('new-bar-order', { orderId: order_id, tableNumber: tn, itemCount: n });
          const { rows: bartenders } = await pool.query(
            `SELECT id FROM users WHERE tenant_id = $1 AND is_active = true
              AND role = 'waiter' AND sub_role IN ('bar','bar/caffetteria')`,
            [tenantId]
          );
          const pushService = require('../services/pushService');
          await Promise.all(bartenders.map(b => pushService.sendToUser(b.id, {
            title: `🍷 Tavolo ${tn} — +${n} drink`,
            body: 'Drink aggiunti a ordine esistente',
            tag: `bar-${order_id}`,
            url: '/bar',
            vibrate: [200, 100, 200],
            requireInteraction: true,
          }).catch(() => {})));
        }
      }
    } catch (e) {
      req.log?.warn({ err: e?.message }, 'bar push (addItems) failed');
    }

    // Pizzeria → Simone: push se tra gli item aggiunti ci sono pizze.
    try {
      const itemIds = addedItems.map(i => i.id);
      if (itemIds.length > 0) {
        const { rows: pz } = await pool.query(
          `SELECT COALESCE(SUM(oi.quantity), 0)::int AS qty,
                  COALESCE(t.table_number, 'ASPORTO') AS table_number
             FROM order_items oi
             JOIN menu_items mi ON mi.id = oi.menu_item_id
             LEFT JOIN categories c ON c.id = mi.category_id
             LEFT JOIN orders o ON o.id = oi.order_id
             LEFT JOIN tables t ON t.id = o.table_id
            WHERE oi.id = ANY($1::uuid[]) AND oi.tenant_id = $2
              AND COALESCE(mi.prep_station, c.prep_station, 'cucina') = 'pizzeria'
            GROUP BY t.table_number`,
          [itemIds, tenantId]
        );
        if (pz.length > 0 && pz[0].qty > 0) {
          await pushToPizzaioli(tenantId, pz[0].table_number, pz[0].qty, order_id);
        }
      }
    } catch (e) {
      req.log?.warn({ err: e?.message }, 'pizzeria push (addItems) failed');
    }

    res.status(201).json([...addedItems, ...surchargeItems]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ── cancelItem ───────────────────────────────────────────────

async function cancelItem(req, res, next) {
  const bcrypt = require('bcrypt');
  try {
    const { id: order_id, itemId } = req.params;
    const tenantId = TENANT(req);
    // Body opzionale: { override: { pin, reason } } — permette al WAITER
    // di cancellare un item se fornisce il PIN di un manager/admin presente.
    const override = req.body?.override;

    let authorizer = req.user; // di default chi chiama
    let overrideUsed = false;
    let overrideReason = null;

    if (!['admin', 'manager'].includes(req.user.role)) {
      // Non manager/admin: serve override valido
      if (!override?.pin || !/^\d{4,6}$/.test(override.pin)) {
        return res.status(403).json({
          error: 'Cancellazione richiede autorizzazione responsabile. Inserisci PIN responsabile.',
          requires_override: true,
        });
      }
      // Verifica PIN contro managers/admin attivi del tenant
      const { rows: managers } = await pool.query(
        `SELECT id, name, role, pin_hash FROM users
          WHERE tenant_id=$1 AND is_active=true AND role IN ('manager','admin')`,
        [tenantId]
      );
      let matched = null;
      for (const m of managers) {
        if (await bcrypt.compare(override.pin, m.pin_hash)) { matched = m; break; }
      }
      if (!matched) {
        req.log?.warn({ requested_by: req.user.id, order_id, itemId }, '[cancelItem] override PIN errato');
        return res.status(401).json({ error: 'PIN responsabile non riconosciuto' });
      }
      authorizer = matched;
      overrideUsed = true;
      overrideReason = override.reason || null;
    }

    const { rows: [item] } = await pool.query(
      `UPDATE order_items SET status='cancelled' WHERE id=$1 AND order_id=$2 AND tenant_id=$3 RETURNING *`,
      [itemId, order_id, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });

    const itemNameQ = await pool.query(
      "SELECT COALESCE(mi.name, oi.combo_menu_name, 'Item') AS name FROM order_items oi LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id WHERE oi.id = $1 AND oi.tenant_id = $2",
      [itemId, tenantId]
    );
    // Audit: user_id/user_name = chi ha autorizzato (manager se override usato,
    // altrimenti chi chiama). Metadata include override info per ricostruzione.
    await pool.query(
      `INSERT INTO order_audit_log (tenant_id, order_id, item_id, action, from_value, to_value, user_id, user_name, metadata)
       VALUES ($1,$2,$3,'item_delete',$4,'cancelled',$5,$6,$7)`,
      [tenantId, order_id, itemId, item.status, authorizer.id, authorizer.name,
       JSON.stringify({
         item_name: itemNameQ.rows[0]?.name,
         quantity: item.quantity,
         override_used: overrideUsed,
         requested_by_id: req.user.id,
         requested_by_name: req.user.name,
         override_reason: overrideReason,
       })]
    );

    res.json(item);
  } catch (err) { next(err); }
}

// ── cancelOrder ──────────────────────────────────────────────

async function cancelOrder(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const { id } = req.params;
    const { rows: [order] } = await client.query(
      "SELECT * FROM orders WHERE id=$1 AND tenant_id=$2 AND status='open'",
      [id, tenantId]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato o già chiuso' });

    await client.query('BEGIN');

    await client.query(
      "UPDATE order_items SET status='cancelled' WHERE order_id=$1 AND tenant_id=$2 AND status != 'cancelled'",
      [id, tenantId]
    );

    const { rows: [updated] } = await client.query(
      "UPDATE orders SET status='cancelled' WHERE id=$1 AND tenant_id=$2 RETURNING *",
      [id, tenantId]
    );

    await client.query('COMMIT');

    if (order.table_id) {
      await pool.query(
        "UPDATE tables SET status='free' WHERE id=$1 AND tenant_id=$2",
        [order.table_id, tenantId]
      );
      getIO()?.emit('table-status-changed', {
        tableId: order.table_id,
        status: 'free',
        active_order_id: null,
      });
    }

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// "Codice 32" — passa la responsabilita' di un ordine ad un altro cameriere.
// Tipico: Marco prende il tavolo ma e' occupato col tavolo successivo,
// chiama 32 → Umberto eredita l'ordine. Logga in order_audit_log per
// audit trail (esiste obbligo policy interno di tracciare il passaggio).
async function transferOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { to_waiter_id, reason } = req.body;
    const tenantId = req.tenant.id;

    if (!to_waiter_id) {
      return res.status(400).json({ error: 'to_waiter_id obbligatorio' });
    }

    // 1. Verifica destinatario: deve essere un waiter ATTIVO dello stesso tenant
    const { rows: [target] } = await pool.query(
      `SELECT id, name, role, sub_role FROM users
        WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
      [to_waiter_id, tenantId]
    );
    if (!target) return res.status(404).json({ error: 'Cameriere destinatario non valido' });
    if (target.role !== 'waiter') {
      return res.status(400).json({ error: `Il destinatario deve essere un cameriere (ruolo attuale: ${target.role})` });
    }

    // 2. Recupera ordine + verifica appartenenza tenant + status aperto
    const { rows: [order] } = await pool.query(
      `SELECT o.id, o.waiter_id, o.table_id, o.status, t.table_number, u.name AS from_waiter_name
         FROM orders o
         LEFT JOIN tables t ON t.id = o.table_id
         LEFT JOIN users u ON u.id = o.waiter_id
        WHERE o.id = $1 AND o.tenant_id = $2`,
      [id, tenantId]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });
    if (order.status !== 'open') {
      return res.status(409).json({ error: `Ordine in stato '${order.status}' non trasferibile` });
    }
    if (order.waiter_id === to_waiter_id) {
      return res.status(409).json({ error: 'Stesso cameriere — nessun trasferimento' });
    }

    // 3. UPDATE + audit log atomico
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE orders SET waiter_id = $1 WHERE id = $2 AND tenant_id = $3`,
        [to_waiter_id, id, tenantId]
      );
      await client.query(
        `INSERT INTO order_audit_log
           (tenant_id, order_id, user_id, user_name, action, from_value, to_value, metadata)
         VALUES ($1, $2, $3, $4, 'transfer', $5, $6, $7::jsonb)`,
        [
          tenantId, id, req.user.id, req.user.name,
          order.from_waiter_name || '',
          target.name,
          JSON.stringify({
            from_waiter_id: order.waiter_id,
            to_waiter_id,
            reason: reason || 'codice 32',
          }),
        ]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // 4. Emissione socket: notifica entrambi (vecchio + nuovo waiter) +
    //    admin/manager per audit visivo.
    const { getIO } = require('../socket');
    const io = getIO();
    io?.to(`user:${order.waiter_id}`).emit('order-transferred-out', {
      orderId: id, tableNumber: order.table_number, toWaiterName: target.name,
    });
    io?.to(`user:${to_waiter_id}`).emit('order-transferred-in', {
      orderId: id, tableNumber: order.table_number, fromWaiterName: order.from_waiter_name,
    });
    io?.to('role:admin').to('role:manager').emit('order-transferred', {
      orderId: id, tableNumber: order.table_number,
      fromWaiterName: order.from_waiter_name, toWaiterName: target.name,
      byUserName: req.user.name, reason: reason || 'codice 32',
    });
    // Aggiorna anche la mappa tavoli (view tables_with_active_order ha
    // active_waiter_name che ora cambia → forza refresh client)
    io?.emit('table-status-changed', { tableId: order.table_id });

    res.json({ ok: true, order_id: id, new_waiter: { id: target.id, name: target.name } });
  } catch (err) { next(err); }
}

// ── setItemPrice ─────────────────────────────────────────────
// JP 2026-05-31: la cassa puo' cliccare sul prezzo di una voce del conto e
// modificarlo (sconto specifico, correzione, prezzo concordato). Aggiorna
// unit_price e ricalcola subtotal = unit_price * quantity. Permesso solo a
// cashier/admin/manager (gate sul route).
async function setItemPrice(req, res, next) {
  try {
    const { id: order_id, itemId } = req.params;
    const tenantId = TENANT(req);
    const { unit_price } = req.body || {};
    const price = Math.round((parseFloat(unit_price) || 0) * 100) / 100;
    if (!Number.isFinite(price)) {
      return res.status(400).json({ error: 'Prezzo non valido' });
    }
    // Verifica che l'item appartenga all'ordine + tenant; ricava qty per
    // ricalcolare il subtotal in modo coerente con la riga.
    const { rows: [item] } = await pool.query(
      `SELECT oi.id, oi.quantity, oi.modifier_total, oi.status, o.status AS order_status
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.id = $1 AND oi.order_id = $2 AND oi.tenant_id = $3`,
      [itemId, order_id, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Voce non trovata' });
    if (item.status === 'cancelled') return res.status(400).json({ error: 'Voce cancellata' });
    if (item.order_status !== 'open') return res.status(400).json({ error: 'Ordine chiuso, non modificabile' });
    const qty = Number(item.quantity) || 1;
    const modTot = Number(item.modifier_total) || 0;
    const newSubtotal = Math.round((price + modTot) * qty * 100) / 100;
    const { rows: [updated] } = await pool.query(
      `UPDATE order_items
          SET unit_price = $1, subtotal = $2
        WHERE id = $3 AND tenant_id = $4
        RETURNING id, unit_price, subtotal, quantity`,
      [price, newSubtotal, itemId, tenantId]
    );
    res.json(updated);
  } catch (err) { next(err); }
}

module.exports = { createOrder, getOrder, addItems, cancelItem, cancelOrder, transferOrder, setItemPrice };
