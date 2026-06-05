const pool = require('../config/db');
const { getIO } = require('../socket');
const { ORDER_ITEM_STATUSES } = require('../config/constants');
const { trackItemServed } = require('../services/performanceTracker');
const pushService = require('../services/pushService');

// Tenant isolation: KDS deve mostrare SOLO ticket della propria cucina.
// Senza filtro, una pizzeria vedrebbe gli ordini di un ristorante diverso.
const TENANT = (req) => req.tenant.id;

async function getPendingOrders(req, res, next) {
  try {
    // Filtro per stazione KDS (stazioni reali Riva).
    // Stazioni: frittura, primi_secondi, antipasti, pizzeria, pasticceria,
    //           cucina (catch-all NULL), all (tutta la cucina non-bar).
    // Bevande sempre escluse (vanno in /bar).
    const stationParam = (req.query.station || 'all').toLowerCase();
    // JP 2026-06-03: 'dispatcher' = vista Comandista (vede SOLO waiting).
    // 'primi' / 'secondi' aggiunti come stazioni separate da primi_secondi.
    const validStations = ['all','cucina','frittura','primi','secondi','primi_secondi','antipasti','pizzeria','pasticceria','crudi','dispatcher'];
    if (!validStations.includes(stationParam)) {
      return res.status(400).json({ error: `station non valido. Valori: ${validStations.join(', ')}` });
    }
    // Effective prep_station per ITEM:
    //   1. menu_items.prep_station se non NULL (override per piatto)
    //   2. altrimenti categories.prep_station
    //   3. altrimenti 'cucina' (catch-all)
    const effectiveStation = `COALESCE(mi.prep_station, c.prep_station, 'cucina')`;
    let stationFilter, params;
    if (stationParam === 'all' || stationParam === 'dispatcher') {
      // 'Tutte' = TUTTA la cucina (pizze incluse). 'dispatcher' (Comandista)
      // vede ANCHE tutte le stazioni, ma filtrate solo waiting (vedi
      // workflowFilter sotto).
      stationFilter = 'TRUE';
      params = [TENANT(req)];
    } else if (stationParam === 'cucina') {
      stationFilter = `${effectiveStation} = 'cucina'`;
      params = [TENANT(req)];
    } else if (stationParam === 'primi' || stationParam === 'secondi' || stationParam === 'primi_secondi') {
      // JP 2026-06-03: il PIN 2003 (sub_role='primi') fa primi + secondi.
      // Quindi station IN ('primi','secondi','primi_secondi') sono tre
      // alias dello stesso tablet: vedono i piatti con override
      // mi.prep_station='primi'/'secondi' E quelli che cadono sul fallback
      // di categoria c.prep_station='primi_secondi' (Cotoletta, Fiorentina,
      // Seppia, ecc. quando l'override è NULL).
      stationFilter = `${effectiveStation} IN ('primi','secondi','primi_secondi')`;
      params = [TENANT(req)];
    } else {
      stationFilter = `${effectiveStation} = $2`;
      params = [TENANT(req), stationParam];
    }
    // Workflow filter:
    //   - dispatcher (7500): SOLO i waiting non ancora "visti" (released_at NULL)
    //   - stazione reale: production + waiting GIA' rilasciati dal Comandista
    //     ma col timer attivo (released_at IS NOT NULL) → pre-allerta countdown
    //   - all (admin): tutto
    // JP 2026-06-03.
    const workflowFilter = stationParam === 'dispatcher'
      ? `(oi.workflow_status = 'waiting' AND oi.released_at IS NULL)`
      : stationParam === 'all'
        ? `oi.workflow_status IN ('waiting','production')`
        : `(oi.workflow_status = 'production'
            OR (oi.workflow_status = 'waiting' AND oi.released_at IS NOT NULL))`;

    const { rows } = await pool.query(
      `SELECT
         o.id             AS order_id,
         o.created_at     AS order_created_at,
         o.order_type,
         o.customer_name  AS order_customer_name,
         o.pickup_time,
         COALESCE(t.table_number, 'ASPORTO') AS table_number,
         COALESCE(z.name, '')                AS zone_name,
         oi.id             AS item_id,
         oi.quantity,
         oi.status         AS item_status,
         -- JP 2026-06-01: gli item ancora non firati (workflow_status='waiting')
         -- forzati a display 'waiting' cosi' la UI li mostra in piccolo/grigio
         -- (preview "in arrivo"), indipendentemente dal display_status reale.
         CASE WHEN oi.workflow_status = 'waiting' THEN 'waiting' ELSE oi.display_status END AS display_status,
         oi.fire_at,
         oi.released_at,
         oi.workflow_status AS workflow_status,
         oi.notes          AS item_notes,
         oi.sent_at,
         oi.combo_menu_name,
         oi.combo_selections,
         COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
         mi.prep_time_mins,
         mi.required_kit                    AS required_kit,
         mi.cooking_modes                   AS cooking_modes,
         COALESCE(mi.requires_preallerta, false) AS requires_preallerta,
         COALESCE(c.course_type, 'altro')   AS course_type,
         COALESCE(mi.prep_station, c.prep_station, 'cucina') AS prep_station,
         COALESCE(
           json_agg(m.name ORDER BY m.name) FILTER (WHERE m.id IS NOT NULL),
           '[]'
         ) AS modifiers
       FROM order_items oi
       JOIN orders o        ON o.id = oi.order_id
       LEFT JOIN tables t   ON t.id = o.table_id
       LEFT JOIN zones z    ON z.id = t.zone_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c  ON c.id = mi.category_id
       LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
       LEFT JOIN modifiers m ON m.id = oim.modifier_id
       WHERE o.status = 'open'
         -- La comanda resta sul KDS finche' NON e' servita: i piatti 'ready'
         -- (pronti al pass) restano visibili in cucina e spariscono solo
         -- quando vengono serviti. Esclude solo served/cancelled.
         -- Storico completo (incluso served/cancelled) in /kds/history.
         AND oi.status NOT IN ('served','cancelled')
         -- JP 2026-06-03: filtro dinamico per stazione (vedi workflowFilter).
         -- dispatcher → waiting only · stazioni → production only · all → entrambi.
         AND ${workflowFilter}
         AND oi.tenant_id = $1
         AND COALESCE(oi.is_surcharge, false) = false
         AND (c.is_beverage IS NULL OR c.is_beverage = false)
         AND ${stationFilter}
       GROUP BY o.id, o.created_at, o.order_type, o.customer_name, o.pickup_time,
                t.table_number, z.name,
                oi.id, oi.quantity, oi.status, oi.display_status, oi.workflow_status, oi.notes, oi.sent_at,
                oi.combo_menu_name, oi.combo_selections,
                mi.name, mi.prep_time_mins, mi.required_kit, mi.cooking_modes, mi.requires_preallerta, mi.prep_station, c.course_type, c.prep_station
       ORDER BY
         CASE oi.display_status WHEN 'active' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END,
         oi.sent_at ASC`,
      params
    );

    // Group by order
    const ordersMap = {};
    for (const row of rows) {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          order_id:          row.order_id,
          order_created_at:  row.order_created_at,
          order_type:        row.order_type,
          order_customer_name: row.order_customer_name,
          pickup_time:       row.pickup_time,
          table_number:      row.table_number,
          zone_name:         row.zone_name,
          items: [],
        };
      }
      ordersMap[row.order_id].items.push({
        id:               row.item_id,
        name:             row.item_name,
        quantity:         row.quantity,
        status:           row.item_status,
        display_status:   row.display_status,
        workflow_status:  row.workflow_status,
        fire_at:          row.fire_at, // timer auto-fire (per voci in attesa)
        released_at:      row.released_at, // NULL = pre-dispatch (7500), set = visto dal Comandista
        course_type:      row.course_type,
        prep_station:     row.prep_station,
        required_kit:     row.required_kit,  // JSONB array di stringhe o null
        cooking_modes:    row.cooking_modes, // JSONB { default, per_kg, standby_min, ... } o null
        requires_preallerta: row.requires_preallerta, // crudi: sicurezza alimentare
        notes:            row.item_notes,
        sent_at:          row.sent_at,
        prep_time_mins:   row.prep_time_mins,
        modifiers:        row.modifiers,
        combo_selections: row.combo_selections,
        is_combo:         !!row.combo_menu_name,
      });
    }
    res.json(Object.values(ordersMap));
  } catch (err) { next(err); }
}

