require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
const logger = require('./lib/logger');
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

// Request logger: inietta req.log con reqId (UUID) per correlation tracing.
// /health escluso (rumore inutile, viene chiamato ogni 5min da uptime check).
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    // Honor X-Request-Id da CDN se presente, altrimenti genera nuovo UUID v4
    const fromHeader = req.headers['x-request-id'];
    const id = fromHeader && /^[a-f0-9-]{36}$/i.test(fromHeader)
      ? fromHeader
      : crypto.randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  // Skip access log su /health (chiamato spesso da Cloudflare + UptimeRobot)
  autoLogging: { ignore: (req) => req.url === '/health' },
  // Custom serializers per ridurre rumore
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.ip,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  // Livello differenziato per status code: 5xx error, 4xx warn, 2xx/3xx info
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'silent';
    return 'info';
  },
}));

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
// 5 MB consente bulk-import catalogo fornitore (es. MARR con ~2000 articoli
// in CSV ≈ 500KB JSON). Il global protegge da payload bomb (era 1mb).
app.use(express.json({ limit: '5mb' }));

// Rate limit globale su /auth/login (anti-DDoS, ALL requests inclusi success):
// 30 totali / 15min — sopra c'e' anche il limit specifico in auth.routes.js
// che conta solo i FAIL (skipSuccessfulRequests=true). Layered defense.
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppi tentativi di accesso. Riprova tra 15 minuti.' },
}));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api', require('./routes/index'));
app.use(errorHandler);

module.exports = app;
