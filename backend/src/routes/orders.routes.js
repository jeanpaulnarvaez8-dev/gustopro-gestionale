const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { createOrder, getOrder, addItems, cancelItem, cancelOrder, transferOrder, claimOrder, setItemPrice, setItemWeight, setItemFireAt, dispatchOrder, markAsportoRitirato, markAsportoNoShow, moveOrderTable } = require('../controllers/orders.controller');

const router = Router();

// Cassa abilitata a creare/aggiungere piatti: spesso e' il cassiere a
// comporre il conto del tavolo selezionando cosa hanno mangiato.
router.post('/',                    requireRole('waiter','manager','admin','cashier'), createOrder);
router.get('/:id',                  getOrder);
router.post('/:id/items',           requireRole('waiter','manager','admin','cashier'), addItems);
router.post('/:id/transfer',        requireRole('waiter','manager','admin'), transferOrder);
// JP 2026-06-06: Codice 32 inverso. Un waiter si riassume un ordine che
// gli era stato trasferito. Solo waiter (controller verifica role).
router.post('/:id/claim',           requireRole('waiter'),                    claimOrder);
// cancelItem: il controller gestisce autorizzazione manager/admin OR
// override PIN responsabile (waiter/cassa richiedono PIN responsabile).
router.delete('/:id/items/:itemId', requireRole('waiter','manager','admin','cashier'), cancelItem);
// JP 2026-05-31: la cassa puo' modificare il prezzo di una voce (sconto inline).
router.patch('/:id/items/:itemId/price', requireRole('cashier','manager','admin'), setItemPrice);
// JP 2026-06-06: modifica peso (pesce al kg). Cassa + waiter + admin/manager.
router.patch('/:id/items/:itemId/weight', requireRole('waiter','cashier','manager','admin'), setItemWeight);
// JP 2026-06-01: cameriere imposta i minuti di auto-fire su voce in attesa.
router.patch('/:id/items/:itemId/fire-at', requireRole('waiter','manager','admin','cashier'), setItemFireAt);
// JP 2026-06-03: Comandista "INIZIA TAVOLO" → libera tutti i waiting alle stazioni.
router.post('/:id/dispatch', requireRole('kitchen','manager','admin'), dispatchOrder);
// JP 2026-06-06: sposta ordine da tav X a tav Y (cliente cambia tavolo).
// Cameriere + admin/manager (cassa NO, e' azione di sala).
router.post('/:id/move-table', requireRole('waiter','manager','admin'), moveOrderTable);
// JP 2026-06-06: split flow chiusura asporto (rimpiazza /complete-asporto).
// Solo admin/manager: il cameriere non puo' chiudere cassa da solo
// (vedi audit CRITICAL su frode latente). Entrambi loggano in audit.
router.post('/:id/asporto/ritirato', requireRole('admin','manager'), markAsportoRitirato);
router.post('/:id/asporto/no-show',  requireRole('admin','manager'), markAsportoNoShow);
router.delete('/:id',               requireRole('manager','admin'),          cancelOrder);

module.exports = router;
