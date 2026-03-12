import { createContext, useContext, useEffect, useState } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      disconnectSocket();
      setIsConnected(false);
      return;
    }

    const token = localStorage.getItem('gustopro_token');
    if (!token) return;

    const socket = connectSocket(token);

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', () => setIsConnected(false));

    // Inventory alerts
    socket.on('inventory:discrepancy', ({ receivedBy, alerts }) => {
      alerts.forEach(a => {
        toast({
          type: 'warning',
          title: `Discrepanza: ${a.item}`,
          message: `${receivedBy} — mancano ${a.missing} ${a.unit} (${a.pct}%)`,
          duration: 8000,
        });
      });
    });

    socket.on('inventory:spoilage-alert', ({ item, value, loggedBy }) => {
      toast({
        type: 'error',
        title: `Scarto elevato: ${item}`,
        message: `${loggedBy} ha registrato €${value.toFixed(2)} di scarti`,
        duration: 8000,
      });
    });

    socket.on('inventory:confirmed', ({ confirmedBy }) => {
      toast({ type: 'success', title: 'Merce confermata', message: `Confermato da ${confirmedBy}` });
    });

    setIsConnected(socket.connected);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('inventory:discrepancy');
      socket.off('inventory:spoilage-alert');
      socket.off('inventory:confirmed');
    };
  }, [user, toast]);

  return (
    <SocketContext.Provider value={{ socket: getSocket(), isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside SocketProvider');
  return ctx;
}
