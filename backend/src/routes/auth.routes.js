const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { login } = require('../controllers/auth.controller');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 tentativi failed in 15min (era 5: troppo aggressivo)
  // ⚡ Conta SOLO le risposte non-2xx (PIN errato, errori). Un utente che
  // sbaglia PIN 3 volte poi indovina al 4° NON si banna da solo. Il limit
  // protegge brute-force vero (10+ tentativi sbagliati consecutivi).
  skipSuccessfulRequests: true,
  message: { error: 'Troppi tentativi. Riprova tra 15 minuti.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    req.log?.warn({ ip: req.ip, ua: req.get('user-agent') || '' }, '[auth] login rate-limit hit');
    res.status(options.statusCode).json(options.message);
  },
});

router.post('/login', loginLimiter, login);

module.exports = router;
