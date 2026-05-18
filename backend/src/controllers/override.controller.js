/**
 * Manager Override — verifica PIN di un manager/admin "supervisore" per
 * autorizzare operazioni sensibili senza dover cambiare login.
 *
 * Use case (piano operativo Riva):
 *   - "Blocco chiusura conto senza codice cassa o badge del responsabile"
 *   - "Cancellazioni post-invio" devono essere autorizzate
 *   - Sconti, voucher, omaggi richiedono firma manager
 *   - "Jolly" di correzione pre-invio con soglie e escalation
 *
 * Flow tipico:
 *   1. Waiter chiede cancellazione → frontend mostra modal con PIN
 *   2. Manager (presente fisicamente) inserisce il PIN
 *   3. Frontend POST /api/override/verify {pin, action_type}
 *   4. Backend: bcrypt.compare contro tutti i manager+admin attivi del tenant
 *   5. Se match: ritorna {ok:true, manager_id, manager_name, override_token}
 *      → frontend usa override_token nei header dei prossimi request (Idempotency-Key style)
 *   6. Se no match: 401 + audit fail
 *
 * Per ora MVP semplice senza token revocabili: il backend ritorna manager_id
 * e il frontend lo passa nei body delle chiamate sensibili. Audit lato endpoint.
 */
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const TENANT = (req) => req.tenant.id;

async function verify(req, res, next) {
  try {
    const { pin, action_type, reason } = req.body;
    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN non valido (4-6 cifre)' });
    }
    const tenantId = TENANT(req);

    // Trova tutti i manager/admin attivi del tenant
    const { rows: managers } = await pool.query(
      `SELECT id, name, role, pin_hash FROM users
        WHERE tenant_id = $1 AND is_active = true AND role IN ('manager','admin')`,
      [tenantId]
    );

    let matched = null;
    for (const m of managers) {
      // eslint-disable-next-line no-await-in-loop
      if (await bcrypt.compare(pin, m.pin_hash)) { matched = m; break; }
    }

    if (!matched) {
      // Audit fail anonimo (pin sbagliato)
      req.log?.warn({
        action_type, requested_by: req.user?.id, ip: req.ip,
      }, '[override] PIN errato');
      return res.status(401).json({ error: 'PIN responsabile non riconosciuto' });
    }

    // Audit success
    req.log?.info({
      action_type, reason: reason || null,
      authorized_by: matched.id, authorized_by_name: matched.name,
      requested_by: req.user?.id, requested_by_name: req.user?.name,
    }, '[override] autorizzato');

    res.json({
      ok: true,
      manager_id:   matched.id,
      manager_name: matched.name,
      manager_role: matched.role,
      // valido 5 minuti — il frontend deve usarlo entro questo timeout
      // per la prossima azione sensibile.
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
  } catch (err) { next(err); }
}

module.exports = { verify };
