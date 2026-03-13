const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { listZones, createZone, updateZone, deleteZone } = require('../controllers/zones.controller');

const router = Router();
const mgr = requireRole('admin', 'manager');

router.get('/',       listZones);
router.post('/',      mgr, createZone);
router.put('/:id',    mgr, updateZone);
router.delete('/:id', mgr, deleteZone);

module.exports = router;
