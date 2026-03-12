const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;

function initSocket(server) {
  const ALLOWED = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(s => s.trim());

  io = new Server(server, {
    cors: { origin: ALLOWED, credentials: true },
    transports: ['websocket', 'polling'],
  });

  // JWT auth on handshake — no token = reject
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    // Join role-based room for targeted broadcasts
    socket.join(`role:${socket.user.role}`);

    socket.on('disconnect', () => {
      // cleanup handled by socket.io
    });
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = { initSocket, getIO };
