const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');

const router = Router();

// Public
router.use('/auth', require('./auth.routes'));

// Protected (all routes below require JWT)
router.use(verifyToken);
router.use('/users',        require('./users.routes'));
router.use('/zones',        require('./zones.routes'));
router.use('/tables',       require('./tables.routes'));
router.use('/menu',         require('./menu.routes'));
router.use('/orders',       require('./orders.routes'));
router.use('/kds',          require('./kds.routes'));
router.use('/billing',      require('./billing.routes'));
router.use('/admin',        require('./admin.routes'));
router.use('/inventory',    require('./inventory.routes'));
router.use('/customers',    require('./customers.routes'));
router.use('/reservations', require('./reservations.routes'));
router.use('/combos',       require('./combo.routes'));
router.use('/ingredients',  require('./ingredients.routes'));
router.use('/recipes',      require('./recipes.routes'));
router.use('/service',      require('./service.routes'));

module.exports = router;
