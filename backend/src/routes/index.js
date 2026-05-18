const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { idempotencyMiddleware } = require('../middleware/idempotency');

const router = Router();

// Super-admin (server-to-server) — protected by static API key in header.
// Mounted BEFORE verifyToken because tenant onboarding does not require a JWT.
router.use('/superadmin', require('./superadmin.routes'));

// Public — tenant resolved from X-Tenant-Slug header or default fallback.
router.use('/auth', resolveTenant, require('./auth.routes'));

// Client error tracking — pubblico (il client puo' crashare anche pre-login).
// Rate-limited a 30 report/min per IP. Vedi clientError.routes.js.
router.use('/_client-error', require('./clientError.routes'));

// Protected (all routes below require JWT). Tenant is resolved from the
// JWT claim set at login; falls back to header / default if missing
// (covers tokens issued before the tenant_id claim was added).
router.use(verifyToken);
router.use(resolveTenant);
// Idempotency-Key support: se l'header e' presente, mutations (POST/PATCH/DELETE)
// vengono dedotte server-side. Vedere middleware/idempotency.js per dettagli.
router.use(idempotencyMiddleware);
router.use('/users',        require('./users.routes'));
router.use('/zones',        require('./zones.routes'));
router.use('/tables',       require('./tables.routes'));
router.use('/menu',         require('./menu.routes'));
router.use('/orders',       require('./orders.routes'));
router.use('/kds',          require('./kds.routes'));
router.use('/bar',          require('./bar.routes'));
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
