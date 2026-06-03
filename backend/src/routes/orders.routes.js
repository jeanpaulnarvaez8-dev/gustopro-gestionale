const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { createOrder, getOrder, addItems, cancelItem, cancelOrder, transferOrder, setItemPrice, setItemFireAt, dispatchOrder } = require('../controllers/orders.controller');

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
// JP 2026-05-31: la cassa puo' modificare il prezzo di una voce (sconto inline).
router.patch('/:id/items/:itemId/price', requireRole('cashier','manager','admin'), setItemPrice);
// JP 2026-06-01: cameriere imposta i minuti di auto-fire su voce in attesa.
router.patch('/:id/items/:itemId/fire-at', requireRole('waiter','manager','admin','cashier'), setItemFireAt);
// JP 2026-06-03: Comandista "INIZIA TAVOLO" → libera tutti i waiting alle stazioni.
router.post('/:id/dispatch', requireRole('kitchen','manager','admin'), dispatchOrder);
router.delete('/:id',               requireRole('manager','admin'),          cancelOrder);

module.exports = router;
