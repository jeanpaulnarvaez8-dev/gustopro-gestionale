const pool = require('../config/db');
const pushService = require('../services/pushService');

const TENANT = (req) => req.tenant.id;

/** GET /api/push/key — espone la VAPID public key per il client.
 *  Il SW del browser ne ha bisogno per chiamare pushManager.subscribe(). */
function getPublicKey(req, res) {
  const key = pushService.getPublicKey();
  if (!key) return res.status(503).json({ error: 'Push non configurato' });
  res.json({ publicKey: key });
}

/** POST /api/push/subscribe — registra un device per ricevere push.
 *  Body: { endpoint, keys: { p256dh, auth }, user_agent? }
 *  Idempotent: se l'endpoint esiste gia', aggiorna user_id (re-login). */
async function subscribe(req, res, next) {
  try {
    const { endpoint, keys, user_agent } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'endpoint + keys.p256dh + keys.auth obbligatori' });
    }
    const { rows } = await pool.query(
      `INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (endpoint) DO UPDATE SET
         tenant_id   = EXCLUDED.tenant_id,
         user_id     = EXCLUDED.user_id,
         p256dh      = EXCLUDED.p256dh,
         auth        = EXCLUDED.auth,
         user_agent  = EXCLUDED.user_agent,
         last_used_at = NOW()
       RETURNING id`,
      [TENANT(req), req.user.id, endpoint, keys.p256dh, keys.auth, user_agent || null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
}

/** POST /api/push/unsubscribe — rimuove un device. Body: { endpoint } */
async function unsubscribe(req, res, next) {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint obbligatorio' });
    await pool.query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2',
      [endpoint, req.user.id]
    );
    res.status(204).end();
  } catch (err) { next(err); }
}

/** POST /api/push/test — manda push di test al chiamante. Utile per debug. */
async function sendTest(req, res, next) {
  try {
    await pushService.sendToUser(req.user.id, {
      title: '🔔 Test GustoPro',
      body: 'Notifica push funzionante! Sei collegato.',
      tag: 'gustopro-test',
      url: '/admin-home',
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { getPublicKey, subscribe, unsubscribe, sendTest };
