const pool = require('../config/db');
const { getIO } = require('../socket');
const { trackAlertReceived, trackEscalation } = require('./performanceTracker');
const pushService = require('./pushService');
const logger = require('../lib/logger').child({ component: 'serviceTimer' });

const INTERVAL_MS = 30_000; // controlla ogni 30 secondi

// Soglie in MINUTI per emettere alert "item ready non servito".
// waiter   = primario (cameriere assegnato)
// delegate = sub_role responder, dopo 3 min se primario non risponde
// manager  = escalation finale, admin/manager (Sprint 10 catena)
const THRESHOLDS = {
  food:     { waiter: 3, delegate: 6, manager: 9 },
  beverage: { waiter: 3, delegate: 6, manager: 9 },
};

let timer = null;

// ─── Tenant iteration helper ─────────────────────────────────
// Il service timer e' un background worker che NON ha req.tenant.id.
// Prima di attivare RLS Postgres, deve iterare esplicitamente sui
// tenant attivi e processarli uno per uno. Cosi' una volta attiva RLS,
// le policy filtreranno automaticamente in base al SET LOCAL.
async function forEachActiveTenant(fn) {
  const { rows: tenants } = await pool.query(
    'SELECT id FROM tenants WHERE is_active = true'
  );
  for (const t of tenants) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [t.id]);
      await fn(client, t.id);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error({ err, tenantId: t.id }, 'tenant tick error');
    } finally {
      client.release();
    }
  }
}

// ─── Inserisci alert (tenant-aware) ──────────────────────────
// JP 2026-06-09: passa anche waiter_name/item_name/table_number/order_id
// cosi' il bell admin mostra info leggibili (prima erano NULL → alert orfani
// che contavano nel badge ma senza testo).
async function tryInsertAlert(client, tenantId, orderItemId, alertType, targetUserId, meta = {}) {
  const { waiter_name = null, item_name = null, table_number = null, order_id = null } = meta;
  const { rows } = await client.query(
    `INSERT INTO service_alerts
       (tenant_id, order_item_id, alert_type, target_user_id,
        waiter_name, item_name, table_number, order_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (order_item_id, alert_type) DO NOTHING
     RETURNING *`,
    [tenantId, orderItemId, alertType, targetUserId,
     waiter_name, item_name, table_number, order_id]
  );
  return rows[0] || null;
}

