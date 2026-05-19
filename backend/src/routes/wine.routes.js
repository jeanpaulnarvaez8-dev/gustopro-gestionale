const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { callWine, ackWine, getOpenCalls } = require('../controllers/wine.controller');

const router = Router();

// Bevandista (waiter/bar) chiama, sommelier (chiunque can_serve_wine) acka.
router.post('/call',       requireRole('waiter','manager','admin','cashier'), callWine);
router.post('/ack/:callId', requireRole('waiter','manager','admin','cashier'), ackWine);
router.get('/open',         requireRole('waiter','manager','admin','cashier'), getOpenCalls);

module.exports = router;
