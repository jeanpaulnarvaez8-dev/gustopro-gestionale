const pool = require('../config/db');
const { getIO } = require('../socket');
const { trackAlertReceived, trackEscalation } = require('./performanceTracker');

const INTERVAL_MS = 30_000; // controlla ogni 30 secondi

// Soglie in minuti
const THRESHOLDS = {
  food:     { waiter: 20, manager: 25 },
  beverage: { waiter: 5,  manager: 10 },
};

let timer = null;

async function checkReadyItems() {
  try {
    // Trova tutti gli item "ready" non ancora serviti
    const { rows } = await pool.query(`
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
    `);

    const io = getIO();
    if (!io || rows.length === 0) return;

    for (const row of rows) {
      const elapsedMs = Date.now() - new Date(row.ready_at).getTime();
      const elapsedMin = elapsedMs / 60_000;
      const thresholds = row.is_beverage ? THRESHOLDS.beverage : THRESHOLDS.food;

      // --- Alert cameriere (20min cibo / 5min bevande) ---
      if (elapsedMin >= thresholds.waiter) {
        const alertType = row.is_beverage ? 'beverage_alert' : 'waiter_20min';
        const inserted = await tryInsertAlert(row.item_id, alertType, row.waiter_id);

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
          trackAlertReceived(row.waiter_id);
        } else {
          // Alert già esiste — check se postpone è scaduto per re-inviare
          await maybeResendAlert(io, row, alertType, elapsedMin);
        }
      }

      // --- Escalation admin/manager (25min cibo / 10min bevande) ---
      if (elapsedMin >= thresholds.manager) {
        const inserted = await tryInsertAlert(row.item_id, 'manager_25min', null);

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
          trackEscalation(row.waiter_id);
        }
      }
    }
  } catch (err) {
    console.error('[ServiceTimer] Errore:', err.message);
  }
}

/**
 * Inserisce alert se non esiste già. Ritorna l'alert inserito o null.
 */
async function tryInsertAlert(orderItemId, alertType, targetUserId) {
  const { rows } = await pool.query(
    `INSERT INTO service_alerts (order_item_id, alert_type, target_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (order_item_id, alert_type) DO NOTHING
     RETURNING *`,
    [orderItemId, alertType, targetUserId]
  );
  return rows[0] || null;
}

/**
 * Se l'alert esiste ed è stato posticipato, re-invia quando il postpone scade.
 */
