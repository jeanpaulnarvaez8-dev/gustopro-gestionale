const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const {
  getPublicMenu, callWaiter, getPublicReceipt, getPrecontoHtml,
  getPrecontoEscpos, getPrecontoEscposByTable,
} = require('../controllers/public.controller');
const { getPendingJobs } = require('../controllers/print.controller');

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
// ESC/POS raw per stampante TP808 a porta 9100 (JP 2026-06-03).
// Uso: curl ... | nc -w1 192.168.1.24 9100
router.get('/preconto-escpos/:order_id', getPrecontoEscpos);
router.get('/preconto-escpos/by-table/:tenant_slug/:table_number', getPrecontoEscposByTable);
// Print queue — l'agente locale fa polling qui (token-based).
router.get('/print-pending/:tenant_slug', getPendingJobs);

module.exports = router;
