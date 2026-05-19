const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { preview, closeDay, list, openDay, todayStatus } = require('../controllers/dayClose.controller');

const router = Router();

// Solo cassiere/manager/admin: chiusura cassa è operazione sensibile.
router.get('/preview',       requireRole('cashier','manager','admin'), preview);
router.post('/',             requireRole('cashier','manager','admin'), closeDay);
router.get('/list',          requireRole('cashier','manager','admin'), list);
// Apertura giornata — accessibile anche ai waiter/kitchen che vedono il badge.
router.get('/today-status',  todayStatus);
router.post('/open',         requireRole('cashier','manager','admin'), openDay);

module.exports = router;
