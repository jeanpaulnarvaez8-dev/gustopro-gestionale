const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { generatePreConto, processPayment, listReceipts } = require('../controllers/billing.controller');

const router = Router();

router.get('/pre-conto/:orderId', requireRole('waiter','cashier','manager','admin'), generatePreConto);
router.post('/pay',               requireRole('cashier','manager','admin'),           processPayment);
router.get('/receipts',           requireRole('cashier','manager','admin'),           listReceipts);

module.exports = router;
