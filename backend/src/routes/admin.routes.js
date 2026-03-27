const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { getDashboardStats, getHourlyRevenue, getTopItems, getByWeekday, getTaxReport, getStockReconciliation, getStaffPerformance } = require('../controllers/admin.controller');

const router = Router();

router.get('/stats',              requireRole('admin', 'manager'), getDashboardStats);
router.get('/stats/hourly',       requireRole('admin', 'manager'), getHourlyRevenue);
router.get('/analytics/top-items',requireRole('admin', 'manager'), getTopItems);
router.get('/analytics/weekday',  requireRole('admin', 'manager'), getByWeekday);
router.get('/tax-report',            requireRole('admin'),            getTaxReport);
router.get('/stock-reconciliation',  requireRole('admin', 'manager'), getStockReconciliation);
router.get('/staff-performance',     requireRole('admin', 'manager'), getStaffPerformance);

module.exports = router;
