/**
 * Sprint 10: "Chiama Vino" — il bevandista (che NON serve vino) preme
 * il pulsante per chiamare il sommelier/cameriere abilitato all'apertura.
 *
 * Workflow:
 *   1. Bevandista riceve ordine vino dal tavolo (drink list)
 *   2. Click "Chiama Vino" sulla pagina /bar o /tables
 *   3. INSERT wine_calls + emit socket 'wine-call' a users con
 *      can_serve_wine=true
 *   4. Sommelier risponde acknowledge_at
 */
const pool = require('../config/db');
const { getIO } = require('../socket');
const pushService = require('../services/pushService');

const TENANT = (req) => req.tenant.id;

/** POST /api/wine/call { table_id?, notes? } — chiama il sommelier. */
async function callWine(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const { table_id, notes } = req.body || {};

    const { rows: [call] } = await pool.query(
      `INSERT INTO wine_calls (tenant_id, table_id, called_by, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, table_id || null, req.user.id, notes || null]
    );

    let tableNumber = null;
    if (table_id) {
      const { rows: [t] } = await pool.query(
        'SELECT table_number FROM tables WHERE id=$1 AND tenant_id=$2',
        [table_id, tenantId]
      );
      tableNumber = t?.table_number;
    }

    // Socket: emette a tutti i can_serve_wine + admin/manager
    getIO()?.emit('wine-call', {
      callId: call.id,
      tableId: table_id,
      tableNumber,
      calledByName: req.user.name,
      notes,
    });

    // Push native ai sommelier (utenti con can_serve_wine=true)
    const { rows: sommelier } = await pool.query(
      `SELECT id FROM users
        WHERE tenant_id = $1 AND is_active = true AND can_serve_wine = true
          AND id <> $2`,  -- non a chi ha chiamato
      [tenantId, req.user.id]
    );
    await Promise.all(sommelier.map(s => pushService.sendToUser(s.id, {
      title: `🍷 Chiamata vino — Tavolo ${tableNumber || '?'}`,
      body: notes || `Richiesta dal bar di ${req.user.name}`,
      tag: `wine-call-${call.id}`,
      url: tableNumber ? `/order/${table_id}` : '/tables',
      vibrate: [200, 100, 200],
      requireInteraction: true,
    }).catch(() => {})));

    res.status(201).json(call);
  } catch (err) { next(err); }
}

/** POST /api/wine/ack/:callId — acknowledge ("vengo io"). */
async function ackWine(req, res, next) {
  try {
    const { callId } = req.params;
    const tenantId = TENANT(req);
    const { rows: [call] } = await pool.query(
      `UPDATE wine_calls
          SET acknowledged_at = NOW(), acknowledged_by = $1
        WHERE id = $2 AND tenant_id = $3 AND acknowledged_at IS NULL
        RETURNING *`,
      [req.user.id, callId, tenantId]
    );
    if (!call) return res.status(404).json({ error: 'Chiamata non trovata o gia\' presa' });
    getIO()?.emit('wine-call-ack', { callId, ackByName: req.user.name });
    res.json(call);
  } catch (err) { next(err); }
}

/** GET /api/wine/open — chiamate aperte (per banner UI). */
async function getOpenCalls(req, res, next) {
  try {
    const tenantId = TENANT(req);
    const { rows } = await pool.query(
      `SELECT wc.id, wc.table_id, wc.called_at, wc.notes,
              u.name AS called_by_name,
              COALESCE(t.table_number, '—') AS table_number
         FROM wine_calls wc
         LEFT JOIN users u  ON u.id = wc.called_by
         LEFT JOIN tables t ON t.id = wc.table_id
         WHERE wc.tenant_id = $1 AND wc.acknowledged_at IS NULL
         ORDER BY wc.called_at`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { callWine, ackWine, getOpenCalls };
