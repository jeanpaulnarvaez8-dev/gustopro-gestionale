const pool = require('../config/db');
const { getIO } = require('../socket');
const { auditLog } = require('./workflow.controller');

// Tenant isolation: every order/item operation is scoped to req.tenant.id.
// Helper functions take tenantId as an explicit parameter because they
// receive a transaction client (not req).
const TENANT = (req) => req.tenant.id;

// ── Helpers ──────────────────────────────────────────────────

async function insertRegularItem(client, order_id, item, userId, tenantId) {
  const { menu_item_id, quantity = 1, notes: itemNotes, modifiers = [], weight_g, fire_at_minutes } = item;
  let workflow_status = item.workflow_status || 'production';
  // JP 2026-06-05: il client ha esplicitamente settato 'waiting'?
  // Distingue dal waiting "tecnico" forzato dopo da requires_dispatch.
  const clientExplicitlyHeld = workflow_status === 'waiting';
  // JP 2026-06-03: timer auto-fire in minuti dal carrello (es. Marco scrive
  // "10" sulla riga ATTESA → fra 10 min il piatto parte da solo in cucina).
  // Significativo solo se workflow_status='waiting'.
  // JP 2026-06-03: cap a 180 min per non far sopravvivere timer al day-close.
  const fireAtMin = Math.min(180, Math.max(0, parseInt(fire_at_minutes, 10) || 0));

  // menu_item must belong to the same tenant. JOIN su categories per sapere
  // se e' bevanda (bar bypassa il comandista).
  const { rows: [menuItem] } = await client.query(
    `SELECT mi.base_price, mi.pricing_type, mi.name, mi.prep_station,
            COALESCE(c.is_beverage, false) AS is_beverage,
            COALESCE(mi.auto_print, c.auto_print, false) AS auto_print,
            COALESCE(mi.goes_to_bar, c.goes_to_bar, false) AS goes_to_bar
       FROM menu_items mi
       LEFT JOIN categories c ON c.id = mi.category_id
      WHERE mi.id=$1 AND mi.is_available=true AND mi.tenant_id=$2`,
    [menu_item_id, tenantId]
  );
  if (!menuItem) throw { status: 400, message: `Item ${menu_item_id} non disponibile` };

  // JP 2026-06-03: se il tenant richiede dispatch (Comandista 7500),
  // tutti gli items di cucina partono in 'waiting' → solo il comandista
  // li vede finche' non preme "INIZIA TAVOLO". Le BEVANDE invece restano
  // 'production' (il bar le riceve subito, no dispatcher).
  const { rows: [tcfg] } = await client.query(
    'SELECT COALESCE(requires_dispatch,false) AS requires_dispatch FROM tenants WHERE id=$1',
    [tenantId]
  );
  // JP 2026-06-04: anche gli ASPORTI saltano il Comandista — vanno
  // dritti alle stazioni perche' il bar (Alessandra PIN 3000) li
  // gestisce in tempo reale, non c'e' un cliente al tavolo che
  // aspetta sequenze.
  const { rows: [orderInfo] } = await client.query(
    `SELECT order_type FROM orders WHERE id=$1 AND tenant_id=$2`,
    [order_id, tenantId]
  );
  const isTakeaway = orderInfo?.order_type === 'takeaway';
  // JP 2026-06-03: bypass Comandista anche per items auto_print (dessert/
  // acque/vini/bollicine/spina) e per gli asporti.
  // JP 2026-06-07: anche PIZZE bypass — vanno direttamente a Simone (PIN
  // 2099, KDS pizzeria). Il Comandista non smista le pizze.
  const isPizza = menuItem.prep_station === 'pizzeria';
  // JP 2026-06-12: ASPORTI PRE-PAGATI. Tutti gli item di un asporto nascono
  // 'waiting' (held): la comanda NON parte finche' il cliente non ha pagato.
  // Al pagamento (processPayment) gli item passano a 'production' e parte la
  // comanda cucina/bar. Vale per TUTTO l'asporto (anche bevande/dessert/pizze
  // che normalmente bypasserebbero l'attesa). is_manual_hold=true marca questi
  // come hold "tecnico da pagamento" (non li libera INIZIA TAVOLO per sbaglio).
  if (isTakeaway && workflow_status === 'production') {
    workflow_status = 'waiting';
  } else if (tcfg?.requires_dispatch && !menuItem.is_beverage && !menuItem.auto_print && !isTakeaway && !isPizza && workflow_status === 'production') {
    workflow_status = 'waiting';
  }

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
  // fire_at solo sui waiting con minuti > 0. Calcolato server-side per evitare
  // drift orologio client vs DB. Per items production/delivered → NULL.
  const fireAtIso = (wfStatus === 'waiting' && fireAtMin > 0)
    ? new Date(Date.now() + fireAtMin * 60_000)
    : null;

  // JP 2026-06-05: manual hold = cameriere ha esplicitamente settato 'waiting'
  // E non ha messo timer. INIZIA TAVOLO e auto-fire non lo toccano: solo il
  // cameriere/Manda in cucina lo puo' sbloccare. Per i waiting "tecnici"
  // (forzati da requires_dispatch su un client che inviava 'production'),
  // is_manual_hold=false → comportamento INIZIA TAVOLO invariato.
  const isManualHold = clientExplicitlyHeld && wfStatus === 'waiting' && !fireAtIso;

  const { rows: [orderItem] } = await client.query(
    `INSERT INTO order_items
       (tenant_id, order_id, menu_item_id, quantity, unit_price, modifier_total, subtotal, notes, weight_g,
        workflow_status, status, inserted_by, served_at, fire_at, is_manual_hold)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [tenantId, order_id, menu_item_id, quantity, unitPrice, modifierTotal, subtotal, itemNotes || null, weight_g || null,
     wfStatus, itemStatus, userId, servedAt, fireAtIso, isManualHold]
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
  // JP 2026-06-03/05: marker per auto-print sala (.24) e bar (.21).
  // Non-enumerable: cosi' non finiscono nella serializzazione JSON che
  // poi rompe il salvataggio idempotency (errore "invalid input syntax
  // for type json" su Express response cache).
  Object.defineProperty(orderItem, '__autoPrint', {
    value: !!menuItem.auto_print, enumerable: false, configurable: true, writable: true,
  });
  Object.defineProperty(orderItem, '__goesToBar', {
    value: !!menuItem.goes_to_bar, enumerable: false, configurable: true, writable: true,
  });
  return orderItem;
}

async function insertComboItem(client, order_id, item, userId, tenantId) {
  const { combo_menu_id, quantity = 1, selections = [], notes: itemNotes, workflow_status = 'production' } = item;
  // JP 2026-06-05: anche sui combo, se cameriere setta 'waiting' senza
  // timer → manual hold (INIZIA TAVOLO non lo tocca).
  const clientExplicitlyHeld = workflow_status === 'waiting';

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
  const isManualHold = clientExplicitlyHeld && wfStatus === 'waiting';

  const { rows: [orderItem] } = await client.query(
    `INSERT INTO order_items
       (tenant_id, order_id, menu_item_id, combo_menu_id, combo_menu_name, combo_selections,
        quantity, unit_price, modifier_total, subtotal, notes,
        workflow_status, status, inserted_by, served_at, is_manual_hold)
     VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [tenantId, order_id, combo.id, combo.name, JSON.stringify(selections),
     quantity, unitPrice, subtotal, itemNotes || null,
     wfStatus, itemStatus, userId, servedAt, isManualHold]
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

    // JP 2026-06-03: auto-print sala (.24). Acqua/dessert vengono
    // stampati subito sul ticket di sala col numero tavolo. Marker
    // __autoPrint settato in insertRegularItem.
    // JP 2026-06-12: per gli ASPORTI le stampe NON partono alla creazione
    // (item in waiting, non pagato). Partiranno tutte al pagamento — vedi
    // fireAsportoItems in billing.controller.processPayment.
    try {
      const autoIds = order_type !== 'takeaway'
        ? orderItems.filter(it => it.__autoPrint).map(it => it.id) : [];
      if (autoIds.length > 0) {
        const { enqueueAutoPrintJob } = require('./print.controller');
        enqueueAutoPrintJob(tenantId, order.id, autoIds);
      }
    } catch (e) {
      req.log?.warn?.({ err: e.message }, 'auto-print enqueue failed (non-blocking)');
    }

    // JP 2026-06-05: bar pass (.21). Cocktail/birre/vini/bollicine/caffe'/
    // digestivi → ticket aggregato sulla stampante bar con TAV X.
    try {
      // JP 2026-06-12: asporti → niente bar-pass alla creazione (parte al pagamento).
      const barIds = order_type !== 'takeaway'
        ? orderItems.filter(it => it.__goesToBar).map(it => it.id) : [];
      if (barIds.length > 0) {
        const { scheduleBarTicket } = require('./print.controller');
        scheduleBarTicket(tenantId, order.id, barIds);
      }
    } catch (e) {
      req.log?.warn?.({ err: e.message }, 'bar-pass schedule failed (non-blocking)');
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

    // JP 2026-06-10: includo mi.pricing_type per far apparire il pill peso
    // pesce nel checkout ANCHE se weight_g e' null (pesce mandato in fretta).
    // Cosi' la cassa puo' inserire il peso dopo, prima del preconto.
    const { rows: items } = await pool.query(
      `SELECT oi.*,
              COALESCE(mi.name, oi.combo_menu_name, oi.custom_name, 'Item') AS item_name,
              mi.pricing_type AS menu_pricing_type
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = $1 AND oi.tenant_id = $2
       ORDER BY oi.sent_at`,
      [id, tenantId]
    );

    res.json({ ...order, items });
  } catch (err) { next(err); }
}

// JP 2026-06-12: lista ordini SELF-ORDER da QR in attesa di incasso.
// La cassa li vede in una schermata dedicata, incassa, e la comanda parte
// (anti-furto: niente parte finche' non e' pagato). source='qr' + held.
async function getQrPendingOrders(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const { rows } = await pool.query(
      `SELECT o.id, o.customer_name, o.order_type, o.total_amount,
              o.takeaway_number, o.created_at,
              COALESCE(t.table_number, 'ASPORTO') AS table_number,
              COALESCE(
                json_agg(json_build_object(
                  'name', COALESCE(mi.name, oi.combo_menu_name, 'Piatto'),
                  'quantity', oi.quantity
                ) ORDER BY oi.sent_at)
                FILTER (WHERE oi.id IS NOT NULL), '[]'
              ) AS items
         FROM orders o
         LEFT JOIN tables t ON t.id = o.table_id
         LEFT JOIN order_items oi ON oi.order_id = o.id
              AND oi.status <> 'cancelled' AND COALESCE(oi.is_surcharge, false) = false
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE o.tenant_id = $1 AND o.source = 'qr'
          AND o.status = 'open' AND o.payment_status = 'unpaid'
        GROUP BY o.id, t.table_number
        ORDER BY o.created_at ASC`,
      [tenantId]
    );
    res.json(rows);
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

    // JP 2026-06-07: ownership check RIMOSSO. Stile operativo Riva: tutti
    // i camerieri si aiutano sui tavoli. Marco apre tav 5 e va in cucina,
    // Umberto passa e aggiunge una voce → deve poterlo fare. Stesso vale
    // per i tavoli aperti dall'admin (waiter_id = admin) — Marco deve
    // poterli gestire come fossero suoi. L'audit log traccia chi ha fatto
    // cosa, basta a ricostruire la storia.
    // Per il Codice 32 inverso (subentra) resta l'endpoint /claim che
    // aggiorna waiter_id formalmente.
    void order;

    const addedItems = [];      // piatti veri (cucina/bar) → feed KDS/bar/direct-delivered
    const surchargeItems = [];  // voci libere cassa → solo conto, no cucina
    for (const item of items) {
      try {
        // Voce a prezzo libero (cassa): qualcosa fuori menu da mettere sul conto.
        // Solo cassa/manager/admin possono fissare un prezzo arbitrario.
        // JP 2026-06-07: anche waiter+asporto solo se ordine takeaway
        // (Alessandra fa cassa asporto).
        if (item.type === 'custom') {
          const isPrivileged = ['cashier', 'manager', 'admin'].includes(req.user.role);
          const isAsportoCassa = req.user.role === 'waiter' && req.user.sub_role === 'asporto' && order.order_type === 'takeaway';
          if (!isPrivileged && !isAsportoCassa) {
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

    // JP 2026-06-03: auto-print sala anche su addItems (cliente ordina di
    // nuovo bevande dopo l'apertura del tavolo).
    try {
      const autoIds = addedItems.filter(it => it.__autoPrint).map(it => it.id);
      if (autoIds.length > 0) {
        const { enqueueAutoPrintJob } = require('./print.controller');
        enqueueAutoPrintJob(tenantId, order_id, autoIds);
      }
    } catch (e) {
      req.log?.warn?.({ err: e.message }, 'auto-print enqueue failed (non-blocking)');
    }

    // JP 2026-06-05: bar pass anche su addItems (cliente ordina altri
    // cocktail/caffe' dopo l'apertura del tavolo).
    try {
      const barIds = addedItems.filter(it => it.__goesToBar).map(it => it.id);
      if (barIds.length > 0) {
        const { scheduleBarTicket } = require('./print.controller');
        scheduleBarTicket(tenantId, order_id, barIds);
      }
    } catch (e) {
      req.log?.warn?.({ err: e.message }, 'bar-pass schedule failed (non-blocking)');
    }

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

    // JP 2026-06-05: AND status NOT IN ('cancelled') per idempotenza, +
    // reset ready_at/served_at se l'item era gia' servito (refund post-pass)
    // → cosi' le metriche avg_prep_min nei report non vengono contaminate.
    const { rows: [item] } = await pool.query(
      `UPDATE order_items
          SET status='cancelled',
              ready_at = CASE WHEN status IN ('served','ready') THEN NULL ELSE ready_at END,
              served_at = CASE WHEN status='served' THEN NULL ELSE served_at END
        WHERE id=$1 AND order_id=$2 AND tenant_id=$3 AND status <> 'cancelled'
        RETURNING *`,
      [itemId, order_id, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato o gia\' cancellato' });

    const itemNameQ = await pool.query(
      "SELECT COALESCE(mi.name, oi.combo_menu_name, 'Item') AS name FROM order_items oi LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id WHERE oi.id = $1 AND oi.tenant_id = $2",
      [itemId, tenantId]
    );

    // JP 2026-06-05: cleanup service_alerts pendenti (direct_delivered).
    // Senza, la campanella admin suona per item gia' cancellato.
    await pool.query(
      'DELETE FROM service_alerts WHERE order_item_id=$1 AND tenant_id=$2',
      [itemId, tenantId]
    ).catch(() => {});

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

    // JP 2026-06-05: emit socket event per aggiornare KDS in tempo reale.
    // Senza, la cucina continua a vedere/cucinare l'item per max 15s
    // (polling window). Spreco materia prima.
    try {
      getIO()?.emit('item-cancelled', {
        orderId: order_id,
        itemId,
        prevStatus: item.status,
      });
    } catch (_) {}

    res.json(item);
  } catch (err) { next(err); }
}

// JP 2026-06-06: chiusura asporto SPLIT in due endpoint distinti
// (sostituisce il vecchio completeAsporto che marcava paid senza scontrino).
//
// Razionale: il vecchio bottone "LIBERA" generava 4 problemi:
//   1) compliance: dashboard revenue inflata da asporti paid senza scontrino
//   2) audit: nessuna traccia di chi/quando/perche'
//   3) frode latente: cameriere ritira cash, preme LIBERA, intasca
//   4) no_show: cliente non ritira ma l'ordine resta marcato paid
//
// Nuovo flow:
//   markAsportoRitirato → cliente ritira + paga: payment + receipt + paid
//   markAsportoNoShow   → cliente non ritira: cancelled + audit con motivo
// Entrambi solo admin/manager (vedi routes), entrambi loggati in audit.

const VALID_ASPORTO_METHODS = ['cash', 'card', 'digital'];

async function markAsportoRitirato(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const { id } = req.params;
    const { payment_method, register } = req.body || {};
    const registerNorm = register
      ? String(register).toLowerCase().trim().slice(0, 32)
      : null;

    await client.query('BEGIN');

    const { rows: [order] } = await client.query(
      `SELECT id, order_type, status, payment_status, total_amount, tax_amount, customer_name
         FROM orders
        WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId]
    );
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    if (order.order_type !== 'takeaway') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Solo gli asporti possono essere chiusi cosi' });
    }
    if (order.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Asporto gia\' chiuso' });
    }

    // JP 2026-06-12: ASPORTO PRE-PAGATO. Se l'asporto e' GIA' stato incassato
    // (payment_status='paid', flusso "incassa → parte comanda → ritira"), il
    // ritiro fa SOLO la chiusura (no nuovo payment/receipt, sarebbe doppio
    // incasso). payment_method obbligatorio solo se NON ancora pagato (fallback
    // vecchio flusso: ritira+paga insieme).
    const alreadyPaid = order.payment_status === 'paid';
    if (!alreadyPaid && !VALID_ASPORTO_METHODS.includes(payment_method)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `payment_method obbligatorio. Valori: ${VALID_ASPORTO_METHODS.join(', ')}`,
      });
    }

    await client.query(
      "UPDATE order_items SET status='served', served_at=NOW() WHERE order_id=$1 AND tenant_id=$2 AND status NOT IN ('served','cancelled')",
      [id, tenantId]
    );

    // UPDATE ATOMICO con WHERE status='open' per intercettare race
    // (due click "Ritirato" simultanei → solo uno passa, l'altro 409).
    const { rows: [updated] } = await client.query(
      "UPDATE orders SET status='completed', payment_status='paid' WHERE id=$1 AND tenant_id=$2 AND status='open' RETURNING *",
      [id, tenantId]
    );
    if (!updated) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Asporto gia\' chiuso (race)' });
    }

    const totalAmount = parseFloat(order.total_amount);
    // JP 2026-06-12: payment + receipt SOLO se non gia' incassato in cassa.
    // Se alreadyPaid, il pagamento e la ricevuta sono gia' stati creati da
    // processPayment all'incasso → qui solo chiusura (no doppio incasso).
    let payment = null;
    let receipt = null;
    if (!alreadyPaid) {
      ({ rows: [payment] } = await client.query(
        `INSERT INTO payments (tenant_id, order_id, amount, payment_method, processed_by, register)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [tenantId, id, totalAmount, payment_method, req.user.id, registerNorm]
      ));

      // Snapshot voci per il receipt (no coperto su asporto).
      const { rows: items } = await client.query(
        `SELECT
           SUM(oi.quantity)::int AS quantity,
           SUM(oi.subtotal) AS subtotal,
           COALESCE(mi.name, oi.combo_menu_name, oi.custom_name, 'Item') AS item_name
         FROM order_items oi
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE oi.order_id=$1 AND oi.tenant_id=$2 AND oi.status <> 'cancelled'
         GROUP BY COALESCE(mi.name, oi.combo_menu_name, oi.custom_name, 'Item'), oi.unit_price
         ORDER BY MIN(oi.sent_at) NULLS FIRST`,
        [id, tenantId]
      );

      ({ rows: [receipt] } = await client.query(
        `INSERT INTO receipts (tenant_id, order_id, issued_by, total_amount, tax_amount, receipt_data, register)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [tenantId, id, req.user.id, totalAmount, order.tax_amount,
         JSON.stringify({ items, channel: 'asporto' }), registerNorm]
      ));
    }

    await auditLog(client, {
      tenant_id: tenantId,
      order_id: id,
      action: 'asporto_ritirato',
      from_value: 'open',
      to_value: 'completed',
      user_id: req.user.id,
      user_name: req.user.name,
      metadata: {
        customer_name: order.customer_name,
        payment_method: alreadyPaid ? 'gia_incassato' : payment_method,
        register: registerNorm,
        amount: totalAmount,
        receipt_id: receipt?.id || null,
        already_paid: alreadyPaid,
      },
    });

    await client.query('COMMIT');
    getIO()?.emit('order-completed', { orderId: id });
    res.json({ order: updated, payment, receipt });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    next(err);
  } finally {
    client.release();
  }
}

async function markAsportoNoShow(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const { id } = req.params;
    const reason = req.body?.reason
      ? String(req.body.reason).trim().slice(0, 500)
      : null;

    await client.query('BEGIN');

    const { rows: [order] } = await client.query(
      `SELECT id, order_type, status, customer_name, total_amount
         FROM orders
        WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId]
    );
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ordine non trovato' });
    }
    if (order.order_type !== 'takeaway') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Solo gli asporti possono essere marcati no_show' });
    }
    if (order.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Asporto gia\' chiuso' });
    }

    // Cancello solo items ancora in pending/cooking (cucina ferma subito).
    // Quelli gia' served/ready restano: erano stati preparati per davvero
    // (spreco reale che vogliamo tracciare in inventory/waste analytics).
    await client.query(
      "UPDATE order_items SET status='cancelled' WHERE order_id=$1 AND tenant_id=$2 AND status IN ('pending','cooking')",
      [id, tenantId]
    );

    const { rows: [updated] } = await client.query(
      "UPDATE orders SET status='cancelled' WHERE id=$1 AND tenant_id=$2 AND status='open' RETURNING *",
      [id, tenantId]
    );
    if (!updated) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Asporto gia\' chiuso (race)' });
    }

    await auditLog(client, {
      tenant_id: tenantId,
      order_id: id,
      action: 'asporto_no_show',
      from_value: 'open',
      to_value: 'cancelled',
      user_id: req.user.id,
      user_name: req.user.name,
      metadata: {
        customer_name: order.customer_name,
        lost_amount: parseFloat(order.total_amount),
        reason,
      },
    });

    await client.query('COMMIT');
    getIO()?.emit('order-cancelled', {
      orderId: id,
      tableId: null,
      orderType: 'takeaway',
    });
    res.json({ order: updated, reason });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    next(err);
  } finally {
    client.release();
  }
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

    // JP 2026-06-06 FIX (anti-frode HIGH): audit log obbligatorio.
    // Prima cancelOrder NON scriveva audit → manager poteva cancellare
    // tavoli pagati cash senza traccia.
    await client.query(
      `INSERT INTO order_audit_log (tenant_id, order_id, action, from_value, to_value, user_id, user_name, metadata)
       VALUES ($1,$2,'order_cancel',$3,'cancelled',$4,$5,$6)`,
      [tenantId, id, order.status, req.user.id, req.user.name,
       JSON.stringify({
         order_type: order.order_type,
         table_id: order.table_id,
         customer_name: order.customer_name,
         total_amount: order.total_amount,
         role: req.user.role,
       })]
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

    // JP 2026-06-05: emit order-cancelled per il KDS (cucina/pizzeria/bar).
    // Senza, la cucina continua a vedere/cucinare items dell'ordine
    // annullato per max 15s (polling). Anche asporto: nessun evento
    // socket veniva emesso (no table_id).
    try {
      getIO()?.emit('order-cancelled', {
        orderId: id,
        tableId: order.table_id || null,
        orderType: order.order_type,
      });
    } catch (_) {}

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

// "Codice 32 inverso" — un cameriere subentra ad un altro su un ordine
// aperto. Tipico: Marco aveva delegato a Umberto via transferOrder, poi
// torna libero e vuole riprendersi il tavolo. Audit log esplicito per
// non perdere chi serviva quando (mance, dispute). Solo waiter: manager/
// admin/cassa bypassano gia' il check di ownership in addItems.
async function claimOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const tenantId = req.tenant.id;

    if (req.user.role !== 'waiter') {
      return res.status(403).json({ error: 'Solo i camerieri possono subentrare a un tavolo' });
    }

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
      return res.status(409).json({ error: `Ordine in stato '${order.status}' non subentrabile` });
    }
    if (order.waiter_id === req.user.id) {
      return res.status(409).json({ error: 'Tavolo già tuo' });
    }

    const previousWaiterId = order.waiter_id;
    const previousWaiterName = order.from_waiter_name || '';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE orders SET waiter_id = $1 WHERE id = $2 AND tenant_id = $3`,
        [req.user.id, id, tenantId]
      );
      await client.query(
        `INSERT INTO order_audit_log
           (tenant_id, order_id, user_id, user_name, action, from_value, to_value, metadata)
         VALUES ($1, $2, $3, $4, 'claim', $5, $6, $7::jsonb)`,
        [
          tenantId, id, req.user.id, req.user.name,
          previousWaiterName,
          req.user.name,
          JSON.stringify({
            from_waiter_id: previousWaiterId,
            to_waiter_id: req.user.id,
            reason: reason || 'codice 32 inverso',
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

    const io = getIO();
    if (previousWaiterId) {
      io?.to(`user:${previousWaiterId}`).emit('order-claimed-out', {
        orderId: id, tableNumber: order.table_number, byWaiterName: req.user.name,
      });
    }
    io?.to(`user:${req.user.id}`).emit('order-claimed-in', {
      orderId: id, tableNumber: order.table_number, fromWaiterName: previousWaiterName,
    });
    io?.to('role:admin').to('role:manager').emit('order-claimed', {
      orderId: id, tableNumber: order.table_number,
      fromWaiterName: previousWaiterName, toWaiterName: req.user.name,
      byUserName: req.user.name, reason: reason || 'codice 32 inverso',
    });
    io?.emit('table-status-changed', { tableId: order.table_id });

    res.json({ ok: true, order_id: id, new_waiter: { id: req.user.id, name: req.user.name } });
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
      `SELECT oi.id, oi.quantity, oi.modifier_total, oi.status, o.status AS order_status, o.order_type
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.id = $1 AND oi.order_id = $2 AND oi.tenant_id = $3`,
      [itemId, order_id, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Voce non trovata' });
    if (item.status === 'cancelled') return res.status(400).json({ error: 'Voce cancellata' });
    if (item.order_status !== 'open') return res.status(400).json({ error: 'Ordine chiuso, non modificabile' });
    // JP 2026-06-07: waiter+asporto puo' modificare prezzo SOLO su takeaway.
    const isPrivileged = ['cashier', 'manager', 'admin'].includes(req.user.role);
    const isAsportoCassa = req.user.role === 'waiter' && req.user.sub_role === 'asporto' && item.order_type === 'takeaway';
    if (!isPrivileged && !isAsportoCassa) {
      return res.status(403).json({ error: 'Solo la cassa puo modificare il prezzo' });
    }
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

// ── setItemQuantity ──────────────────────────────────────────
// JP 2026-06-08: cassa decrementa quantita' di una voce nel conto
// (es: 2x Spritz, cliente ne paga 1 e l'altro non lo vuole). Aggiorna
// quantity e ricalcola subtotal. Se nuova quantity = 0, cancella.
// Permessi: stesso pattern di setItemPrice (cassa/admin/manager +
// waiter+asporto su takeaway).
async function setItemQuantity(req, res, next) {
  try {
    const { id: order_id, itemId } = req.params;
    const tenantId = TENANT(req);
    const { quantity } = req.body || {};
    const newQty = parseInt(quantity, 10);
    if (!Number.isFinite(newQty) || newQty < 0 || newQty > 99) {
      return res.status(400).json({ error: 'Quantita non valida (0-99)' });
    }
    const { rows: [item] } = await pool.query(
      `SELECT oi.id, oi.quantity, oi.unit_price, oi.modifier_total, oi.status,
              o.status AS order_status, o.order_type
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.id = $1 AND oi.order_id = $2 AND oi.tenant_id = $3`,
      [itemId, order_id, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Voce non trovata' });
    if (item.status === 'cancelled') return res.status(400).json({ error: 'Voce gia cancellata' });
    if (item.order_status !== 'open') return res.status(400).json({ error: 'Ordine chiuso' });
    // Permessi: cassa/admin/manager + Alessandra (waiter+asporto su takeaway).
    const isPrivileged = ['cashier', 'manager', 'admin'].includes(req.user.role);
    const isAsportoCassa = req.user.role === 'waiter' && req.user.sub_role === 'asporto' && item.order_type === 'takeaway';
    if (!isPrivileged && !isAsportoCassa) {
      return res.status(403).json({ error: 'Solo la cassa puo modificare la quantita' });
    }

    if (newQty === 0) {
      // Equivale a cancelItem: piu' semplice farlo qui in unico endpoint.
      await pool.query(
        `UPDATE order_items SET status='cancelled'
           WHERE id=$1 AND tenant_id=$2 AND status<>'cancelled'`,
        [itemId, tenantId]
      );
      try { getIO()?.emit('item-cancelled', { orderId: order_id, itemId, prevStatus: item.status }); } catch {}
      return res.json({ id: itemId, cancelled: true });
    }

    const unitPrice = Number(item.unit_price) || 0;
    const modTot = Number(item.modifier_total) || 0;
    const newSubtotal = Math.round((unitPrice + modTot) * newQty * 100) / 100;
    const { rows: [updated] } = await pool.query(
      `UPDATE order_items SET quantity=$1, subtotal=$2
        WHERE id=$3 AND tenant_id=$4
        RETURNING id, quantity, unit_price, subtotal`,
      [newQty, newSubtotal, itemId, tenantId]
    );
    res.json(updated);
  } catch (err) { next(err); }
}

// ── setItemWeight ────────────────────────────────────────────
// JP 2026-06-06: cassa/cameriere correggono il peso di un pesce gia'
// inserito (es. pesato 1kg ma in realta' era 1.9kg). Aggiorna weight_g
// e RICALCOLA automaticamente unit_price + subtotal in base al
// menu_items.base_price (€/kg).
//
// Per i piatti pricing_type='per_kg':
//   unit_price = (base_price * weight_g) / 1000
//   subtotal   = (unit_price + modifier_total) * quantity
//
// Per i piatti fixed: aggiorna SOLO weight_g (non ricalcola prezzo —
// utile per registrare info nutrizionale o servizio).
async function setItemWeight(req, res, next) {
  try {
    const { id: order_id, itemId } = req.params;
    const tenantId = TENANT(req);
    const { weight_g } = req.body || {};
    const wg = parseInt(weight_g, 10);
    if (!Number.isFinite(wg) || wg < 0 || wg > 30000) {
      return res.status(400).json({ error: 'Peso non valido (0-30000g)' });
    }
    const { rows: [item] } = await pool.query(
      `SELECT oi.id, oi.quantity, oi.modifier_total, oi.status, oi.unit_price AS curr_price,
              mi.base_price, mi.pricing_type,
              o.status AS order_status, o.order_type
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.id = $1 AND oi.order_id = $2 AND oi.tenant_id = $3`,
      [itemId, order_id, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Voce non trovata' });
    if (item.status === 'cancelled') return res.status(400).json({ error: 'Voce cancellata' });
    if (item.order_status !== 'open') return res.status(400).json({ error: 'Ordine chiuso, non modificabile' });
    // JP 2026-06-07: waiter+asporto puo' modificare peso SOLO su takeaway.
    const isPrivilegedW = ['cashier', 'manager', 'admin', 'waiter'].includes(req.user.role);
    const isAsportoCassaW = req.user.role === 'waiter' && req.user.sub_role === 'asporto' && item.order_type === 'takeaway';
    // I waiter normali possono cambiare il peso sui tavoli (sala). I waiter
    // asporto possono cambiare il peso sugli asporti. Cassa/admin/manager
    // sempre.
    if (!isPrivilegedW && !isAsportoCassaW) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }

    const qty = Number(item.quantity) || 1;
    const modTot = Number(item.modifier_total) || 0;
    let unitPrice, subtotal;
    if (item.pricing_type === 'per_kg' && item.base_price) {
      unitPrice = Math.round((Number(item.base_price) * wg) / 1000 * 100) / 100;
      subtotal  = Math.round((unitPrice + modTot) * qty * 100) / 100;
    } else {
      // Piatto fixed: preserva prezzo corrente, aggiorna solo weight_g.
      unitPrice = Number(item.curr_price) || 0;
      subtotal  = Math.round((unitPrice + modTot) * qty * 100) / 100;
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE order_items
          SET weight_g = $1, unit_price = $2, subtotal = $3
        WHERE id = $4 AND tenant_id = $5
        RETURNING id, weight_g, unit_price, subtotal, quantity`,
      [wg, unitPrice, subtotal, itemId, tenantId]
    );
    res.json(updated);
  } catch (err) { next(err); }
}

