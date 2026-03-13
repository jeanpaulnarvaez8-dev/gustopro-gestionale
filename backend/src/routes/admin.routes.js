const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { getDashboardStats, getHourlyRevenue, getTopItems, getByWeekday, getTaxReport } = require('../controllers/admin.controller');

const router = Router();

router.get('/stats',              requireRole('admin', 'manager'), getDashboardStats);
router.get('/stats/hourly',       requireRole('admin', 'manager'), getHourlyRevenue);
router.get('/analytics/top-items',requireRole('admin', 'manager'), getTopItems);
router.get('/analytics/weekday',  requireRole('admin', 'manager'), getByWeekday);
router.get('/tax-report',         requireRole('admin'),            getTaxReport);

module.exports = router;