async function maybeResendAlert(io, row, alertType, elapsedMin) {
  const { rows } = await pool.query(
    `SELECT id, postponed_until, acknowledged
     FROM service_alerts
     WHERE order_item_id = $1 AND alert_type = $2`,
    [row.item_id, alertType]
  );
  const alert = rows[0];
  if (!alert || alert.acknowledged) return;

  // Se posticipato e il postpone è scaduto, re-invia
  if (alert.postponed_until && new Date(alert.postponed_until) <= new Date()) {
    // Reset postpone per non spammare
    await pool.query(
      'UPDATE service_alerts SET postponed_until = NULL WHERE id = $1',
      [alert.id]
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

/**
 * Controlla alert obbligatori per voci in attesa.
 * Dopo la consegna di un piatto, genera alert OBBLIGATORIO al cameriere
 * per la portata successiva. Il cameriere DEVE scegliere: libera o rinvia.
 */
async function checkMandatoryAlerts() {
  try {
    // Trova voci in attesa (workflow_status='waiting') che hanno
    // portate precedenti gia' consegnate (served)
    const { rows } = await pool.query(`
      SELECT
        oi.id AS item_id, oi.order_id, oi.quantity, oi.inserted_at,
        COALESCE(mi.name, oi.combo_menu_name, 'Piatto') AS item_name,
        COALESCE(c.course_type, 'altro') AS course_type,
        COALESCE(c.is_beverage, false) AS is_beverage,
        o.waiter_id,
        COALESCE(t.table_number, 'ASPORTO') AS table_number,
        COALESCE(z.name, '') AS zone_name,
        u.name AS waiter_name,
        -- Controlla se esiste almeno un piatto servito nello stesso ordine
        EXISTS (
          SELECT 1 FROM order_items oi2
          WHERE oi2.order_id = oi.order_id
            AND oi2.status = 'served'
            AND oi2.id != oi.id
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
    `);

    const io = getIO();
    if (!io || rows.length === 0) return;

    for (const row of rows) {
      // Genera alert solo se ci sono piatti gia' serviti (portata precedente consegnata)
      if (!row.has_served_items) continue;

      const inserted = await tryInsertAlert(row.item_id, 'course_next', row.waiter_id);

      if (inserted) {
        // Aggiorna alert con info extra
        await pool.query(
          'UPDATE service_alerts SET table_number=$1, waiter_name=$2, item_name=$3, is_mandatory=true WHERE id=$4',
          [row.table_number, row.waiter_name, row.item_name, inserted.id]
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
        // Alert esiste: controlla se postpone scaduto e reinvia
        await maybeResendMandatoryAlert(io, row);
      }
    }
  } catch (err) {
    console.error('[MandatoryAlerts] Errore:', err.message);
  }
}

async function maybeResendMandatoryAlert(io, row) {
  const { rows } = await pool.query(
    `SELECT id, postponed_until, acknowledged
     FROM service_alerts
     WHERE order_item_id = $1 AND alert_type = 'course_next'`,
    [row.item_id]
  );
  const alert = rows[0];
  if (!alert || alert.acknowledged) return;

  if (alert.postponed_until && new Date(alert.postponed_until) <= new Date()) {
    await pool.query(
      'UPDATE service_alerts SET postponed_until = NULL WHERE id = $1',
      [alert.id]
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

/**
 * Controlla i timer a cascata tra portate.
 * Quando una portata è stata servita, calcola quando deve partire la successiva.
 */
async function checkCascadeTimers() {
  try {
    // Trova portate servite con timer attivi per portate successive in attesa
    const { rows } = await pool.query(`
      SELECT csl.order_id, csl.course_type AS served_course, csl.served_at,
             ctc.to_course, ctc.minutes, ctc.pre_alert_mins,
             o.waiter_id,
             COALESCE(t.table_number, 'ASPORTO') AS table_number,
             u.name AS waiter_name
      FROM course_served_log csl
      JOIN course_timing_config ctc ON ctc.from_course = csl.course_type
      JOIN orders o ON o.id = csl.order_id
      LEFT JOIN tables t ON t.id = o.table_id
      LEFT JOIN users u ON u.id = o.waiter_id
      WHERE o.status = 'open'
        -- Solo se ci sono items in attesa per questo corso
        AND EXISTS (
          SELECT 1 FROM order_items oi
          JOIN menu_items mi ON mi.id = oi.menu_item_id
          JOIN categories c ON c.id = mi.category_id
          WHERE oi.order_id = csl.order_id
            AND c.course_type = ctc.to_course
            AND oi.workflow_status = 'waiting'
        )
    `);

    const io = getIO();
    if (!io || rows.length === 0) return;

    for (const row of rows) {
      const elapsedMs = Date.now() - new Date(row.served_at).getTime();
      const elapsedMin = elapsedMs / 60_000;
      const targetMin = row.minutes;
      const preAlertMin = targetMin - row.pre_alert_mins;

      // Pre-alert: X minuti prima
      if (elapsedMin >= preAlertMin && elapsedMin < targetMin) {
        const alertKey = `pre_${row.order_id}_${row.to_course}`;
        const inserted = await tryInsertAlert(null, 'waiter_20min', row.waiter_id, alertKey);
        if (inserted) {
          io.to(`user:${row.waiter_id}`).emit('course-pre-alert', {
            orderId: row.order_id,
            tableNumber: row.table_number,
            nextCourse: row.to_course,
            inMinutes: Math.round(targetMin - elapsedMin),
          });
        }
      }

      // Alert principale: è ora di mandare la portata
      if (elapsedMin >= targetMin) {
        io.to(`user:${row.waiter_id}`).emit('course-send-alert', {
          orderId: row.order_id,
          tableNumber: row.table_number,
          courseType: row.to_course,
          elapsedMinutes: Math.round(elapsedMin),
          targetMinutes: targetMin,
        });
      }

      // Alert ritardo: 5+ minuti dopo il target
      if (elapsedMin >= targetMin + 5) {
        io.to(`user:${row.waiter_id}`).emit('course-delay-alert', {
          orderId: row.order_id,
          tableNumber: row.table_number,
          courseType: row.to_course,
          delayMinutes: Math.round(elapsedMin - targetMin),
        });
        // Escalation a manager se > 10 min di ritardo
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
  } catch (err) {
    console.error('[CascadeTimer] Errore:', err.message);
  }
}

function startServiceTimer() {
  if (timer) return;
  console.log('[ServiceTimer] Avviato — controllo ogni 30s');
  timer = setInterval(() => {
    checkReadyItems();
    checkCascadeTimers();
    checkMandatoryAlerts();
  }, INTERVAL_MS);
  setTimeout(() => { checkReadyItems(); checkCascadeTimers(); checkMandatoryAlerts(); }, 5000);
}

function stopServiceTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startServiceTimer, stopServiceTimer };
