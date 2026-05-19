const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { listTables, createTable, updateTable, deleteTable, setTableStatus, seatTable, delegateTable } = require('../controllers/tables.controller');

const router = Router();
const mgr = requireRole('admin', 'manager');

router.get('/',             listTables);
router.post('/',            mgr, createTable);
router.put('/:id',          mgr, updateTable);
router.delete('/:id',       mgr, deleteTable);
router.patch('/:id/status', setTableStatus);
// "Accomoda cliente": setta status='seated' + parte timer 10min presa comanda
router.post('/:id/seat',    requireRole('waiter','manager','admin'), seatTable);
// "Delega": manda push native al cameriere per andare a prendere comanda
router.post('/:id/delegate', requireRole('waiter','manager','admin'), delegateTable);

module.exports = router;
