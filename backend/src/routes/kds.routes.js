const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { getPendingOrders, updateItemStatus, getHistory, getAbbinaGroups, batchUpdateStatus } = require('../controllers/kds.controller');

const router = Router();

router.get('/pending',            requireRole('kitchen','manager','admin'), getPendingOrders);
router.get('/history',            requireRole('kitchen','waiter','manager','admin'), getHistory);
router.get('/abbina',             requireRole('kitchen','manager','admin'), getAbbinaGroups);
router.post('/batch-status',      requireRole('kitchen','manager','admin'), batchUpdateStatus);
router.patch('/items/:id/status', requireRole('kitchen','waiter','manager','admin'), updateItemStatus);

module.exports = router;
