import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { storage } from '../lib/storage';
import { playReadyBeep, playUrgentBeep, playNewOrderBeep } from '../lib/kdsBeep';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const { toast: rawToast } = useToast();
  // JP 2026-06-04: admin/cassa non vogliono popup pop-up dei socket
  // events (CICLO PORTATE, item-ready, escalation, ecc.). Hanno la
  // campanella unificata che mostra tutto solo su click. Wrapper
  // globale: silenzia ogni toast socket-driven per quei ruoli.
  const isSilentRole = ['admin', 'cashier'].includes(user?.role);
  const toast = (opts) => { if (!isSilentRole) rawToast(opts); };
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

    const token = storage.get('gustopro_token');
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

    // Notifica al cameriere: piatto pronto in cucina.
    // Backend emette SOLO al room user:${waiter_id} → solo il cameriere
    // dell'ordine riceve. Beep + toast + (se PWA installata e in background)
    // Web Notification opzionale.
    socket.on('item-ready-notify', ({ itemName, quantity, tableNumber }) => {
      // 🔔 Beep audio (configurable via toggle in TableMap header)
      playReadyBeep();

      toast({
        type: 'success',
        title: `🍽️ Pronto — Tavolo ${tableNumber}`,
        message: `${quantity}× ${itemName} è pronto per il servizio`,
        duration: 8000,
      });

      // Web Notification opt-in (browser fuori focus o PWA in background).
      // Permission richiesta solo se l'utente non ha mai risposto.
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const showNotif = () => {
          try {
            // Solo se la tab NON è visibile (utente sta facendo altro)
            if (document.visibilityState !== 'visible') {
              new Notification(`🍽️ Tavolo ${tableNumber} — pronto`, {
                body: `${quantity}× ${itemName}`,
                icon: '/icon-192.png',
                tag: `ready-${tableNumber}-${itemName}`,
                requireInteraction: false,
                silent: false,
              });
            }
          } catch { /* ignore */ }
        };
        if (Notification.permission === 'granted') {
          showNotif();
        } else if (Notification.permission !== 'denied') {
          // Richiesta one-shot — il browser la cache, no spam
          Notification.requestPermission().then((p) => {
            if (p === 'granted') showNotif();
          }).catch(() => {});
        }
      }
    });

    // Alert servizio: piatto pronto da troppo tempo (20min cibo / 5min bevande)
    socket.on('service-alert', (data) => {
      try { playUrgentBeep() } catch {}
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
      try { playUrgentBeep() } catch {}
      toast({
        type: 'error',
        title: `🚨 Escalation — Tavolo ${data.tableNumber}`,
        message: `${data.waiterName} non ha servito ${data.itemName} (${data.elapsedMinutes}min)`,
        duration: 20000,
      });
    });

    // Course coerenza pass: tutti gli items di un course (antipasti/primi/...)
    // dello stesso tavolo sono pronti contemporaneamente — il cameriere puo'
    // portarli insieme rispettando "10 qui = 10 la'" (sincronizzazione tavolo).
    socket.on('course-ready-pass', (data) => {
      toast({
        type: 'success',
        title: `✅ ${data.courseType} pronto — Tavolo ${data.tableNumber}`,
        message: `${data.itemsCount} pezzi al pass, servire INSIEME`,
        duration: 12000,
      });
    });

    // Sprint 10: chiamata vino dal bevandista → notifica sommelier abilitati.
    socket.on('wine-call', (data) => {
      try { playUrgentBeep() } catch {}
      toast({
        type: 'warning',
        title: `🍷 Chiama Vino — Tavolo ${data.tableNumber || '?'}`,
        message: data.notes || `${data.calledByName} richiede sommelier al tavolo`,
        duration: 18000,
      });
    });

    // Sprint 10: catena escalation alert (delegato dopo 6min).
    socket.on('service-delegate-alert', (data) => {
      try { playUrgentBeep() } catch {}
      toast({
        type: 'error',
        title: `🔔 DELEGATO Tavolo ${data.tableNumber}`,
        message: `${data.primaryWaiterName} non ha risposto. Subentri tu — ${data.itemName} ${data.elapsedMinutes}min`,
        duration: 25000,
      });
    });

    // Sprint 6: chiamata cameriere dal pass (banco comandista).
    socket.on('pass-call', (data) => {
      try { playUrgentBeep() } catch {}
      toast({
        type: 'info',
        title: `🛎️ Ritira al pass — Tavolo ${data.tableNumber}`,
        message: `${data.calledByName} ti ha chiamato`,
        duration: 12000,
      });
    });

    // Pre-allerta crudi: nuovo ordine con item della stazione crudi.
    // Toast prominente per kitchen/admin/manager — serve prep tempestiva.
    socket.on('crudi-preallerta', (data) => {
      try { playUrgentBeep() } catch {}
      toast({
        type: 'warning',
        title: `🦪 Pre-allerta Crudi — Tavolo ${data.tableNumber}`,
        message: data.summary || `${data.totalQty} item da preparare`,
        duration: 18000,
      });
    });

    // Sprint 4: tavolo accomodato (seated) > 10min senza ordine.
    // Alert al maitre/admin per delegare un cameriere.
    socket.on('seating-comanda-alert', (data) => {
      try { playUrgentBeep() } catch {}
      toast({
        type: 'warning',
        title: `⏳ Tavolo ${data.tableNumber} — comanda non presa`,
        message: `Cliente accomodato da ${data.minutesSeated}min. Delega un cameriere.`,
        duration: 15000,
      });
    });

    // Cliente chiama il cameriere dal menu QR sul tavolo.
    socket.on('customer-call', (data) => {
      try { playUrgentBeep() } catch {}
      toast({
        type: 'warning',
        title: `🔔 Tavolo ${data.tableNumber} ti chiama`,
        message: 'Il cliente ha chiamato dal menu QR. Vai al tavolo.',
        duration: 15000,
      });
    });

    // Sprint 4: portata X servita > 20min senza items della successiva.
    socket.on('course-cycle-alert', (data) => {
      try { playUrgentBeep() } catch {}
      toast({
        type: 'warning',
        title: `🍽️ Tavolo ${data.tableNumber} — ciclo portate`,
        message: `${data.completedCourse} servito da ${data.minutesSince}min. Tempo di passare al ${data.nextCourse}.`,
        duration: 12000,
      });
    });

    // Sprint 4: dolce servito > 10min senza emissione conto.
    socket.on('check-emission-alert', (data) => {
      try { playUrgentBeep() } catch {}
      toast({
        type: 'warning',
        title: `🧾 Tavolo ${data.tableNumber} — emettere conto`,
        message: `${data.minutesSince}min dalla fine pasto. Chiudere conto per liberare il tavolo.`,
        duration: 12000,
      });
    });

    // Sbarazzo mancato: tavolo dirty da troppo tempo (workflow pulizia).
    // Emesso solo a admin/manager (responsabile sala), no spam ai camerieri.
    socket.on('table-cleanup-alert', (data) => {
      const high = data.severity === 'high';
      try { playUrgentBeep() } catch {}
      toast({
        type: high ? 'error' : 'warning',
        title: `🧹 Sbarazzo Tavolo ${data.tableNumber}`,
        message: high
          ? `Tavolo dirty da ${data.minutesSince}min — pulizia URGENTE`
          : `Tavolo da pulire da ${data.minutesSince}min`,
        duration: 12000,
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

    // === CASCADE TIMER: alert tra portate ===
    // Pre-alert: 5 min prima della prossima portata
    socket.on('course-pre-alert', (data) => {
      toast({
        type: 'info',
        title: `📋 Tavolo ${data.tableNumber} — tra ${data.inMinutes}min`,
        message: `Prepararsi per portata: ${data.nextCourse}`,
        duration: 10000,
      });
    });

    // Alert principale: è ora di mandare la portata
    socket.on('course-send-alert', (data) => {
      toast({
        type: 'warning',
        title: `🍽️ Tavolo ${data.tableNumber} — INVIA ${data.courseType.toUpperCase()}`,
        message: `È il momento di inviare la portata in cucina`,
        duration: 30000,
      });
    });

    // Alert ritardo: portata in ritardo
    socket.on('course-delay-alert', (data) => {
      toast({
        type: 'error',
        title: `⚠️ RITARDO Tavolo ${data.tableNumber}`,
        message: `${data.courseType} in ritardo di ${data.delayMinutes}min`,
        duration: 30000,
      });
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
      socket.off('course-pre-alert');
      socket.off('course-send-alert');
      socket.off('course-delay-alert');
      socket.off('customer-call');
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
