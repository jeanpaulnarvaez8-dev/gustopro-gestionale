const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('./config/db');

let io = null;

async function joinZoneRooms(socket) {
  try {
    const { rows } = await pool.query(
      'SELECT zone_id FROM zone_assignments WHERE user_id = $1 AND shift_date = CURRENT_DATE',
      [socket.user.id]
    );
    for (const row of rows) {
      socket.join(`zone:${row.zone_id}`);
    }
  } catch (err) {
    console.error('[Socket] Errore join zone rooms:', err.message);
  }
}

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

  io.on('connection', async (socket) => {
    // Join role-based room for targeted broadcasts
    socket.join(`role:${socket.user.role}`);
    // Join personal room for direct notifications
    socket.join(`user:${socket.user.id}`);
    // Join zone rooms based on today's assignments
    await joinZoneRooms(socket);

    // Quando le assegnazioni cambiano, ri-joina le room
    socket.on('refresh-zone-rooms', () => joinZoneRooms(socket));

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
