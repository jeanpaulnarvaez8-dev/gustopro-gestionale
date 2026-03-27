const pool = require('../config/db');
const { getIO } = require('../socket');

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

function startServiceTimer() {
  if (timer) return;
  console.log('[ServiceTimer] Avviato — controllo ogni 30s');
  timer = setInterval(checkReadyItems, INTERVAL_MS);
  // Prima esecuzione immediata dopo 5s (tempo di avvio)
  setTimeout(checkReadyItems, 5000);
}

function stopServiceTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startServiceTimer, stopServiceTimer };