async function updateItemStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const tenantId = TENANT(req);

    // 'oven_done' = fase intermedia pizza (sfornata, in attesa di finitura).
    // Non viene mai notificato al cameriere — solo internamente al pizzaiolo.
    const validStatuses = ['cooking', 'oven_done', 'ready', 'served', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status non valido. Valori: ${validStatuses.join(', ')}` });
    }

    const { rows: [item] } = await pool.query(
      `UPDATE order_items SET
         status    = $1::varchar,
         ready_at  = CASE WHEN $1::varchar = 'ready'  AND ready_at  IS NULL THEN NOW() ELSE ready_at  END,
         served_at = CASE WHEN $1::varchar = 'served' AND served_at IS NULL THEN NOW() ELSE served_at END
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, id, tenantId]
    );
    if (!item) return res.status(404).json({ error: 'Item non trovato' });

    getIO()?.emit('item-status-updated', {
      orderId: item.order_id,
      itemId: id,
      status,
    });

    if (status === 'served') {
      await pool.query(
        'DELETE FROM service_alerts WHERE order_item_id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      getIO()?.emit('item-served', { orderId: item.order_id, itemId: id });
      const { rows: [orderInfo] } = await pool.query(
        'SELECT waiter_id FROM orders WHERE id = $1 AND tenant_id = $2',
        [item.order_id, tenantId]
      );
      if (orderInfo) {
        trackItemServed(tenantId, orderInfo.waiter_id, item.ready_at, item.served_at);
      }

      // Avanzamento ciclo portate: se TUTTI gli items dello stesso course_type
      // di QUESTO ordine sono served/cancelled, marca la portata come "appena
      // servita" sul tavolo → serviceTimer avvia il 20min per la prossima.
      try {
        const { rows: [courseInfo] } = await pool.query(
          `SELECT
             COALESCE(c.course_type, 'altro') AS course_type,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE oi.status IN ('served','cancelled')) AS done
           FROM order_items oi
           LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
           LEFT JOIN categories c  ON c.id = mi.category_id
           WHERE oi.order_id = $1 AND oi.tenant_id = $2
             AND oi.status != 'cancelled'
             AND COALESCE(c.course_type, 'altro') = (
               SELECT COALESCE(c2.course_type, 'altro')
                 FROM order_items oi2
                 LEFT JOIN menu_items mi2 ON mi2.id = oi2.menu_item_id
                 LEFT JOIN categories c2  ON c2.id = mi2.category_id
                WHERE oi2.id = $3
             )
           GROUP BY COALESCE(c.course_type, 'altro')`,
          [item.order_id, tenantId, id]
        );
        if (courseInfo && Number(courseInfo.total) === Number(courseInfo.done)) {
          // Tutta la portata e' servita → aggiorna tavolo
          const { rows: [ord] } = await pool.query(
            'SELECT table_id FROM orders WHERE id = $1 AND tenant_id = $2',
            [item.order_id, tenantId]
          );
          if (ord?.table_id) {
            // last_course_served_at: usato SOLO per il promemoria conto dopo il
            // dolce. Il timer della portata successiva parte invece da quando la
            // portata e' PRONTA (last_course_ready_at, impostato nel ramo ready).
            await pool.query(
              `UPDATE tables
                  SET last_course_served_at = NOW()
                WHERE id = $1 AND tenant_id = $2`,
              [ord.table_id, tenantId]
            );
            getIO()?.emit('course-served', {
              tableId: ord.table_id,
              orderId: item.order_id,
              courseType: courseInfo.course_type,
            });
          }
        }
      } catch (e) { /* non blocca il servito */ }
    }

    // JP 2026-06-05: auto-stampa ticket cucina su START (status='cooking').
    // Appena il chef preme START → esce mini ticket TAV X + nome piatto in
    // cucina (.23). Il chef lo attacca al piatto, niente confusione tra
    // tavoli. (item.status e' gia' il nuovo dopo UPDATE RETURNING *, quindi
    // niente guard "!= cooking" — accettiamo doppia stampa se il chef tappa
    // due volte: meglio una in piu' che una in meno.)
    if (status === 'cooking') {
      try {
        const { rows: [info] } = await pool.query(
          `SELECT COALESCE(t.table_number, 'ASPORTO') AS table_number,
                  COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS item_name,
                  oi.quantity
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             LEFT JOIN tables t ON t.id = o.table_id
             LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
            WHERE oi.id = $1 AND oi.tenant_id = $2`,
          [id, tenantId]
        );
        if (info) {
          const { enqueueKitchenPassJob } = require('./print.controller');
          enqueueKitchenPassJob(tenantId, item.order_id, id, {
            table_number: String(info.table_number),
            item_name: String(info.item_name),
            quantity: Number(info.quantity || 1),
          });
        }
      } catch (e) {
        req.log?.warn?.({ err: e.message }, 'kitchen-pass enqueue failed (non-blocking)');
      }
    }

    if (status === 'ready') {
      const { rows: [info] } = await pool.query(
        `SELECT o.waiter_id,
                COALESCE(t.table_number, 'ASPORTO') AS table_number,
                COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS item_name,
                oi.quantity
           FROM order_items oi
           JOIN orders o       ON o.id = oi.order_id
           LEFT JOIN tables t  ON t.id = o.table_id
           LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
          WHERE oi.id = $1 AND oi.tenant_id = $2`,
        [id, tenantId]
      );
      if (info) {
        // JP 2026-06-02: l'evento "piatto pronto" ora va a TUTTI i camerieri
        // + admin/manager (non solo al cameriere assegnato all'ordine). Cosi'
        // Marco vede sempre i piatti pronti anche se l'ordine non e' suo.
        const io = getIO();
        io?.to('role:waiter').to('role:admin').to('role:manager').emit('item-ready-notify', {
          orderId: item.order_id,
          itemId: id,
          itemName: info.item_name,
          quantity: info.quantity,
          tableNumber: info.table_number,
          waiterId: info.waiter_id, // chi tiene il tavolo (info utile)
        });
        // Web Push: anche se l'app del cameriere e' chiusa, riceve push.
        // tag = orderId per non duplicare alert sullo stesso ordine.
        // ACTION BUTTON "✓ Servito": il cameriere conferma dall'orologio
        // senza aprire il telefono. Il token firmato encoda l'azione.
        const servedToken = pushService.signActionToken({
          userId: info.waiter_id, tenantId, orderId: item.order_id,
          itemIds: [id], action: 'served',
        });
        pushService.sendToUser(info.waiter_id, {
          title: `🍽️ Tavolo ${info.table_number} — Pronto`,
          body: `${info.quantity}× ${info.item_name}`,
          tag: `ready-${item.order_id}`,
          url: `/order/${item.order_id}`,
          vibrate: [200, 100, 200],
          requireInteraction: true,
          actions: [{ action: 'served', title: '✓ Servito' }],
          actionToken: servedToken,
        }).catch(() => {});
      }

      // ─── "10 qui = 10 là" coerenza pass ──────────────────────────
      // Quando un item diventa ready, verifico se TUTTI gli items dello
      // stesso course di QUELL'ordine sono pronti. Se sì → emette
      // 'course-ready-pass' al waiter + al pass cucina, cosi' il cameriere
      // sa che puo' portare tutto il course insieme (no piatti freddi).
      const { rows: course } = await pool.query(
        `SELECT
           COALESCE(c.course_type, 'altro') AS course_type,
           COUNT(*)                          AS total,
           COUNT(*) FILTER (
             WHERE oi.status IN ('ready','served')
           )                                 AS ready_count
         FROM order_items oi
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
         LEFT JOIN categories c  ON c.id = mi.category_id
         WHERE oi.order_id = $1 AND oi.tenant_id = $2
           AND oi.status != 'cancelled'
           AND COALESCE(c.course_type, 'altro') = (
             SELECT COALESCE(c2.course_type, 'altro')
               FROM order_items oi2
               LEFT JOIN menu_items mi2 ON mi2.id = oi2.menu_item_id
               LEFT JOIN categories c2  ON c2.id = mi2.category_id
              WHERE oi2.id = $3
           )
         GROUP BY COALESCE(c.course_type, 'altro')`,
        [item.order_id, tenantId, id]
      );
      const c0 = course[0];
      if (c0 && Number(c0.total) === Number(c0.ready_count) && Number(c0.total) >= 1 && info) {
        // Tutti gli items del course sono pronti → segnala coerenza pass.
        getIO()?.to(`user:${info.waiter_id}`).to('role:admin').to('role:manager').emit('course-ready-pass', {
          orderId: item.order_id,
          tableNumber: info.table_number,
          courseType: c0.course_type,
          itemsCount: Number(c0.total),
        });
        pushService.sendToUser(info.waiter_id, {
          title: `✅ Tavolo ${info.table_number} — ${c0.course_type} pronto`,
          body: `Tutti i ${c0.total} pezzi del ${c0.course_type} sono al pass. Servi insieme!`,
          tag: `course-ready-${item.order_id}-${c0.course_type}`,
          url: `/order/${item.order_id}`,
          vibrate: [400, 100, 200, 100, 200],
          requireInteraction: true,
        }).catch(() => {});

        // Ciclo portate: la portata e' PRONTA al pass (consegna al cameriere).
        // Da QUI partono i 20 min per la portata successiva — non dal servito
        // al tavolo, non dalla comanda. Solo per le portate della sequenza.
        if (['antipasto', 'primo', 'secondo', 'dolce'].includes(c0.course_type)) {
          await pool.query(
            `UPDATE tables
                SET current_course = $1, last_course_ready_at = NOW()
              WHERE id = (SELECT table_id FROM orders WHERE id = $2 AND tenant_id = $3)
                AND tenant_id = $3`,
            [c0.course_type, item.order_id, tenantId]
          ).catch(() => {});
        }
      }
    }

    res.json(item);
  } catch (err) { next(err); }
}

