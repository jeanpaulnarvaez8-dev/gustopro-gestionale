import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [socketInstance, setSocketInstance] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [serviceAlerts, setServiceAlerts] = useState([]);

  useEffect(() => {
    if (!user) {
      disconnectSocket();
      setIsConnected(false);
      setSocketInstance(null);
      return;
    }

    const token = localStorage.getItem('gustopro_token');
    if (!token) return;

    const socket = connectSocket(token);
    setSocketInstance(socket);

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', (err) => {
      setIsConnected(false);
      console.error('[Socket] connect_error:', err.message);
    });

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

    // Notifica al cameriere: piatto pronto in cucina
    socket.on('item-ready-notify', ({ itemName, quantity, tableNumber }) => {
      toast({
        type: 'success',
        title: `🍽️ Pronto — Tavolo ${tableNumber}`,
        message: `${quantity}× ${itemName} è pronto per il servizio`,
        duration: 8000,
      });
    });

    // Alert servizio: piatto pronto da troppo tempo (20min cibo / 5min bevande)
    socket.on('service-alert', (data) => {
      setServiceAlerts(prev => {
        if (prev.some(a => a.alertId === data.alertId)) return prev;
        return [...prev, data];
      });
      const emoji = data.isBeverage ? '🍷' : '⏰';
      toast({
        type: 'warning',
        title: `${emoji} Tavolo ${data.tableNumber} — ${data.elapsedMinutes}min`,
        message: `${data.quantity}× ${data.itemName} in attesa di servizio!`,
        duration: 15000,
      });
    });

    // Escalation per admin/manager: cameriere non ha servito
    socket.on('service-escalation', (data) => {
      toast({
        type: 'error',
        title: `🚨 Escalation — Tavolo ${data.tableNumber}`,
        message: `${data.waiterName} non ha servito ${data.itemName} (${data.elapsedMinutes}min)`,
        duration: 20000,
      });
    });

    // Alert posticipato
    socket.on('alert-postponed', (data) => {
      toast({
        type: 'info',
        title: `Posticipato — ${data.waiterName}`,
        message: `Alert posticipato di 5 minuti`,
        duration: 5000,
      });
    });

    // Item servito — rimuovi alert
    socket.on('item-served', ({ itemId }) => {
      setServiceAlerts(prev => prev.filter(a => a.itemId !== itemId));
    });

    setIsConnected(socket.connected);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('inventory:discrepancy');
      socket.off('inventory:spoilage-alert');
      socket.off('inventory:confirmed');
      socket.off('item-ready-notify');
      socket.off('service-alert');
      socket.off('service-escalation');
      socket.off('alert-postponed');
      socket.off('item-served');
    };
  }, [user, toast]);

  return (
    <SocketContext.Provider value={{ socket: socketInstance, isConnected, serviceAlerts, setServiceAlerts }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside SocketProvider');
  return ctx;
}
