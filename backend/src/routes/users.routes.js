const { Router } = require('express');
const { requireRole } = require('../middleware/requireRole');
const { listUsers, listWaiters, createUser, updateUser, deleteUser } = require('../controllers/users.controller');

const router = Router();

router.get('/',         requireRole('admin', 'manager'), listUsers);
// Lista camerieri attivi — accessibile a tutti i ruoli loggati (per
// codice 32, assegnazioni, ecc.). Non espone PIN ne' created_at.
router.get('/waiters',  listWaiters);
router.post('/',        requireRole('admin'),             createUser);
router.put('/:id',      requireRole('admin'),             updateUser);
router.delete('/:id',   requireRole('admin'),             deleteUser);

module.exports = router;
