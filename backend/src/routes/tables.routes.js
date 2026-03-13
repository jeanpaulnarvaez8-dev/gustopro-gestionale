const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { listTables, createTable, updateTable, deleteTable, setTableStatus } = require('../controllers/tables.controller');

const router = Router();
const mgr = requireRole('admin', 'manager');

router.get('/',             listTables);
router.post('/',            mgr, createTable);
router.put('/:id',          mgr, updateTable);
router.delete('/:id',       mgr, deleteTable);
router.patch('/:id/status', setTableStatus);

module.exports = router;
