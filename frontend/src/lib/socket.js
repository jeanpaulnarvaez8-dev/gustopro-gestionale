import { io } from 'socket.io-client';

let socket = null;

function getSocketUrl() {
  // JP 2026-06-05 FIX: fallback aggiornato a prod attuale Hetzner (era
  // localhost:3001 → in caso di build senza VITE_API_URL, il client
  // tentava socket su localhost = nessuna connessione in produzione).
  // Strip /api suffix from API URL to get the base server URL
  return (import.meta.env.VITE_API_URL || 'https://gestione.gustopro.it/api').replace(/\/api$/, '');
}

export function connectSocket(token) {
  // Return existing socket even if still connecting — prevents duplicate sockets
  // when AuthContext + SocketContext both call connectSocket near-simultaneously
  if (socket) return socket;

  socket = io(getSocketUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    // Reconnection con backoff ESPONENZIALE:
    //   delay 1s → 2s → 4s → 8s → max 30s
    //   randomization 0.5 (jitter ±50%) per evitare thundering herd
    // Infiniti tentativi: il cameriere non perde mai la connessione, anche
    // se WiFi cade per 10 minuti.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,         // base delay 1s
    reconnectionDelayMax: 30_000,    // max 30s tra tentativi
    randomizationFactor: 0.5,        // jitter ±50%
    timeout: 10_000,                 // 10s per ogni tentativo
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