// ─── Check ready items per un singolo tenant ─────────────────
async function checkReadyItemsForTenant(client, tenantId) {
  const { rows } = await client.query(`
    SELECT
      oi.id           AS item_id,
      oi.order_id,
      oi.ready_at,
      oi.quantity,
      o.waiter_id,
      COALESCE(t.table_number, 'ASPORTO') AS table_number,
      COALESCE(z.name, '')                AS zone_name,
      COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS item_name,
      COALESCE(c.is_beverage, false)      AS is_beverage,
      u.name                              AS waiter_name
    FROM order_items oi
    JOIN orders o        ON o.id = oi.order_id
    LEFT JOIN tables t   ON t.id = o.table_id
    LEFT JOIN zones z    ON z.id = t.zone_id
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN categories c  ON c.id = mi.category_id
    LEFT JOIN users u       ON u.id = o.waiter_id
    WHERE oi.status = 'ready'
      AND oi.served_at IS NULL
      AND oi.ready_at IS NOT NULL
      AND o.status = 'open'
      AND oi.tenant_id = $1
  `, [tenantId]);

  const io = getIO();
  if (!io || rows.length === 0) return;

  for (const row of rows) {
    const elapsedMs = Date.now() - new Date(row.ready_at).getTime();
    const elapsedMin = elapsedMs / 60_000;
    const thresholds = row.is_beverage ? THRESHOLDS.beverage : THRESHOLDS.food;

    // Alert cameriere
    if (elapsedMin >= thresholds.waiter) {
      const alertType = row.is_beverage ? 'beverage_alert' : 'waiter_20min';
      const inserted = await tryInsertAlert(client, tenantId, row.item_id, alertType, row.waiter_id, { waiter_name: row.waiter_name, item_name: row.item_name, table_number: row.table_number, order_id: row.order_id });

      if (inserted) {
        io.to(`user:${row.waiter_id}`).emit('service-alert', {
          alertId: inserted.id,
          orderId: row.order_id,
          itemId: row.item_id,
          itemName: row.item_name,
          quantity: row.quantity,
          tableNumber: row.table_number,
          zoneName: row.zone_name,
          elapsedMinutes: Math.round(elapsedMin),
          isBeverage: row.is_beverage,
        });
        // Push native (anche se l'app e' chiusa)
        const emoji = row.is_beverage ? '🍷' : '⏰';
        pushService.sendToUser(row.waiter_id, {
          title: `${emoji} Tavolo ${row.table_number} — ${Math.round(elapsedMin)}min`,
          body: `${row.quantity}× ${row.item_name} in attesa di servizio!`,
          tag: `alert-${row.item_id}`,
          url: '/tables',
          vibrate: [300, 100, 300, 100, 300],
          requireInteraction: true,
        }).catch(() => {});
        trackAlertReceived(tenantId, row.waiter_id);
      } else {
        await maybeResendAlert(client, tenantId, io, row, alertType, elapsedMin);
      }
    }

    // Sprint 10: Delegate step (catena failover prima del manager)
    if (elapsedMin >= thresholds.delegate) {
      const inserted = await tryInsertAlert(client, tenantId, row.item_id, "delegate_alert", null, { waiter_name: row.waiter_name, item_name: row.item_name, table_number: row.table_number, order_id: row.order_id });
      if (inserted) {
        // Notifica al delegato del cameriere primario, se configurato
        const { rows: [waiter] } = await client.query(
          'SELECT alert_delegate_id FROM users WHERE id = $1 AND tenant_id = $2',
          [row.waiter_id, tenantId]
        );
        if (waiter?.alert_delegate_id) {
          io.to(`user:${waiter.alert_delegate_id}`).emit('service-delegate-alert', {
            alertId: inserted.id,
            orderId: row.order_id, itemId: row.item_id,
            itemName: row.item_name, quantity: row.quantity,
            tableNumber: row.table_number, zoneName: row.zone_name,
            elapsedMinutes: Math.round(elapsedMin),
            primaryWaiterName: row.waiter_name,
          });
          pushService.sendToUser(waiter.alert_delegate_id, {
            title: `🔔 DELEGATO — Tavolo ${row.table_number}`,
            body: `${row.waiter_name} non ha servito ${row.item_name} (${Math.round(elapsedMin)}min). Subentri tu.`,
            tag: `delegate-${row.item_id}`,
            url: '/tables',
            vibrate: [400, 100, 400],
            requireInteraction: true,
          }).catch(() => {});
        }
      }
    }

    // Escalation
    if (elapsedMin >= thresholds.manager) {
      const inserted = await tryInsertAlert(client, tenantId, row.item_id, "manager_25min", null, { waiter_name: row.waiter_name, item_name: row.item_name, table_number: row.table_number, order_id: row.order_id });

      if (inserted) {
        io.to('role:admin').to('role:manager').emit('service-escalation', {
          alertId: inserted.id,
          orderId: row.order_id,
          itemId: row.item_id,
          itemName: row.item_name,
          quantity: row.quantity,
          tableNumber: row.table_number,
          zoneName: row.zone_name,
          waiterName: row.waiter_name,
          elapsedMinutes: Math.round(elapsedMin),
          isBeverage: row.is_beverage,
        });
        // Push escalation a tutti admin/manager attivi del tenant
        pushService.sendToRole(tenantId, ['admin','manager'], {
          title: `🚨 Tavolo ${row.table_number} — ESCALATION`,
          body: `${row.waiter_name} non ha servito ${row.item_name} (${Math.round(elapsedMin)}min)`,
          tag: `escalation-${row.item_id}`,
          url: '/admin-home',
          vibrate: [500, 200, 500],
          requireInteraction: true,
        }).catch(() => {});
        trackEscalation(tenantId, row.waiter_id);
      }
    }
  }
}