// ── setItemFireAt ────────────────────────────────────────────
// JP 2026-06-01: il cameriere imposta i minuti tra cui un piatto in attesa
// deve auto-firare in cucina. Body: { minutes } (intero >0). Per annullare,
// PATCH con minutes=null/0 → fire_at=NULL.
async function setItemFireAt(req, res, next) {
  try {
    const { id: order_id, itemId } = req.params;
    const tenantId = TENANT(req);
    const { minutes } = req.body || {};
    const mins = Number(minutes);
    if (mins !== null && !Number.isFinite(mins)) {
      return res.status(400).json({ error: 'minutes non valido' });
    }
    // Verifica item in ordine aperto, nello stesso tenant. JP 2026-06-03:
    // ora accettato anche workflow_status='production' (cameriere puo'
    // rimettere in attesa un piatto gia' mandato se ha sbagliato).
    const { rows: [item] } = await pool.query(
      `SELECT oi.id, oi.workflow_status, oi.status AS item_status,
              o.status AS order_status, o.waiter_id
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.id = $1 AND oi.order_id = $2 AND oi.tenant_id = $3`,
      [itemId, order_id, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Voce non trovata' });
    if (item.order_status !== 'open') return res.status(400).json({ error: 'Ordine chiuso' });
    // JP 2026-06-04: il cameriere puo' rimettere in attesa anche piatti
    // pending O in cottura (cuoco lo sta facendo ma il cliente vuole
    // aspettare). Solo i ready/served/cancelled restano intoccabili.
    // JP 2026-06-05 FIX: l'alias e' `item_status` non `item.status` →
    // endpoint ritornava SEMPRE 400. Il cameriere non poteva programmare
    // il fire time. Bug presente dal commit di setItemFireAt.
    if (!['pending', 'cooking'].includes(item.item_status)) {
      return res.status(400).json({ error: 'Il timer si imposta solo su voci non ancora pronte' });
    }
    // JP 2026-06-04: qualsiasi cameriere puo' cambiare il timer (anche su
    // tavoli aperti da altri o dall'admin). Bloccati solo cuochi/dispatcher
    // che non devono fare gestione sala.
    const isWaiter = req.user?.role === 'waiter';
    const isPrivilegedRole = ['admin', 'manager', 'cashier'].includes(req.user?.role);
    if (!isWaiter && !isPrivilegedRole) {
      return res.status(403).json({ error: 'Solo cameriere/cassa/admin possono cambiare il timer' });
    }
    // Cap a 180 min anche server-side.
    if (mins > 180) {
      return res.status(400).json({ error: 'Timer max 180 minuti' });
    }
    // JP 2026-06-03: se il cameriere imposta un timer su un piatto gia'
    // in production (caso "ho sbagliato a mandarlo"), lo ri-porta in
    // waiting con released_at=NULL (cosi' torna nelle code del 7500 e
    // sparisce dalle stazioni).
    //
    // JP 2026-06-05 FIX: se mins=0/null, RIMUOVE SOLO il timer ma il piatto
    // RESTA in attesa (workflow_status invariato). Per sbloccare in produzione
    // il cameriere usa l'endpoint workflow/changeStatus (bottone "Manda in
    // cucina"). Prima il piatto partiva subito → JP perdeva attese senza
    // accorgersene.
    let sql, params;
    if (mins > 0) {
      // Timer impostato → NON e' piu' manual hold (auto-fire prende controllo).
      sql = `UPDATE order_items SET
               fire_at = NOW() + ($1::int || ' minutes')::interval,
               workflow_status = 'waiting',
               released_at = NULL,
               is_manual_hold = false
             WHERE id = $2 AND tenant_id = $3
             RETURNING id, fire_at, workflow_status`;
      params = [Math.max(1, Math.round(mins)), itemId, tenantId];
    } else {
      // Rimuove SOLO il timer. Il piatto resta in attesa, e se era waiting
      // diventa manual hold (solo cameriere/Manda lo sblocca).
      sql = `UPDATE order_items SET
               fire_at = NULL,
               is_manual_hold = CASE WHEN workflow_status='waiting' THEN true ELSE is_manual_hold END
             WHERE id = $1 AND tenant_id = $2
             RETURNING id, fire_at, workflow_status`;
      params = [itemId, tenantId];
    }
    const { rows: [updated] } = await pool.query(sql, params);
    getIO()?.emit('item-fire-at-updated', {
      orderId: order_id, itemId, fireAt: updated.fire_at,
    });
    getIO()?.emit('workflow-status-changed', {
      orderId: order_id, itemId, workflow_status: updated.workflow_status,
    });
    res.json(updated);
  } catch (err) { next(err); }
}

// ── dispatchOrder ────────────────────────────────────────────
// JP 2026-06-03: il Comandista (sub_role='dispatcher', PIN 7500) preme
// "INIZIA TAVOLO" su un ordine in attesa di dispatch. Tutti gli item
// kitchen in 'waiting' di quell'ordine passano a 'production' →
// raggiungono le rispettive stazioni (frittura, antipasti, primi,
// pizzeria) in base al loro prep_station.
async function dispatchOrder(req, res, next) {
  try {
    const { id: order_id } = req.params;
    const tenantId = TENANT(req);
    // JP 2026-06-04: chiunque loggato (kitchen qualsiasi sub_role,
    // admin, manager, cashier, waiter) puo' premere INIZIA TAVOLO dal KDS.
    // Non e' una azione di security, e' operativa: serve liberare il
    // tavolo verso le stazioni il prima possibile.
    const allowed = ['kitchen', 'admin', 'manager', 'cashier', 'waiter'];
    if (!allowed.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Ruolo non autorizzato' });
    }
    // Tenant ownership + status check sull'ordine.
    const { rows: [orderRow] } = await pool.query(
      `SELECT id, status FROM orders WHERE id = $1 AND tenant_id = $2`,
      [order_id, tenantId]
    );
    if (!orderRow) return res.status(404).json({ error: 'Ordine non trovato' });
    if (orderRow.status !== 'open') {
      return res.status(400).json({ error: 'Ordine gia\' chiuso' });
    }
    // JP 2026-06-03: INIZIA TAVOLO rispetta il timer fire_at che il cameriere
    // ha messo su singoli piatti. Solo i waiting SENZA timer (fire_at IS NULL)
    // o con timer GIA' scaduto vengono rilasciati. Quelli con fire_at futuro
    // restano in attesa: serviceTimer.checkScheduledFiresForTenant li libera
    // automaticamente quando arriva l'ora. fire_at = NULL sui rilasciati per
    // non sporcare i dati post-dispatch.
    //
    // JP 2026-06-05: i waiting con is_manual_hold=true (cameriere ha
    // esplicitamente tenuto il piatto in attesa senza timer) NON vengono
    // rilasciati da INIZIA TAVOLO. Solo il cameriere/Manda in cucina li
    // puo' sbloccare. Prima sparivano dall'attesa = problema operativo.
    const { rows: items } = await pool.query(
      `UPDATE order_items
          SET workflow_status = 'production',
              released_at     = NOW(),
              fire_at         = NULL
        WHERE order_id = $1 AND tenant_id = $2
          AND workflow_status = 'waiting'
          AND COALESCE(is_surcharge, false) = false
          AND COALESCE(is_manual_hold, false) = false
          AND (fire_at IS NULL OR fire_at <= NOW())
        RETURNING id`,
      [order_id, tenantId]
    );
    // JP 2026-06-03: i waiting con timer futuro restano in waiting, MA
    // li marchiamo come "visti dal Comandista" settando released_at=NOW().
    // Il KDS stazione (frittura/primi/...) usa released_at IS NOT NULL per
    // mostrarli come PRE-ALLERTA col countdown ⏰ — il cuoco sa cosa sta
    // per arrivare. Pre-dispatch (released_at NULL) restano invisibili
    // alle stazioni e visibili solo al 7500.
    const { rows: preallerta } = await pool.query(
      `UPDATE order_items
          SET released_at = NOW()
        WHERE order_id = $1 AND tenant_id = $2
          AND workflow_status = 'waiting'
          AND fire_at IS NOT NULL AND fire_at > NOW()
          AND released_at IS NULL
        RETURNING id`,
      [order_id, tenantId]
    );
    // Quanti restano in attesa (timer ancora attivo)? Lo segnalo al chef.
    const { rows: [pending] } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM order_items
        WHERE order_id = $1 AND tenant_id = $2
          AND workflow_status = 'waiting'
          AND fire_at IS NOT NULL AND fire_at > NOW()`,
      [order_id, tenantId]
    );
    // JP 2026-06-06: anche quanti sono in manual hold (tenuti dal cameriere
    // senza timer). Non partono col INIZIA TAVOLO → il Comandista deve
    // sapere che ce ne sono ancora "appiccicati" all'ordine.
    const { rows: [held] } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM order_items
        WHERE order_id = $1 AND tenant_id = $2
          AND workflow_status = 'waiting'
          AND COALESCE(is_manual_hold, false) = true`,
      [order_id, tenantId]
    );
    const io = getIO();
    for (const it of items) {
      io?.emit('workflow-status-changed', {
        orderId: order_id, itemId: it.id, workflow_status: 'production', dispatched: true,
      });
      io?.emit('item-released-to-production', {
        orderId: order_id, itemId: it.id, dispatched: true,
      });
    }
    // Pre-allerta: notifico le stazioni del nuovo item visibile (waiting+released)
    for (const it of preallerta) {
      io?.emit('workflow-status-changed', {
        orderId: order_id, itemId: it.id, workflow_status: 'waiting', preallerta: true,
      });
    }
    // JP 2026-06-05: stampa cucina UNA volta quando il Comandista preme
    // INIZIA TAVOLO. Debounce 4s aggrega anche i START successivi del chef
    // nello stesso ticket → niente piu' stampe multiple per lo stesso tavolo.
    if (items.length > 0) {
      try {
        const { scheduleKitchenTicket } = require('./print.controller');
        scheduleKitchenTicket(tenantId, order_id);
      } catch (e) {
        req.log?.warn?.({ err: e.message }, 'kitchen-pass schedule failed (dispatch, non-blocking)');
      }
    }
    res.json({
      dispatched: items.length,
      preallerta: preallerta.length,
      still_waiting: pending?.n || 0,
      manual_hold: held?.n || 0,
      order_id,
    });
  } catch (err) { next(err); }
}

// ── moveOrderTable ───────────────────────────────────────────
// JP 2026-06-06: cliente si sposta da tav X a tav Y (es. cambia gruppo,
// trasferimento per ombrellone diverso). Sposta l'ordine intero senza
// modificare items/totale. Tavolo origine va in 'dirty' (sbarazzo
// successivo), destinazione 'occupied'.
async function moveOrderTable(req, res, next) {
  const client = await pool.connect();
  const tenantId = TENANT(req);
  try {
    const { id: order_id } = req.params;
    const { to_table_id } = req.body || {};
    if (!/^[0-9a-f-]{36}$/i.test(String(to_table_id || ''))) {
      return res.status(400).json({ error: 'to_table_id non valido' });
    }
    await client.query('BEGIN');
    // Lock dell'ordine + del tavolo dest per evitare race (due click).
    const { rows: [order] } = await client.query(
      `SELECT id, table_id, order_type, status, waiter_id
         FROM orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
      [order_id, tenantId]
    );
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ordine non trovato' }); }
    if (order.status !== 'open') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Ordine chiuso, non spostabile' }); }
    if (order.order_type !== 'table') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Solo ordini al tavolo' }); }
    if (order.table_id === to_table_id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Stesso tavolo di origine' }); }
    // Tavolo destinazione: stesso tenant, deve essere libero (oppure dirty
    // → presumiamo che cameriere abbia gia' sbarazzato a mano).
    const { rows: [destTable] } = await client.query(
      `SELECT id, table_number, status FROM tables WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
      [to_table_id, tenantId]
    );
    if (!destTable) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Tavolo destinazione non trovato' }); }
    if (!['free', 'dirty', 'reserved'].includes(destTable.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Tavolo ${destTable.table_number} occupato (${destTable.status}). Scegline un altro.` });
    }
    // Origine
    const { rows: [originTable] } = await client.query(
      `SELECT id, table_number FROM tables WHERE id=$1 AND tenant_id=$2`,
      [order.table_id, tenantId]
    );
    // Update atomico ordine
    await client.query(
      `UPDATE orders SET table_id=$1 WHERE id=$2 AND tenant_id=$3`,
      [to_table_id, order_id, tenantId]
    );
    // Tavolo origine → dirty (lo sbarazza dopo)
    if (order.table_id) {
      await client.query(
        `UPDATE tables SET status='dirty' WHERE id=$1 AND tenant_id=$2`,
        [order.table_id, tenantId]
      );
    }
    // Tavolo destinazione → occupied
    await client.query(
      `UPDATE tables SET status='occupied' WHERE id=$1 AND tenant_id=$2`,
      [to_table_id, tenantId]
    );
    // Audit
    await client.query(
      `INSERT INTO order_audit_log (tenant_id, order_id, action, from_value, to_value, user_id, user_name, metadata)
       VALUES ($1,$2,'order_table_move',$3,$4,$5,$6,$7)`,
      [tenantId, order_id, originTable?.table_number || null, destTable.table_number,
       req.user.id, req.user.name, JSON.stringify({
         from_table_id: order.table_id, to_table_id, role: req.user.role
       })]
    );
    await client.query('COMMIT');
    const io = getIO();
    io?.emit('table-status-changed', { tableId: order.table_id, status: 'dirty', active_order_id: null });
    io?.emit('table-status-changed', { tableId: to_table_id, status: 'occupied', active_order_id: order_id });
    io?.emit('order-table-moved', {
      orderId: order_id,
      fromTableId: order.table_id,
      fromTableNumber: originTable?.table_number || null,
      toTableId: to_table_id,
      toTableNumber: destTable.table_number,
    });
    res.json({
      ok: true,
      order_id,
      from_table: { id: order.table_id, table_number: originTable?.table_number || null },
      to_table:   { id: to_table_id, table_number: destTable.table_number },
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { createOrder, getOrder, getQrPendingOrders, addItems, cancelItem, cancelOrder, transferOrder, claimOrder, setItemPrice, setItemWeight, setItemQuantity, setItemFireAt, dispatchOrder, markAsportoRitirato, markAsportoNoShow, moveOrderTable };
