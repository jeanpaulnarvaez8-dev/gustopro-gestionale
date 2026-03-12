const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { login } = require('../controllers/auth.controller');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Troppi tentativi. Riprova tra 15 minuti.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, login);

module.exports = router;