/**
 * getHistory — storico items KDS (tutto cio' che e' passato dalla coda,
 * incluso ready/served/cancelled). Usato per la pagina "Storico" del KDS.
 *
 * Query params:
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD  default oggi
 *   ?station=cucina|pizzeria|crudi|pasticceria|bar  default tutto
 *   ?status=ready|served|cancelled|all  default all
 *
 * Ritorna max 500 item, ordinati per sent_at DESC.
 */
async function getHistory(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const today = new Date().toISOString().slice(0, 10);
    const from = req.query.from || today;
    const to   = req.query.to   || today;
    const station = (req.query.station || 'all').toLowerCase();
    const statusFilter = (req.query.status || 'all').toLowerCase();

    const VALID_STATIONS = ['all','cucina','frittura','primi_secondi','antipasti','pizzeria','pasticceria','crudi','bar'];
    const VALID_STATUS   = ['all','pending','cooking','oven_done','ready','served','cancelled'];
    if (!VALID_STATIONS.includes(station)) return res.status(400).json({ error: 'station invalido' });
    if (!VALID_STATUS.includes(statusFilter)) return res.status(400).json({ error: 'status invalido' });

    const params = [tenantId, from, to];
    let where = `oi.tenant_id = $1
                 AND COALESCE(oi.is_surcharge, false) = false
                 AND DATE(oi.sent_at AT TIME ZONE 'Europe/Rome') BETWEEN $2 AND $3`;

    if (station === 'bar') {
      where += ' AND c.is_beverage = true';
    } else if (station !== 'all') {
      where += ' AND (c.is_beverage IS NULL OR c.is_beverage = false)';
      if (station === 'cucina') {
        where += ` AND COALESCE(mi.prep_station, c.prep_station, 'cucina') = 'cucina'`;
      } else {
        params.push(station);
        where += ` AND COALESCE(mi.prep_station, c.prep_station, 'cucina') = $${params.length}`;
      }
    }
    if (statusFilter !== 'all') {
      params.push(statusFilter);
      where += ` AND oi.status = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT
         oi.id, oi.quantity, oi.status, oi.notes,
         oi.sent_at, oi.ready_at, oi.served_at,
         COALESCE(mi.name, oi.combo_menu_name, 'Item') AS item_name,
         c.name AS category,
         COALESCE(mi.prep_station, c.prep_station, 'cucina') AS prep_station,
         c.is_beverage,
         o.id AS order_id,
         COALESCE(t.table_number, 'ASPORTO') AS table_number,
         u.name AS waiter_name,
         -- Durata cottura (sent → ready) in minuti
         CASE WHEN oi.ready_at IS NOT NULL
              THEN ROUND(EXTRACT(EPOCH FROM (oi.ready_at - oi.sent_at))/60.0, 1)
         END AS prep_minutes,
         -- Durata pass (ready → served) in minuti
         CASE WHEN oi.served_at IS NOT NULL AND oi.ready_at IS NOT NULL
              THEN ROUND(EXTRACT(EPOCH FROM (oi.served_at - oi.ready_at))/60.0, 1)
         END AS pass_minutes
       FROM order_items oi
       JOIN orders o          ON o.id = oi.order_id
       LEFT JOIN tables t     ON t.id = o.table_id
       LEFT JOIN users u      ON u.id = o.waiter_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c  ON c.id = mi.category_id
       WHERE ${where}
       ORDER BY oi.sent_at DESC
       LIMIT 500`,
      params
    );

    // Aggregati: totali per status + per stazione
    const { rows: [agg] } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE oi.status = 'served')::int AS served,
         COUNT(*) FILTER (WHERE oi.status = 'cancelled')::int AS cancelled,
         COALESCE(AVG(EXTRACT(EPOCH FROM (oi.ready_at - oi.sent_at))/60.0)
                  FILTER (WHERE oi.ready_at IS NOT NULL), 0)::numeric(10,1) AS avg_prep_min
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c  ON c.id = mi.category_id
       WHERE ${where}`,
      params
    );

    res.json({
      periodo: { from, to },
      filtro: { station, status: statusFilter },
      aggregati: agg,
      items: rows,
    });
  } catch (err) { next(err); }
}

/**
 * getAbbinaGroups — Sprint 5: gruppi di items duplicati attivi nel KDS.
 *
 * L'algoritmo: trova items DIVERSI (oi.id) di STESSO menu_item_id, in
 * stato pending/cooking/oven_done (= attivi in cucina), nello stesso
 * tenant + stazione richiesta.
 *
 * Restituisce gruppi con >= 2 items: il pizzaiolo/cuoco li puo' cucinare
 * insieme ("cuoci 4 Margherite contemporaneamente"). Plus al confirm
 * batch porta tutti gli items a cooking insieme.
 *
 * Query params: ?station=cucina|pizzeria|crudi|pasticceria (default cucina)
 *
 * Risposta: [{ menu_item_id, item_name, total_quantity, items: [{ id, quantity, status, table_number, order_id, sent_at }] }]
 */
async function getAbbinaGroups(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const station = (req.query.station || 'all').toLowerCase();
    const VALID = ['all','cucina','frittura','primi_secondi','antipasti','pizzeria','pasticceria','crudi'];
    if (!VALID.includes(station)) return res.status(400).json({ error: 'station invalido' });

    let stationFilter, params;
    if (station === 'all') {
      // 'Tutte' include la pizzeria (tutto arriva in cucina).
      stationFilter = 'TRUE';
      params = [tenantId];
    } else if (station === 'cucina') {
      stationFilter = `COALESCE(mi.prep_station, c.prep_station, 'cucina') = 'cucina'`;
      params = [tenantId];
    } else {
      stationFilter = `COALESCE(mi.prep_station, c.prep_station, 'cucina') = $2`;
      params = [tenantId, station];
    }

    const { rows } = await pool.query(
      `WITH active_items AS (
         SELECT
           oi.id, oi.menu_item_id, oi.quantity, oi.status, oi.sent_at,
           oi.order_id,
           COALESCE(mi.name, 'Item') AS item_name,
           COALESCE(t.table_number, 'ASPORTO') AS table_number
         FROM order_items oi
         JOIN orders o          ON o.id = oi.order_id
         LEFT JOIN tables t     ON t.id = o.table_id
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
         LEFT JOIN categories c  ON c.id = mi.category_id
         WHERE o.status = 'open'
           AND oi.status IN ('pending','cooking','oven_done')
           AND oi.workflow_status = 'production'
           AND oi.tenant_id = $1
           AND oi.menu_item_id IS NOT NULL
           AND (c.is_beverage IS NULL OR c.is_beverage = false)
           AND ${stationFilter}
       )
       SELECT
         menu_item_id,
         item_name,
         SUM(quantity)::int AS total_quantity,
         COUNT(*)::int AS num_orders,
         jsonb_agg(jsonb_build_object(
           'id', id, 'quantity', quantity, 'status', status,
           'order_id', order_id, 'table_number', table_number,
           'sent_at', sent_at
         ) ORDER BY sent_at) AS items
       FROM active_items
       GROUP BY menu_item_id, item_name
       HAVING COUNT(*) >= 2
       ORDER BY total_quantity DESC, item_name`,
      params
    );

    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * batchUpdateStatus — Sprint 5: porta N items allo stesso status atomically.
 * Usato dopo "Abbina" → click "Inizia tutti" → 4 Margherite passano a cooking
 * insieme.
 *
 * Body: { item_ids: [uuid, ...], status: 'cooking'|'oven_done'|'ready' }
 */
async function batchUpdateStatus(req, res, next) {
  try {
    const { item_ids, status } = req.body || {};
    const tenantId = TENANT(req);

    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ error: 'item_ids array obbligatorio' });
    }
    if (item_ids.length > 50) {
      return res.status(400).json({ error: 'Max 50 items per batch' });
    }
    const valid = ['cooking','oven_done','ready','served','cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Status non valido. Valori: ${valid.join(', ')}` });
    }

    const { rows } = await pool.query(
      `UPDATE order_items SET
         status   = $1::varchar,
         ready_at = CASE WHEN $1::varchar = 'ready'  AND ready_at  IS NULL THEN NOW() ELSE ready_at  END,
         served_at = CASE WHEN $1::varchar = 'served' AND served_at IS NULL THEN NOW() ELSE served_at END
       WHERE id = ANY($2::uuid[]) AND tenant_id = $3
       RETURNING id, order_id, status`,
      [status, item_ids, tenantId]
    );

    // JP 2026-06-05: stampa ticket cucina su START batch (es. chip TOTALI
    // "DA FARE ×4" cliccato dal chef). Un ticket per ogni item del batch.
    if (status === 'cooking' && rows.length > 0) {
      try {
        const { rows: infos } = await pool.query(
          `SELECT oi.id, oi.order_id, oi.quantity,
                  COALESCE(t.table_number, 'ASPORTO') AS table_number,
                  COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS item_name
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             LEFT JOIN tables t ON t.id = o.table_id
             LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
            WHERE oi.id = ANY($1::uuid[]) AND oi.tenant_id = $2`,
          [rows.map(r => r.id), tenantId]
        );
        const { enqueueKitchenPassJob } = require('./print.controller');
        for (const it of infos) {
          enqueueKitchenPassJob(tenantId, it.order_id, it.id, {
            table_number: String(it.table_number),
            item_name: String(it.item_name),
            quantity: Number(it.quantity || 1),
          });
        }
      } catch (e) {
        req.log?.warn?.({ err: e.message }, 'kitchen-pass batch enqueue failed');
      }
    }

    // Socket: emette UN evento batch per i clients
    getIO()?.emit('items-batch-updated', {
      itemIds: rows.map(r => r.id),
      orderIds: [...new Set(rows.map(r => r.order_id))],
      status,
      count: rows.length,
    });

    res.json({ updated: rows.length, items: rows });
  } catch (err) { next(err); }
}

module.exports = { getPendingOrders, updateItemStatus, getHistory, getAbbinaGroups, batchUpdateStatus };
