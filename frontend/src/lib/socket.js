import { io } from 'socket.io-client';

let socket = null;

function getSocketUrl() {
  // Strip /api suffix from API URL to get the base server URL
  return (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api$/, '');
}

export function connectSocket(token) {
  if (socket?.connected) return socket;

  socket = io(getSocketUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}
