// Client error tracking endpoint.
//
// Riceve errori dal frontend (ErrorBoundary React + window.onerror +
// unhandledrejection) e li logga via pino. Permette di vedere errori
// client istantanei nei docker logs del backend, senza dipendere da
// servizi esterni (Sentry / LogRocket).
//
// Pubblico (no JWT richiesto): se il client crasha PRIMA del login,
// non avrebbe un token. Per evitare floods, ha rate-limit + size limit.
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const logger = require('../lib/logger');

const router = Router();

// Rate limit aggressivo: max 30 report/min per IP (un browser broken puo'
// sparare 100 errori al secondo). 30/min e' sufficiente per catturare
// l'errore senza intasare i log.
const errorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate-limited' },
});

router.post('/', errorLimiter, (req, res) => {
  // Validazione minima: il body deve essere un oggetto con `message` string.
  const b = req.body || {};
  if (typeof b.message !== 'string' || b.message.length === 0) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  // Trunca campi grandi per evitare log bomb.
  const truncate = (s, n) => (typeof s === 'string' ? s.slice(0, n) : undefined);

  // Logga al livello error con tutti i dettagli
  (req.log || logger).error({
    clientError: true,
    source: truncate(b.source, 50),               // 'errorBoundary' | 'window' | 'promise'
    message: truncate(b.message, 500),
    stack: truncate(b.stack, 4000),
    componentStack: truncate(b.componentStack, 2000),
    url: truncate(b.url, 200),
    userAgent: truncate(req.get('user-agent'), 200),
    appVersion: truncate(b.appVersion, 32),
    userId: truncate(b.userId, 36),
    tenantId: truncate(b.tenantId, 36),
    ip: req.ip,
  }, '[CLIENT ERROR]');

  // Risposta minima — il client non legge la response, vuole solo "fire and forget"
  res.status(204).end();
});

module.exports = router;