async function maybeResendAlert(client, tenantId, io, row, alertType, elapsedMin) {
  const { rows } = await client.query(
    `SELECT id, postponed_until, acknowledged
     FROM service_alerts
     WHERE order_item_id = $1 AND alert_type = $2 AND tenant_id = $3`,
    [row.item_id, alertType, tenantId]
  );
  const alert = rows[0];
  if (!alert || alert.acknowledged) return;

  if (alert.postponed_until && new Date(alert.postponed_until) <= new Date()) {
    await client.query(
      'UPDATE service_alerts SET postponed_until = NULL WHERE id = $1 AND tenant_id = $2',
      [alert.id, tenantId]
    );
    io.to(`user:${row.waiter_id}`).emit('service-alert', {
      alertId: alert.id,
      orderId: row.order_id,
      itemId: row.item_id,
      itemName: row.item_name,
      quantity: row.quantity,
      tableNumber: row.table_number,
      zoneName: row.zone_name,
      elapsedMinutes: Math.round(elapsedMin),
      isBeverage: row.is_beverage,
    });
  }
}

// ─── Check mandatory alerts per un singolo tenant ────────────
async function checkMandatoryAlertsForTenant(client, tenantId) {
  // JP 2026-06-03: se il tenant ha il Comandista attivo (requires_dispatch),
  // gli items waiting sono di sua competenza — niente alert al cameriere.
  const { rows: [tcfg] } = await client.query(
    'SELECT COALESCE(requires_dispatch,false) AS requires_dispatch FROM tenants WHERE id=$1',
    [tenantId]
  );
  if (tcfg?.requires_dispatch) return;
  const { rows } = await client.query(`
    SELECT
      oi.id AS item_id, oi.order_id, oi.quantity, oi.inserted_at,
      COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS item_name,
      COALESCE(c.course_type, 'altro') AS course_type,
      COALESCE(c.is_beverage, false) AS is_beverage,
      o.waiter_id,
      COALESCE(t.table_number, 'ASPORTO') AS table_number,
      COALESCE(z.name, '') AS zone_name,
      u.name AS waiter_name,
      EXISTS (
        SELECT 1 FROM order_items oi2
        WHERE oi2.order_id = oi.order_id
          AND oi2.status = 'served'
          AND oi2.id != oi.id
          AND oi2.tenant_id = $1
      ) AS has_served_items
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN tables t ON t.id = o.table_id
    LEFT JOIN zones z ON z.id = t.zone_id
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN categories c ON c.id = mi.category_id
    LEFT JOIN users u ON u.id = o.waiter_id
    WHERE oi.workflow_status = 'waiting'
      AND oi.status NOT IN ('served', 'cancelled')
      AND o.status = 'open'
      AND oi.tenant_id = $1
  `, [tenantId]);

  const io = getIO();
  if (!io || rows.length === 0) return;

  for (const row of rows) {
    if (!row.has_served_items) continue;

    const inserted = await tryInsertAlert(client, tenantId, row.item_id, "course_next", row.waiter_id, { waiter_name: row.waiter_name, item_name: row.item_name, table_number: row.table_number, order_id: row.order_id });

    if (inserted) {
      await client.query(
        'UPDATE service_alerts SET table_number=$1, waiter_name=$2, item_name=$3, is_mandatory=true WHERE id=$4 AND tenant_id=$5',
        [row.table_number, row.waiter_name, row.item_name, inserted.id, tenantId]
      );

      io.to(`user:${row.waiter_id}`).emit('mandatory-course-alert', {
        alertId: inserted.id,
        orderId: row.order_id,
        itemId: row.item_id,
        itemName: row.item_name,
        quantity: row.quantity,
        tableNumber: row.table_number,
        zoneName: row.zone_name,
        courseType: row.course_type,
        isMandatory: true,
      });
    } else {
      await maybeResendMandatoryAlert(client, tenantId, io, row);
    }
  }
}

