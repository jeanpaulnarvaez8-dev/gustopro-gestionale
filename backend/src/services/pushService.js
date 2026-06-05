/**
 * pushService — wrapper su web-push per inviare notifiche native al
 * browser (anche quando l'app e' in background/chiusa).
 *
 * Tipico flow:
 *   1. Browser → POST /api/push/subscribe (registra device)
 *   2. Backend salva sub in push_subscriptions
 *   3. Quando emette socket event "service-alert" (etc), chiama
 *      sendToUser(userId, payload) → web-push consegna anche se l'app
 *      e' chiusa.
 *
 * VAPID keys: configurate via env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
 * Se mancano, il modulo logga warn e diventa no-op (zero crash). Cosi'
 * il backend gira anche senza setup push (dev locale, primo deploy).
 *
 * Cleanup automatico: se web-push restituisce 410 (subscription gone),
 * il record viene rimosso dal DB → niente cleanup manuale.
 */
const webpush = require('web-push');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const logger = require('../lib/logger').child({ component: 'pushService' });

/**
 * signActionToken — genera un JWT breve (30 min) per azioni notifica
 * eseguibili dal Service Worker (es. "Servito" dall'orologio) senza
 * il JWT di login. Il token e' single-purpose: encoda esattamente quale
 * azione + su quali items, firmato col server secret.
 *
 * Payload: { uid, tid, oid, items, act }
 *   uid = user_id che esegue, tid = tenant, oid = order, items = item_ids,
 *   act = 'served' | 'pickup'
 */
function signActionToken({ userId, tenantId, orderId, itemIds, action }) {
  return jwt.sign(
    { uid: userId, tid: tenantId, oid: orderId, items: itemIds || [], act: action, kind: 'push-action' },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );
}

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@gustopro.it';

let enabled = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    enabled = true;
    logger.info('push service enabled');
  } catch (err) {
    logger.error({ err }, 'failed to configure VAPID — push disabled');
  }
} else {
  logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY non configurati — push disabled');
}

function isEnabled() { return enabled; }
function getPublicKey() { return VAPID_PUBLIC; }

/**
 * sendToUser — invia una notifica push a tutti i device registrati di un
 * utente. Async: non blocca il caller (fire & forget). Cleanup automatico
 * delle subscription scadute.
 *
 * payload shape (lo decifra il SW):
 *   { title, body, tag?, url?, icon?, badge?, vibrate?, requireInteraction? }
 */
async function sendToUser(userId, payload) {
  if (!enabled || !userId) return;
  try {
    const { rows } = await pool.query(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    if (rows.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.allSettled(rows.map(async (sub) => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, body);
        // mark as still-active (used per cleanup futuro)
        await pool.query(
          'UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = $1',
          [sub.id]
        );
      } catch (err) {
        // 410 Gone / 404 NotFound / 403 Forbidden = subscription invalida.
        // JP 2026-06-05: aggiunto 403 — FCM/web-push lo ritorna su VAPID
        // key mismatch o subscription revocata. Senza cleanup, ogni push
        // sprecava 4 round-trip FCM per sub morte (Admin aveva 4 morte).
        const status = err?.statusCode || err?.status;
        if (status === 410 || status === 404 || status === 403) {
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id])
            .catch(() => {});
          logger.info({ userId, status }, 'push subscription expired/invalid, removed');
        } else {
          logger.warn({ err: err?.message, status, userId }, 'push send failed');
        }
      }
    }));
  } catch (err) {
    logger.error({ err, userId }, 'sendToUser error');
  }
}

/**
 * sendToRole — invia push a tutti gli utenti con un certo ruolo del
 * tenant. Usato per "service-escalation" (notifica tutti gli admin/manager).
 */
async function sendToRole(tenantId, roles, payload) {
  if (!enabled || !tenantId) return;
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT user_id FROM push_subscriptions ps
        JOIN users u ON u.id = ps.user_id
        WHERE u.tenant_id = $1 AND u.is_active = true AND u.role = ANY($2::text[])`,
      [tenantId, Array.isArray(roles) ? roles : [roles]]
    );
    await Promise.all(rows.map(r => sendToUser(r.user_id, payload)));
  } catch (err) {
    logger.error({ err, tenantId }, 'sendToRole error');
  }
}

module.exports = { isEnabled, getPublicKey, sendToUser, sendToRole, signActionToken };
