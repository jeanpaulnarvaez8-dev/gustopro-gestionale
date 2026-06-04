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

// Push action — eseguito dal Service Worker (tap "Servito" su orologio).
// PUBBLICO ma autenticato dal token firmato nel body (JWT 30min single-use).
// Mounted PRIMA di verifyToken perche' il SW non ha il JWT di sessione.
router.use('/push-action', require('./pushAction.routes'));

// Menu pubblico cliente (QR sul tavolo) + chiamata cameriere. Nessun login:
// il tenant e' risolto dallo slug nell'URL. Montato PRIMA di verifyToken.
router.use('/public', require('./public.routes'));

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
router.use('/push',         require('./push.routes'));
router.use('/override',     require('./override.routes'));
router.use('/day-close',    require('./dayClose.routes'));
router.use('/comandista',   require('./comandista.routes'));
router.use('/wine',         require('./wine.routes'));
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
router.use('/print',        require('./print.routes'));
router.use('/fiscal',       require('./fiscal.routes'));

module.exports = router;
