const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { createOrder, getOrder, addItems, cancelItem, cancelOrder } = require('../controllers/orders.controller');

const router = Router();

router.post('/',                    requireRole('waiter','manager','admin'), createOrder);
router.get('/:id',                  getOrder);
router.post('/:id/items',           requireRole('waiter','manager','admin'), addItems);
router.delete('/:id/items/:itemId', requireRole('waiter','manager','admin'), cancelItem);
router.delete('/:id',               requireRole('manager','admin'),          cancelOrder);

module.exports = router;
