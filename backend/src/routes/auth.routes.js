const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { login } = require('../controllers/auth.controller');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Troppi tentativi. Riprova tra 15 minuti.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    console.warn(`[auth] login rate-limit hit ip=${req.ip} ua="${req.get('user-agent') || ''}"`);
    res.status(options.statusCode).json(options.message);
  },
});

router.post('/login', loginLimiter, login);

module.exports = router;
