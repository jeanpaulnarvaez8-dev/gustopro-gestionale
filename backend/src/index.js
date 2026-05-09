require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket');
const { startServiceTimer } = require('./services/serviceTimer');
const logger = require('./lib/logger');

const server = http.createServer(app);
initSocket(server);
startServiceTimer();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'GustoPro API up');
});

// Graceful shutdown — Docker SIGTERM o ctrl+C
['SIGTERM', 'SIGINT'].forEach((sig) => {
  process.on(sig, () => {
    logger.info({ signal: sig }, 'shutting down');
    server.close(() => process.exit(0));
    // Hard exit dopo 10s se non riesce a chiudere connessioni in volo
    setTimeout(() => process.exit(1), 10000).unref();
  });
});

// Uncaught errors → logga + exit (PM2/Docker restart si occupera' del recovery)
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException — exiting');
  setTimeout(() => process.exit(1), 200).unref();
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
});
