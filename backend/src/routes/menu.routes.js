const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { listCategories, listItems, getItemModifiers, createCategory, createItem, updateItem } = require('../controllers/menu.controller');

const router = Router();

router.get('/categories',          listCategories);
router.post('/categories',         requireRole('admin', 'manager'), createCategory);
router.get('/items',               listItems);
router.get('/items/:id/modifiers', getItemModifiers);
router.post('/items',              requireRole('admin', 'manager'), createItem);
router.put('/items/:id',           requireRole('admin', 'manager'), updateItem);

module.exports = router;
