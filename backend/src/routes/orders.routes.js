const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { createOrder, getOrder, addItems, cancelItem, cancelOrder, transferOrder } = require('../controllers/orders.controller');

const router = Router();

router.post('/',                    requireRole('waiter','manager','admin'), createOrder);
router.get('/:id',                  getOrder);
router.post('/:id/items',           requireRole('waiter','manager','admin'), addItems);
router.post('/:id/transfer',        requireRole('waiter','manager','admin'), transferOrder);
// cancelItem: il controller gestisce autorizzazione manager/admin OR
// override PIN responsabile (per richiesta cancellazione di un waiter).
router.delete('/:id/items/:itemId', requireRole('waiter','manager','admin'), cancelItem);
router.delete('/:id',               requireRole('manager','admin'),          cancelOrder);

module.exports = router;
