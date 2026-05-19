const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { getPendingOrders, updateItemStatus, getHistory } = require('../controllers/kds.controller');

const router = Router();

router.get('/pending',            requireRole('kitchen','manager','admin'), getPendingOrders);
router.get('/history',            requireRole('kitchen','waiter','manager','admin'), getHistory);
router.patch('/items/:id/status', requireRole('kitchen','waiter','manager','admin'), updateItemStatus);

module.exports = router;