async function maybeResendMandatoryAlert(client, tenantId, io, row) {
  const { rows } = await client.query(
    `SELECT id, postponed_until, acknowledged
     FROM service_alerts
     WHERE order_item_id = $1 AND alert_type = 'course_next' AND tenant_id = $2`,
    [row.item_id, tenantId]
  );
  const alert = rows[0];
  if (!alert || alert.acknowledged) return;

  if (alert.postponed_until && new Date(alert.postponed_until) <= new Date()) {
    await client.query(
      'UPDATE service_alerts SET postponed_until = NULL WHERE id = $1 AND tenant_id = $2',
      [alert.id, tenantId]
    );
    io.to(`user:${row.waiter_id}`).emit('mandatory-course-alert', {
      alertId: alert.id,
      orderId: row.order_id,
      itemId: row.item_id,
      itemName: row.item_name,
      quantity: row.quantity,
      tableNumber: row.table_number,
      zoneName: row.zone_name,
      courseType: row.course_type,
      isMandatory: true,
    });
  }
}

// ─── Cascade timers per un singolo tenant ────────────────────
async function checkCascadeTimersForTenant(client, tenantId) {
  const { rows } = await client.query(`
    SELECT csl.order_id, csl.course_type AS served_course, csl.served_at,
           ctc.to_course, ctc.minutes, ctc.pre_alert_mins,
           o.waiter_id,
           COALESCE(t.table_number, 'ASPORTO') AS table_number,
           u.name AS waiter_name
    FROM course_served_log csl
    JOIN course_timing_config ctc ON ctc.from_course = csl.course_type AND ctc.tenant_id = csl.tenant_id
    JOIN orders o ON o.id = csl.order_id
    LEFT JOIN tables t ON t.id = o.table_id
    LEFT JOIN users u ON u.id = o.waiter_id
    WHERE o.status = 'open'
      AND csl.tenant_id = $1
      AND EXISTS (
        SELECT 1 FROM order_items oi
        JOIN menu_items mi ON mi.id = oi.menu_item_id
        JOIN categories c ON c.id = mi.category_id
        WHERE oi.order_id = csl.order_id
          AND c.course_type = ctc.to_course
          AND oi.workflow_status = 'waiting'
          AND oi.tenant_id = $1
      )
  `, [tenantId]);

  const io = getIO();
  if (!io || rows.length === 0) return;

  for (const row of rows) {
    const elapsedMs = Date.now() - new Date(row.served_at).getTime();
    const elapsedMin = elapsedMs / 60_000;
    const targetMin = row.minutes;
    const preAlertMin = targetMin - row.pre_alert_mins;

    if (elapsedMin >= preAlertMin && elapsedMin < targetMin) {
      io.to(`user:${row.waiter_id}`).emit('course-pre-alert', {
        orderId: row.order_id,
        tableNumber: row.table_number,
        nextCourse: row.to_course,
        inMinutes: Math.round(targetMin - elapsedMin),
      });
    }

    if (elapsedMin >= targetMin) {
      io.to(`user:${row.waiter_id}`).emit('course-send-alert', {
        orderId: row.order_id,
        tableNumber: row.table_number,
        courseType: row.to_course,
        elapsedMinutes: Math.round(elapsedMin),
        targetMinutes: targetMin,
      });
    }

    if (elapsedMin >= targetMin + 5) {
      io.to(`user:${row.waiter_id}`).emit('course-delay-alert', {
        orderId: row.order_id,
        tableNumber: row.table_number,
        courseType: row.to_course,
        delayMinutes: Math.round(elapsedMin - targetMin),
      });
      if (elapsedMin >= targetMin + 10) {
        io.to('role:admin').to('role:manager').emit('service-escalation', {
          orderId: row.order_id,
          tableNumber: row.table_number,
          itemName: `Portata ${row.to_course}`,
          waiterName: row.waiter_name,
          elapsedMinutes: Math.round(elapsedMin),
        });
      }
    }
  }
}

