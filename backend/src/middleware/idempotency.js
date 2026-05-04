// Idempotency-Key middleware.
//
// Per i metodi mutativi (POST/PATCH/DELETE), se il client invia un header
// `Idempotency-Key` (UUID v4 client-generated):
//   - Se esiste gia' un record con la stessa (tenant_id, key) → ritorna la
//     response salvata (status + body) SENZA ri-elaborare.
//   - Altrimenti, processa la request normalmente, intercetta la response
//     prima dell'invio e la salva nel DB. Le successive richieste con la
//     stessa key restituiranno la stessa response.
//
// Se l'header e' assente, il middleware lascia passare senza fare nulla
// (idempotenza opt-in).
//
// Cleanup TTL 7 giorni: per ora a mano via SQL, futuro cron job.

const pool = require('../config/db');

const IDEMPOTENT_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

async function idempotencyMiddleware(req, res, next) {
  const method = req.method.toUpperCase();
  if (!IDEMPOTENT_METHODS.has(method)) return next();

  const key = req.headers['idempotency-key'];
  if (!key) return next();

  // Validazione minima: UUID v4 format
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key)) {
    return res.status(400).json({ error: 'Idempotency-Key deve essere UUID v4' });
  }

  const tenantId = req.tenant?.id;
  if (!tenantId) {
    // Senza tenant resolved (route pubblica?), saltiamo idempotency
    return next();
  }

  try {
    // Lookup esistente
    const { rows: [existing] } = await pool.query(
      `SELECT response_status, response_body
         FROM idempotency_keys
        WHERE tenant_id = $1 AND key = $2`,
      [tenantId, key]
    );
    if (existing) {
      // Replay: stessa response del primo tentativo
      res.set('X-Idempotent-Replay', 'true');
      return res.status(existing.response_status).json(existing.response_body);
    }
  } catch (err) {
    // Se la tabella non esiste (migration non applicata), saltiamo silenziosamente
    if (err.code === '42P01') {
      console.warn('[idempotency] table not found, skipping (run migration 016)');
      return next();
    }
    return next(err);
  }

  // Intercetta la response per salvarla prima dell'invio.
  // Patch di res.json: cattura status + body, salva in DB, poi forward.
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const status = res.statusCode || 200;
    // Salva in background — non blocca la risposta.
    pool.query(
      `INSERT INTO idempotency_keys
         (tenant_id, key, method, path, response_status, response_body, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, key) DO NOTHING`,
      [tenantId, key, method, req.path, status, body, req.user?.id ?? null]
    ).catch((err) => {
      console.error('[idempotency] save failed:', err.message);
    });
    return originalJson(body);
  };

  return next();
}

module.exports = { idempotencyMiddleware };
