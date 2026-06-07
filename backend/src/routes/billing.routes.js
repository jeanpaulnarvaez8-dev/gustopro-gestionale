const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { generatePreConto, processPayment, listReceipts } = require('../controllers/billing.controller');

const router = Router();

router.get('/pre-conto/:orderId', requireRole('waiter','cashier','manager','admin'), generatePreConto);
// JP 2026-06-07: waiter+sub_role='asporto' (Alessandra) ammessa
// (controller filtra: solo se ordine takeaway).
router.post('/pay',               requireRole('waiter','cashier','manager','admin'),  processPayment);
router.get('/receipts',           requireRole('cashier','manager','admin'),           listReceipts);

module.exports = router;