// ─── Ciclo timer sala (Sprint 4) ────────────────────────────────
// Soglie configurabili (in minuti). Documentate nel piano operativo Riva.
const SEATING_ALERT_MINUTES = 10;  // seated > 10min senza ordine
const COURSE_CYCLE_MINUTES  = 20;  // tra portate, da PRONTO al pass (antipasto→primo→secondo→dolce)
const CHECK_EMISSION_MINUTES = 10; // dopo dolce, conto entro 10min

// Sequenza standard portate. Quando la portata X e' servita, dopo
// COURSE_CYCLE_MINUTES senza items della successiva → alert.
const COURSE_SEQUENCE = ['antipasto','primo','secondo','dolce'];
const NEXT_COURSE = COURSE_SEQUENCE.reduce((acc, c, i) => {
  acc[c] = COURSE_SEQUENCE[i + 1] || 'check';
  return acc;
}, {});

async function checkSeatingTimersForTenant(client, tenantId) {
  // Tavoli 'seated' (accomodati ma senza ordine) da > 10min
  const { rows: seated } = await client.query(`
    SELECT
      t.id AS table_id, t.table_number, t.seated_at,
      EXTRACT(EPOCH FROM (NOW() - t.seated_at))/60 AS minutes_seated
    FROM tables t
    WHERE t.tenant_id = $1
      AND t.status = 'seated'
      AND t.seated_at IS NOT NULL
      AND t.seated_at < NOW() - ($2 || ' minutes')::INTERVAL
  `, [tenantId, SEATING_ALERT_MINUTES]);

  const io = getIO();
  for (const r of seated) {
    io?.to('role:admin').to('role:manager').emit('seating-comanda-alert', {
      tenantId,
      tableId: r.table_id,
      tableNumber: r.table_number,
      minutesSeated: Math.round(r.minutes_seated),
    });
    pushService.sendToRole(tenantId, ['admin','manager'], {
      title: `⏳ Tavolo ${r.table_number} — ${Math.round(r.minutes_seated)}min`,
      body: 'Cliente accomodato senza comanda. Delega un cameriere.',
      tag: `seating-${r.table_id}`,
      url: '/tables',
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
    }).catch(() => {});
  }
}

async function checkCourseCycleForTenant(client, tenantId) {
  // Per ogni tavolo occupied: COURSE_CYCLE_MINUTES dopo che una portata e'
  // PRONTA al pass (last_course_ready_at = consegna al cameriere) → alert per
  // la portata successiva. NB: NON parte dal servito al tavolo ne' dalla
  // comanda. Il promemoria conto dopo il dolce resta invece basato sul
  // SERVITO (last_course_served_at): il cliente deve poter mangiare il dolce.
  const { rows } = await client.query(`
    SELECT
      t.id AS table_id, t.table_number,
      t.current_course,
      t.last_course_ready_at,
      t.last_course_served_at,
      EXTRACT(EPOCH FROM (NOW() - t.last_course_ready_at))/60  AS minutes_since_ready,
      EXTRACT(EPOCH FROM (NOW() - t.last_course_served_at))/60 AS minutes_since_served,
      o.id AS order_id,
      u.name AS waiter_name
    FROM tables t
    JOIN orders o ON o.table_id = t.id AND o.status = 'open' AND o.tenant_id = t.tenant_id
    LEFT JOIN users u ON u.id = o.waiter_id
    WHERE t.tenant_id = $1
      AND t.status = 'occupied'
      AND t.current_course IS NOT NULL
      AND t.current_course IN ('antipasto','primo','secondo','dolce')
  `, [tenantId]);

  const io = getIO();
  for (const r of rows) {
    const nextCourse = NEXT_COURSE[r.current_course] || 'check';

    if (nextCourse === 'check') {
      // Dopo il dolce: promemoria conto X min dopo che il dolce e' stato
      // SERVITO (non da quando e' pronto). Guard: il servito deve essere
      // successivo al pronto del dolce, altrimenti il timer non e' partito.
      const served = r.last_course_served_at;
      const servedAfterReady = served &&
        (!r.last_course_ready_at || new Date(served) >= new Date(r.last_course_ready_at));
      const mins = Math.round(r.minutes_since_served);
      if (servedAfterReady && mins >= CHECK_EMISSION_MINUTES) {
        io?.to('role:admin').to('role:manager').to(`user:${r.waiter_name}`).emit('check-emission-alert', {
          tableId: r.table_id, tableNumber: r.table_number,
          minutesSince: mins, waiterName: r.waiter_name,
        });
      }
    } else {
      // Portata successiva: COURSE_CYCLE_MINUTES da quando la portata corrente
      // e' PRONTA al pass (consegna al cameriere).
      if (r.last_course_ready_at == null) continue;
      const mins = Math.round(r.minutes_since_ready);
      if (mins >= COURSE_CYCLE_MINUTES) {
        io?.to('role:admin').to('role:manager').emit('course-cycle-alert', {
          tableId: r.table_id, tableNumber: r.table_number,
          completedCourse: r.current_course,
          nextCourse,
          minutesSince: mins,
          waiterName: r.waiter_name,
        });
      }
    }
  }
}

