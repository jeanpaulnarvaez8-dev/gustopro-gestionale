const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { requireSuperadmin } = require('../middleware/requireSuperadmin');
const {
  listTenants,
  createTenant,
  updateTenant,
} = require('../controllers/superadmin.controller');

const router = Router();

// Rate limit aggressivo: questo endpoint non deve essere brute-forceable.
const superadminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Troppe richieste superadmin' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(superadminLimiter);
router.use(requireSuperadmin);

router.get('/tenants',         listTenants);
router.post('/tenants',        createTenant);
router.patch('/tenants/:id',   updateTenant);

module.exports = router;
