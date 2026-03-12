const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { listZones, createZone } = require('../controllers/zones.controller');

const router = Router();

router.get('/',  listZones);
router.post('/', requireRole('admin', 'manager'), createZone);

module.exports = router;
