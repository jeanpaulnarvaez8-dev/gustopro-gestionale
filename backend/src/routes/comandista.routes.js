const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { getReadyOrders, callWaiter, confirmPickup, getOpenCalls } = require('../controllers/comandista.controller');

const router = Router();

// Comandista = kitchen/manager/admin gestisce il banco pass.
// Cameriere usa confirmPickup (scansione QR/NFC) → accessibile anche waiter.
router.get('/ready',                requireRole('kitchen','manager','admin'), getReadyOrders);
router.get('/open-calls',           requireRole('waiter','kitchen','manager','admin','cashier'), getOpenCalls);
router.post('/call/:orderId',       requireRole('kitchen','manager','admin'), callWaiter);
router.post('/pickup/:orderId',     requireRole('waiter','kitchen','manager','admin'), confirmPickup);

module.exports = router;
