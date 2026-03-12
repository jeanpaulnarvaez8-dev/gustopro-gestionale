const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { getDashboardStats, getHourlyRevenue } = require('../controllers/admin.controller');

const router = Router();

router.get('/stats',        requireRole('admin', 'manager'), getDashboardStats);
router.get('/stats/hourly', requireRole('admin', 'manager'), getHourlyRevenue);

module.exports = router;
