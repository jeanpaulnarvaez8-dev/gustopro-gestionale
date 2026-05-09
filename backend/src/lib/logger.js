/**
 * Logger strutturato (pino).
 *
 * Output:
 *  - Production (NODE_ENV=production): JSON line-delimited, parsed da
 *    `docker logs` + qualsiasi log aggregator (Loki, ELK, Datadog).
 *  - Development: pretty-print colorato umano-leggibile.
 *
 * Uso:
 *   const logger = require('./lib/logger');
 *   logger.info({ tenantId, orderId }, 'order created');
 *   logger.warn({ err }, 'idempotency key reuse');
 *   logger.error({ err, query }, 'DB query failed');
 *
 * Field convention:
 *   - tenantId, userId, orderId, itemId: ID risorse
 *   - reqId: correlation ID di request (auto-iniettato da pino-http)
 *   - err: oggetto Error (pino lo serializza con stack trace)
 *   - duration: ms float
 *
 * Livelli (default 'info'; override via env LOG_LEVEL=debug|trace):
 *   trace < debug < info < warn < error < fatal
 *
 * Bambini (logger contestuali):
 *   const log = logger.child({ tenantId: '...' });
 *   log.info('action'); // logga sempre con tenantId in scope
 */
const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const transport = isProduction
  ? undefined
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    };

const logger = pino({
  level,
  transport,
  // Redact field sensibili (header Authorization, password, pin, secrets)
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-superadmin-key"]',
      'password',
      'pin',
      'pin_hash',
      '*.password',
      '*.pin',
      '*.pin_hash',
      'POSTGRES_PASSWORD',
      'JWT_SECRET',
      'SUPERADMIN_API_KEY',
    ],
    censor: '[REDACTED]',
  },
  // Serialize errori standard (stack trace incluso, no recursive references)
  serializers: pino.stdSerializers,
  base: isProduction
    ? { service: 'gustopro-backend', env: 'production' }
    : { service: 'gustopro-backend' },
});

module.exports = logger;