// ─── Check tavoli dirty da troppo tempo (workflow sbarazzo) ──
// Quando il cliente paga il conto, il backend porta il tavolo in
// status='dirty'. Il commis deve sbarazzare/pulire e poi marcare
// il tavolo come 'free'. Se passa troppo tempo, emette un alert al
// maitre/admin/manager (NON al singolo cameriere — pulire tavoli e'
// responsabilita' collettiva del team sala).
const DIRTY_ALERT_MINUTES = 5;
async function checkDirtyTablesForTenant(client, tenantId) {
  const { rows } = await client.query(`
    SELECT id, table_number, status_changed_at,
           EXTRACT(EPOCH FROM (NOW() - status_changed_at))/60 AS minutes_since
      FROM tables
     WHERE tenant_id = $1
       AND status = 'dirty'
       AND status_changed_at < NOW() - ($2 || ' minutes')::INTERVAL
  `, [tenantId, DIRTY_ALERT_MINUTES]);

  for (const t of rows) {
    // Emette solo a manager/admin (escalation). Niente persistenza in
    // service_alerts: e' un alert "live" che sparisce appena pulisci.
    getIO()?.to('role:admin').to('role:manager').emit('table-cleanup-alert', {
      tenantId,
      tableId: t.id,
      tableNumber: t.table_number,
      minutesSince: Math.floor(t.minutes_since),
      severity: t.minutes_since >= DIRTY_ALERT_MINUTES * 2 ? 'high' : 'normal',
    });
  }
}

// ─── Tick: itera tutti i tenant attivi ───────────────────────
async function tick() {
  try {
    await forEachActiveTenant(async (client, tenantId) => {
      await checkReadyItemsForTenant(client, tenantId);
      await checkCascadeTimersForTenant(client, tenantId);
      await checkMandatoryAlertsForTenant(client, tenantId);
      await checkDirtyTablesForTenant(client, tenantId);
      // Alert "comanda non presa" DISATTIVATO su richiesta (disturbava troppo).
      // Riattivare la riga sotto per ripristinarlo.
      // await checkSeatingTimersForTenant(client, tenantId);
      await checkCourseCycleForTenant(client, tenantId);
      // JP 2026-06-01: piatti in attesa con fire_at scaduto → auto-fire.
      await checkScheduledFiresForTenant(client, tenantId);
      // JP 2026-06-08: prenotazioni imminenti (≤ 1h) → setta tavolo 'reserved'.
      await checkUpcomingReservationsForTenant(client, tenantId);
    });
  } catch (err) {
    // Errori transient (es. tabella non ancora migrata, DB non pronto)
    // sono attesi durante deploy/migrate. NON terminare il timer: il
    // try/catch dentro setInterval impedisce comunque il crash. Loghiamo
    // solo se l'errore non e' "tabella non esiste" (race startup gia'
    // gestita da waitForSchema).
    if (!/relation .* does not exist/i.test(err.message)) {
      logger.error({ err }, 'tick error');
    }
  }
}

