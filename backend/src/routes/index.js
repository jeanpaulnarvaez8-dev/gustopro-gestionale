const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');

const router = Router();

// Public — tenant resolved from X-Tenant-Slug header or default fallback.
router.use('/auth', resolveTenant, require('./auth.routes'));

// Protected (all routes below require JWT). Tenant is resolved from the
// JWT claim set at login; falls back to header / default if missing
// (covers tokens issued before the tenant_id claim was added).
router.use(verifyToken);
router.use(resolveTenant);
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
router.use('/assignments',  require('./assignments.routes'));
router.use('/courses',      require('./courses.routes'));
router.use('/workflow',     require('./workflow.routes'));

module.exports = router;
