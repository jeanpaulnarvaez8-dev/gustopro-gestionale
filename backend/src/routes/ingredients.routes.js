const { Router } = require('express');
const c = require('../controllers/ingredients.controller');
const { requireRole } = require('../middleware/requireRole');

const r = Router();

r.get('/',              requireRole('admin','manager'), c.listIngredients);
r.get('/low-stock',     requireRole('admin','manager'), c.getLowStock);
r.post('/',             requireRole('admin','manager'), c.createIngredient);
r.put('/:id',           requireRole('admin','manager'), c.updateIngredient);
r.post('/:id/adjust',   requireRole('admin','manager'), c.adjustStock);
r.get('/:id/movements', requireRole('admin','manager'), c.getMovements);

module.exports = r;
