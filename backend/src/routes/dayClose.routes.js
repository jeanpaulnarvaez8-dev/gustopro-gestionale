const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { preview, closeDay, list } = require('../controllers/dayClose.controller');

const router = Router();

// Solo cassiere/manager/admin: chiusura cassa è operazione sensibile.
router.get('/preview', requireRole('cashier','manager','admin'), preview);
router.post('/',       requireRole('cashier','manager','admin'), closeDay);
router.get('/list',    requireRole('cashier','manager','admin'), list);

module.exports = router;
