require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// nginx fix-point sets X-Forwarded-For; trusting one hop ahead lets
// express-rate-limit identify per-IP clients correctly (otherwise all
// requests appear to come from the proxy and a single hostile client
// can lock everyone else out).
app.set('trust proxy', 1);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim());

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Rate limit on login — 15 tentativi ogni 15 minuti per IP
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppi tentativi di accesso. Riprova tra 15 minuti.' },
}));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api', require('./routes/index'));
app.use(errorHandler);

module.exports = app;
