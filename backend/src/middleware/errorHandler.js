const logger = require('../lib/logger');

// Mapping PostgreSQL error codes to appropriate HTTP status codes
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERROR_MAP = {
  '23505': { status: 409, message: 'Risorsa duplicata' },       // unique_violation
  '23503': { status: 400, message: 'Riferimento non valido' },  // foreign_key_violation
  '23502': { status: 400, message: 'Campo obbligatorio mancante' }, // not_null_violation
  '23514': { status: 400, message: 'Valore non ammesso' },      // check_violation
  '22P02': { status: 400, message: 'Formato non valido' },      // invalid_text_representation (e.g. bad UUID)
  '22001': { status: 400, message: 'Testo troppo lungo' },      // string_data_right_truncation
  '42703': { status: 500, message: 'Schema DB non allineato' }, // undefined_column (serious, but not user input)
  '42P01': { status: 500, message: 'Schema DB non allineato' }, // undefined_table
};

function errorHandler(err, req, res, next) {
  let status = err.status;
  let message = err.message;

  // Map PostgreSQL error codes to HTTP status + friendly message
  if (!status && err.code && PG_ERROR_MAP[err.code]) {
    const mapped = PG_ERROR_MAP[err.code];
    status = mapped.status;
    // In production, use friendly message; in dev, keep original for debug
    if (process.env.NODE_ENV === 'production') {
      message = mapped.message;
    }
  }

  status = status || 500;

  // In production, hide internal 500 messages
  const finalMessage = process.env.NODE_ENV === 'production'
    ? (status < 500 ? (message || 'Richiesta non valida') : 'Errore interno del server')
    : (message || 'Unknown error');

  // Log strutturato: 5xx come error (alert), 4xx come warn (client error)
  const log = req.log || logger; // pino-http inietta req.log con reqId
  if (status >= 500) {
    log.error({
      err,
      method: req.method,
      path: req.originalUrl,
      tenantId: req.tenant?.id,
      userId: req.user?.id,
    }, '5xx error response');
  } else if (status >= 400) {
    log.warn({
      method: req.method,
      path: req.originalUrl,
      status,
      message: err.message,
      tenantId: req.tenant?.id,
      userId: req.user?.id,
    }, '4xx client error');
  }

  res.status(status).json({ error: finalMessage });
}

module.exports = errorHandler;
