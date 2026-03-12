const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const c = require('../controllers/inventory.controller');

const router = Router();

// Suppliers
router.get('/suppliers',        requireRole('admin','manager'), c.listSuppliers);
router.post('/suppliers',       requireRole('admin','manager'), c.createSupplier);

// Purchase Orders
router.get('/po',               requireRole('admin','manager'), c.listPOs);
router.post('/po',              requireRole('admin','manager'), c.createPO);
router.get('/po/:id',           requireRole('admin','manager'), c.getPO);

// Goods Receipts
router.get('/receipts',         requireRole('admin','manager'), c.listReceipts);
router.post('/receipts',        c.createReceipt);
router.get('/receipts/:id',     c.getReceipt);
router.patch('/receipt-items/:itemId/confirm', requireRole('admin','manager','kitchen'), c.confirmReceiptItem);

// Spoilage
router.get('/spoilage',         requireRole('admin','manager'), c.listSpoilage);
router.post('/spoilage',        c.createSpoilage);

// KPIs
router.get('/kpis',             requireRole('admin','manager'), c.getInventoryKPIs);

// Barcode lookup
router.get('/barcode/:barcode', c.lookupBarcode);

module.exports = router;
