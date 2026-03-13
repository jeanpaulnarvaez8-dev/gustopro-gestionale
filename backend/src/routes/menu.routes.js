const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const {
  listCategories, listItems, getItemModifiers,
  createCategory, updateCategory, deleteCategory,
  createItem, updateItem, deleteItem,
} = require('../controllers/menu.controller');

const router = Router();
const mgr = requireRole('admin', 'manager');

router.get('/categories',        listCategories);
router.post('/categories',       mgr, createCategory);
router.put('/categories/:id',    mgr, updateCategory);
router.delete('/categories/:id', mgr, deleteCategory);

router.get('/items',               listItems);
router.get('/items/:id/modifiers', getItemModifiers);
router.post('/items',              mgr, createItem);
router.put('/items/:id',           mgr, updateItem);
router.delete('/items/:id',        mgr, deleteItem);

module.exports = router;
