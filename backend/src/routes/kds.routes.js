const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { getPendingOrders, updateItemStatus } = require('../controllers/kds.controller');

const router = Router();

router.get('/pending',            requireRole('kitchen','manager','admin'), getPendingOrders);
router.patch('/items/:id/status', requireRole('kitchen','waiter','manager','admin'), updateItemStatus);

module.exports = router;
