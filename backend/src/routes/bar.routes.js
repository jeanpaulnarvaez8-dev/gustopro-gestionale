const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { getBarOrders } = require('../controllers/bar.controller');
// PATCH item status: riusiamo il controller del KDS (logica identica:
// emette stesso socket event, stessa cleanup di service_alerts, etc).
const { updateItemStatus } = require('../controllers/kds.controller');

const router = Router();

// Bar = waiter/bar (operatori bancone), manager, admin.
// La logica di filtro per is_beverage e' nel controller, non nel ruolo.
router.get('/pending',            requireRole('waiter','manager','admin'), getBarOrders);
router.patch('/items/:id/status', requireRole('waiter','manager','admin'), updateItemStatus);

module.exports = router;
