const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { getPublicMenu, callWaiter } = require('../controllers/public.controller');

const router = Router();

// Endpoint pubblici (no auth): menu cliente da QR + chiamata cameriere.
// Rate limit sulla chiamata cameriere (endpoint pubblico → anti-abuso).
const callLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste, riprova tra poco' },
});

router.get('/menu/:slug', getPublicMenu);
router.post('/call-waiter/:slug', callLimiter, callWaiter);

module.exports = router;
