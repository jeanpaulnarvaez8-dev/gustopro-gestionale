const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { getDashboardStats, getHourlyRevenue, getTopItems, getByWeekday, getTaxReport, getStockReconciliation, getStaffPerformance, getAuditReport, getTakeawayList } = require('../controllers/admin.controller');

const router = Router();

router.get('/stats',              requireRole('admin', 'manager'), getDashboardStats);
router.get('/stats/hourly',       requireRole('admin', 'manager'), getHourlyRevenue);
router.get('/analytics/top-items',requireRole('admin', 'manager'), getTopItems);
router.get('/analytics/weekday',  requireRole('admin', 'manager'), getByWeekday);
router.get('/tax-report',            requireRole('admin'),            getTaxReport);
router.get('/stock-reconciliation',  requireRole('admin', 'manager'), getStockReconciliation);
router.get('/staff-performance',     requireRole('admin', 'manager'), getStaffPerformance);
router.get('/audit-report',          requireRole('admin', 'manager'), getAuditReport);
// JP 2026-06-08: ammessa anche Alessandra (waiter sub_role='asporto')
// per vedere la lista asporti aperti. Controller restituisce solo
// asporti del tenant — niente leak su altri ordini di sala.
router.get('/takeaway',              requireRole('admin', 'manager', 'waiter'), getTakeawayList);

module.exports = router;
