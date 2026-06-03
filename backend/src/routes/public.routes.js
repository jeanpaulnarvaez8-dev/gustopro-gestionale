const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { getPublicMenu, callWaiter, getPublicReceipt, getPrecontoHtml } = require('../controllers/public.controller');

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
// Scontrino pubblico (link condivisibile via WhatsApp/SMS/Mail).
router.get('/receipt/:id', getPublicReceipt);
// Preconto HTML stampabile (apre il dialog di stampa onload). Pensato per
// stampante termica 80mm via browser sul tablet del cameriere.
router.get('/preconto/:order_id', getPrecontoHtml);

module.exports = router;
