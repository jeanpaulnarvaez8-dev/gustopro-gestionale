const pool = require('../config/db');
const { getIO } = require('../socket');
const { trackAlertReceived, trackEscalation } = require('./performanceTracker');
const pushService = require('./pushService');
const logger = require('../lib/logger').child({ component: 'serviceTimer' });

const INTERVAL_MS = 30_000; // controlla ogni 30 secondi

// Soglie in MINUTI per emettere alert "item ready non servito".
// waiter  = soglia bassa, alert sul tablet del cameriere assegnato.
// manager = escalation, alert anche su admin/manager.
//
// Riva (operational tuning): 3min/6min uniforme. Il responsabile della
// sala vuole feedback rapido sia su piatti che su drink — un cocktail
// "ready" da 5 minuti su servizio spiaggia estivo e' gia' annacquato.
// Erano 20/25 food + 5/10 beverage, ma il personale "impazziva" perche'
// la latenza era troppo alta per reagire (test reale 2026-05-18).
const THRESHOLDS = {
  food:     { waiter: 3, manager: 6 },
  beverage: { waiter: 3, manager: 6 },
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
async function tryInsertAlert(client, tenantId, orderItemId, alertType, targetUserId) {
  const { rows } = await client.query(
    `INSERT INTO service_alerts (tenant_id, order_item_id, alert_type, target_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_item_id, alert_type) DO NOTHING
     RETURNING *`,
    [tenantId, orderItemId, alertType, targetUserId]
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
      const inserted = await tryInsertAlert(client, tenantId, row.item_id, alertType, row.waiter_id);

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

    // Escalation
    if (elapsedMin >= thresholds.manager) {
      const inserted = await tryInsertAlert(client, tenantId, row.item_id, 'manager_25min', null);

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

    const inserted = await tryInsertAlert(client, tenantId, row.item_id, 'course_next', row.waiter_id);

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
