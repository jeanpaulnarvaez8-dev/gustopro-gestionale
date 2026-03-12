const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { listTables, createTable, updateTable, setTableStatus } = require('../controllers/tables.controller');

const router = Router();

router.get('/',           listTables);
router.post('/',          requireRole('admin', 'manager'), createTable);
router.put('/:id',        requireRole('admin', 'manager'), updateTable);
router.patch('/:id/status', setTableStatus);

module.exports = router;
