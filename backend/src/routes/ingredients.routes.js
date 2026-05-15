const { Router } = require('express');
const c = require('../controllers/ingredients.controller');
const { requireRole } = require('../middleware/requireRole');

const r = Router();

r.get('/',              requireRole('admin','manager'), c.listIngredients);
r.get('/low-stock',     requireRole('admin','manager'), c.getLowStock);
// Lookup by barcode — usato dallo scanner camera. Aperto anche al kitchen
// per scan rapido al ricevimento merci dal magazziniere/aiuto cucina.
r.get('/barcode/:code', requireRole('admin','manager','kitchen'), c.findByBarcode);
r.post('/',             requireRole('admin','manager'), c.createIngredient);
// Bulk import (catalogo fornitore CSV → array JSON). Body limit ~5MB
// gestito dal global express.json({ limit: '1mb' }) in app.js: per CSV
// >1000 righe, splittare client-side in chunk.
r.post('/bulk-import',  requireRole('admin','manager'), c.bulkImport);
r.put('/:id',           requireRole('admin','manager'), c.updateIngredient);
r.post('/:id/adjust',   requireRole('admin','manager','kitchen'), c.adjustStock);
r.get('/:id/movements', requireRole('admin','manager'), c.getMovements);

module.exports = r;
