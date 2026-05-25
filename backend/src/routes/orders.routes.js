const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { createOrder, getOrder, addItems, cancelItem, cancelOrder, transferOrder } = require('../controllers/orders.controller');

const router = Router();

// Cassa abilitata a creare/aggiungere piatti: spesso e' il cassiere a
// comporre il conto del tavolo selezionando cosa hanno mangiato.
router.post('/',                    requireRole('waiter','manager','admin','cashier'), createOrder);
router.get('/:id',                  getOrder);
router.post('/:id/items',           requireRole('waiter','manager','admin','cashier'), addItems);
router.post('/:id/transfer',        requireRole('waiter','manager','admin'), transferOrder);
// cancelItem: il controller gestisce autorizzazione manager/admin OR
// override PIN responsabile (waiter/cassa richiedono PIN responsabile).
router.delete('/:id/items/:itemId', requireRole('waiter','manager','admin','cashier'), cancelItem);
router.delete('/:id',               requireRole('manager','admin'),          cancelOrder);

module.exports = router;
