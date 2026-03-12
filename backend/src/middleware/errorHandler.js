function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? (status < 500 ? err.message : 'Errore interno del server')
    : err.message;

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err);
  }

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