// ─── Auto-fire piatti in attesa con fire_at scaduto ──────────
// JP 2026-06-01: il cameriere imposta fire_at sulle voci "in attesa".
// Quando scade, le passiamo a 'production' (visibili al KDS subito).
async function checkScheduledFiresForTenant(client, tenantId) {
  const { rows } = await client.query(
    `UPDATE order_items
        SET workflow_status = 'production',
            released_at     = NOW(),
            status          = 'pending'
      WHERE tenant_id = $1
        AND workflow_status = 'waiting'
        AND fire_at IS NOT NULL
        AND fire_at <= NOW()
      RETURNING id, order_id`,
    [tenantId]
  );
  if (rows.length === 0) return;
  const io = getIO();
  if (!io) return;
  for (const r of rows) {
    io.emit('workflow-status-changed', {
      orderId: r.order_id, itemId: r.id, workflow_status: 'production',
      auto: true,
    });
    io.emit('item-released-to-production', {
      orderId: r.order_id, itemId: r.id, auto: true,
    });
  }
}

// ─── Auto-setta status='reserved' su tavoli con prenotazione imminente ──
// JP 2026-06-08: prenotazioni create lontano dalla data ora restano 'free'
// nel tavolo. Qui ogni tick controlliamo le prenotazioni entro 1h e
// settiamo lo stato. Idempotente: rispetta tavoli in 'occupied'/'seated'/
// 'dirty' (non li sovrascrive).
async function checkUpcomingReservationsForTenant(client, tenantId) {
  const { rows } = await client.query(
    `UPDATE tables t
        SET status = 'reserved', status_changed_at = NOW()
       FROM reservations r
      WHERE r.tenant_id = $1
        AND r.tenant_id = t.tenant_id
        AND r.table_id  = t.id
        AND r.status    = 'confirmed'
        AND t.status    = 'free'
        AND (r.reserved_date + r.reserved_time) AT TIME ZONE 'Europe/Rome' <= NOW() + INTERVAL '1 hour'
        AND (r.reserved_date + r.reserved_time) AT TIME ZONE 'Europe/Rome' >= NOW() - INTERVAL '30 minutes'
      RETURNING t.id`,
    [tenantId]
  );
  if (rows.length === 0) return;
  const io = getIO();
  if (!io) return;
  for (const r of rows) {
    io.emit('table-status-changed', { tableId: r.id, status: 'reserved' });
  }
}

// Verifica che lo schema multi-tenant sia pronto prima di avviare il
// timer. Risolve il bug 2026-05-08: backend partito prima che il
// pg_restore importasse la tabella `tenants` → 2 tick error iniziali.
async function waitForSchema(maxAttempts = 30, delayMs = 1000) {
  const pool = require('../config/db');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await pool.query('SELECT 1 FROM tenants LIMIT 1');
      return true;
    } catch (err) {
      if (i === 0) logger.info('waiting for schema DB');
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  logger.warn({ maxAttempts }, 'schema non pronto, avvio comunque');
  return false;
}

function startServiceTimer() {
  if (timer) return;
  logger.info({ intervalMs: INTERVAL_MS }, 'started multi-tenant');
  // Wait async per schema, poi parte regolare. setInterval gia' attivo
  // ma il primo tick e' delayed da schema-readiness check.
  timer = setInterval(tick, INTERVAL_MS);
  waitForSchema()
    .then(() => setTimeout(tick, 1000))
    .catch((err) => logger.error({ err }, 'waitForSchema error'));
}

function stopServiceTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startServiceTimer, stopServiceTimer };
