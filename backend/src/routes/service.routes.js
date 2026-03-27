const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const {
  getAlerts,
  getReadyItems,
  postponeAlert,
  acknowledgeAlert,
} = require('../controllers/service.controller');

const router = Router();

router.get('/alerts',                requireRole('waiter','manager','admin'), getAlerts);
router.get('/ready-items',           requireRole('waiter','manager','admin'), getReadyItems);
router.post('/alerts/:id/postpone',  requireRole('waiter','manager','admin'), postponeAlert);
router.post('/alerts/:id/acknowledge', requireRole('waiter','manager','admin'), acknowledgeAlert);

module.exports = router;
