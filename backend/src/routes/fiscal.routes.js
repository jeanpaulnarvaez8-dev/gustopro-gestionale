const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { emitFiscal } = require('../controllers/fiscal.controller');

const router = Router();

// JP 2026-06-04: emissione scontrino fiscale RT (Custom Q3X-F).
// Solo admin/manager/cashier — chi gestisce la cassa.
router.post('/emit', requireRole('admin', 'manager', 'cashier'), emitFiscal);

module.exports = router;
