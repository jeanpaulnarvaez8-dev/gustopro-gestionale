const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { execute } = require('../controllers/pushAction.controller');

const router = Router();

// Endpoint PUBBLICO → rate limit anti-flood/replay. 60/min per IP è
// abbondante per uso reale (un cameriere fa pochi tap al minuto) ma
// blocca abusi automatizzati.
const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste. Riprova tra poco.' },
});

// POST /api/push-action — eseguito dal Service Worker (no JWT sessione).
// L'auth E' il token firmato nel body. Vedi pushAction.controller.
router.post('/', actionLimiter, execute);

module.exports = router;
