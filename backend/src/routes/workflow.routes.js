const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const {
  changeWorkflowStatus,
  getWaitingItems,
  getCrossmatches,
  respondToAlert,
  getPendingAlerts,
  getDirectDeliveredAlerts,
  deleteItem,
  getAuditLog,
} = require('../controllers/workflow.controller');

const router = Router();

// Workflow status changes (cameriere, manager, admin)
router.patch('/items/:itemId/status', requireRole('waiter', 'manager', 'admin'), changeWorkflowStatus);

// Monitor attese (cucina, manager, admin)
router.get('/waiting', requireRole('kitchen', 'waiter', 'manager', 'admin'), getWaitingItems);

// Incroci — piatti uguali su piu' tavoli (cucina, manager, admin)
router.get('/crossmatches', requireRole('kitchen', 'manager', 'admin'), getCrossmatches);

// Alert obbligatori
router.get('/alerts/pending', requireRole('waiter', 'manager', 'admin'), getPendingAlerts);
router.post('/alerts/:alertId/respond', requireRole('waiter', 'manager', 'admin'), respondToAlert);

// Alert admin per consegnato diretto
router.get('/alerts/direct-delivered', requireRole('admin', 'manager'), getDirectDeliveredAlerts);

// Cancellazione voce (solo admin/manager)
router.delete('/items/:itemId', requireRole('admin', 'manager'), deleteItem);

// Audit log
router.get('/audit/:orderId', requireRole('admin', 'manager'), getAuditLog);

module.exports = router;
