require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket');
const { startServiceTimer } = require('./services/serviceTimer');

const server = http.createServer(app);
initSocket(server);
startServiceTimer();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`GustoPro API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
