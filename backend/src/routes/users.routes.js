const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { listUsers, createUser, updateUser, deleteUser } = require('../controllers/users.controller');

const router = Router();

router.get('/',    requireRole('admin', 'manager'), listUsers);
router.post('/',   requireRole('admin'),             createUser);
router.put('/:id', requireRole('admin'),             updateUser);
router.delete('/:id', requireRole('admin'),          deleteUser);

module.exports = router;
