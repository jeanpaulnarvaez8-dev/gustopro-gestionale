/**
 * pushAction — esegue azioni notifica (Servito/Ritirato) dal Service
 * Worker quando il cameriere tocca il bottone sull'orologio/notifica,
 * SENZA il JWT di login.
 *
 * Sicurezza: il token e' un JWT firmato col server secret, generato da
 * pushService.signActionToken() quando la push viene inviata. Encoda
 * esattamente { user, tenant, order, items, action } + scadenza 30 min.
 * Niente token = niente azione. Token scaduto/manomesso = rifiutato.
 *
 * NON usa verifyToken middleware (il SW non ha il JWT di sessione):
 * l'autenticazione È il token stesso.
 */
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { getIO } = require('../socket');

async function execute(req, res, next) {
  try {
    const { token, action } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token mancante' });

    // Verifica firma + scadenza
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ error: 'token non valido o scaduto' });
    }
    if (payload.kind !== 'push-action') {
      return res.status(401).json({ error: 'token type errato' });
    }

    const { uid, tid, oid, items, act } = payload;
    // L'azione richiesta deve combaciare con quella firmata nel token
    // (il client passa anche 'action' come doppio check, ma fa fede il token)
    const effectiveAction = act || action;

    if (effectiveAction === 'served') {
      // Marca gli items (o tutti i ready dell'ordine se items vuoto) come served
      let result;
      if (Array.isArray(items) && items.length > 0) {
        result = await pool.query(
          `UPDATE order_items SET status='served', served_at=NOW()
            WHERE id = ANY($1::uuid[]) AND tenant_id=$2 AND order_id=$3 AND status='ready'
            RETURNING id, order_id`,
          [items, tid, oid]
        );
      } else {
        result = await pool.query(
          `UPDATE order_items SET status='served', served_at=NOW()
            WHERE order_id=$1 AND tenant_id=$2 AND status='ready'
            RETURNING id, order_id`,
          [oid, tid]
        );
      }
      // Cleanup alert + socket
      for (const it of result.rows) {
        await pool.query(
          'DELETE FROM service_alerts WHERE order_item_id=$1 AND tenant_id=$2',
          [it.id, tid]
        ).catch(() => {});
        getIO()?.emit('item-served', { orderId: oid, itemId: it.id });
      }
      getIO()?.emit('items-batch-updated', {
        itemIds: result.rows.map(r => r.id), orderIds: [oid],
        status: 'served', count: result.rows.length,
      });
      return res.json({ ok: true, action: 'served', count: result.rows.length });
    }

    if (effectiveAction === 'pickup') {
      // Conferma ritiro al pass (come comandista.confirmPickup ma da token)
      const result = await pool.query(
        `UPDATE order_items SET status='served', served_at=NOW()
          WHERE order_id=$1 AND tenant_id=$2 AND status='ready'
          RETURNING id`,
        [oid, tid]
      );
      await pool.query(
        `UPDATE pass_calls SET acknowledged_at=NOW(), acknowledged_by=$1
          WHERE order_id=$2 AND tenant_id=$3 AND acknowledged_at IS NULL`,
        [uid, oid, tid]
      ).catch(() => {});
      getIO()?.emit('items-batch-updated', {
        itemIds: result.rows.map(r => r.id), orderIds: [oid],
        status: 'served', count: result.rows.length,
      });
      return res.json({ ok: true, action: 'pickup', count: result.rows.length });
    }

    return res.status(400).json({ error: `azione '${effectiveAction}' non supportata` });
  } catch (err) { next(err); }
}

module.exports = { execute };
