const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const {
  listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer,
} = require('../controllers/customers.controller');

const router = Router();
const mgr = requireRole('admin', 'manager');

router.get('/',      listCustomers);
router.get('/:id',   getCustomer);
router.post('/',     mgr, createCustomer);
router.put('/:id',   mgr, updateCustomer);
router.delete('/:id',mgr, deleteCustomer);

module.exports = router;
