import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, RefreshCw, LogOut, Volume2, VolumeX } from 'lucide-react'
import { kdsAPI, ordersAPI } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { useToast } from '../context/ToastContext'
import { playNewOrderBeep, isSoundEnabled, toggleSound } from '../lib/kdsBeep'

/**
 * KDSComandistaPage — vista per il "Comandista" (PIN 7500, sub_role='dispatcher').
 *
 * JP 2026-06-03: "la comanda arriva solo al codice 7500, lui preme INIZIA
 * TAVOLO e poi i piatti si suddividono nelle stazioni (frittura, antipasti,
 * primi, pizzeria). Si vedono massimo 3 tavoli per riga".
 *
 * Mostra TUTTI gli ordini con almeno una voce 'waiting' (non ancora
 * dispatched). Una card per ordine. Bottone "INIZIA TAVOLO" rilascia tutti
 * i waiting di quell'ordine a 'production' → le stazioni li ricevono.
 */
export default function KDSComandistaPage() {
  const { user, logout } = useAuth()
  const { socket } = useSocket()
  const { toast } = useToast()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [dispatching, setDispatching] = useState({})
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled())
  const lastOrderIdsRef = useRef(new Set())

  const load = useCallback(async () => {
    try {
      const { data } = await kdsAPI.pending('dispatcher')
      setOrders(Array.isArray(data) ? data : [])
    } catch (e) {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Refresh su socket + polling fallback 15s
  useEffect(() => {
    if (!socket) return
    const onNew = (payload) => {
      // beep + flash sul nuovo ordine
      try { playNewOrderBeep() } catch {}
      load()
    }
    const refresh = () => load()
    socket.on('new-order', onNew)
    socket.on('order-item-added', refresh)
    socket.on('workflow-status-changed', refresh)
    socket.on('item-released-to-production', refresh)
    socket.on('item-status-updated', refresh)
    socket.on('connect', refresh)
    return () => {
      socket.off('new-order', onNew)
      socket.off('order-item-added', refresh)
      socket.off('workflow-status-changed', refresh)
      socket.off('item-released-to-production', refresh)
      socket.off('item-status-updated', refresh)
      socket.off('connect', refresh)
    }
  }, [socket, load])

  useEffect(() => {
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  // Beep su NUOVO ordine apparso (anche se via polling)
  useEffect(() => {
    const currentIds = new Set(orders.map(o => o.order_id))
    let hasNew = false
    for (const id of currentIds) {
      if (!lastOrderIdsRef.current.has(id)) hasNew = true
    }
    if (hasNew && lastOrderIdsRef.current.size > 0) {
      try { playNewOrderBeep() } catch {}
    }
    lastOrderIdsRef.current = currentIds
  }, [orders])

  async function handleDispatch(orderId, tableNumber) {
    if (dispatching[orderId]) return
    setDispatching(p => ({ ...p, [orderId]: true }))
    try {
      const { data } = await ordersAPI.dispatch(orderId)
      toast({
        type: 'success',
        title: `🚀 Tavolo ${tableNumber}: ${data.dispatched} piatti partiti`,
        message: 'Inviati alle stazioni',
      })
      setOrders(prev => prev.filter(o => o.order_id !== orderId))
    } catch (e) {
      toast({ type: 'error', title: 'Errore dispatch', message: e?.response?.data?.error || 'Riprova' })
    } finally {
      setDispatching(p => { const n = { ...p }; delete n[orderId]; return n })
    }
  }

  const totalWaiting = orders.reduce((s, o) => s + o.items.reduce((ss, it) => ss + Number(it.quantity || 1), 0), 0)

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)]">
      {/* Header */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <div className="w-9 h-9 rounded-[8px] flex items-center justify-center bg-[var(--color-gold)] text-[#13181C] font-extrabold text-lg">
          7500
        </div>
        <div className="flex-1">
          <h1 className="text-[var(--color-text)] text-lg font-extrabold leading-none">COMANDISTA</h1>
          <p className="text-[var(--color-text-3)] text-[10px] mt-0.5">
            {orders.length} tavoli in attesa · {totalWaiting} piatti totali
          </p>
        </div>
        <button
          onClick={() => { const v = toggleSound(); setSoundOn(v) }}
          className="p-2 rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text)]"
          title={soundOn ? 'Audio attivo' : 'Audio disattivato'}
        >
          {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button
          onClick={load}
          className="p-2 rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text)]"
          title="Aggiorna"
        >
          <RefreshCw size={18} />
        </button>
        <button
          onClick={logout}
          className="p-2 rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-err)]"
          title="Esci"
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* Empty state */}
      {!loading && orders.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-8">
          <div className="w-16 h-16 rounded-full bg-[var(--color-ok-soft)] border-2 border-[var(--color-ok)]/40 flex items-center justify-center text-[var(--color-ok)]">
            <Play size={28} />
          </div>
          <p className="text-[var(--color-text)] text-xl font-extrabold">NESSUNA COMANDA IN ATTESA</p>
          <p className="text-[var(--color-text-3)] text-sm">Sei in pari · ottimo lavoro!</p>
        </div>
      )}

      {/* Card ordini — MAX 3 PER RIGA (JP) */}
      {!loading && orders.length > 0 && (
        <div className="flex-1 p-3 overflow-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence>
              {orders.map(order => (
                <motion.div
                  key={order.order_id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-[var(--color-surface)] border-2 border-[var(--color-gold)]/40 rounded-xl overflow-hidden flex flex-col shadow-lg"
                >
                  {/* Card header con numero tavolo */}
                  <div className="px-3 py-2 bg-[var(--color-gold)] text-[#13181C] flex items-center justify-between">
                    <span className="font-extrabold text-2xl tnum leading-none">{order.table_number}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">{order.zone_name || 'sala'}</span>
                  </div>

                  {/* JP 2026-06-03: bottone INIZIA TAVOLO IN ALTO (sopra la lista
                      piatti) per dispatch rapido senza scrollare a fondo card. */}
                  <button
                    onClick={() => handleDispatch(order.order_id, order.table_number)}
                    disabled={dispatching[order.order_id]}
                    className="w-full py-4 bg-[var(--color-ok)] hover:brightness-110 text-white font-extrabold text-lg uppercase tracking-wider active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Play size={22} fill="currentColor" />
                    {dispatching[order.order_id] ? '…' : 'INIZIA TAVOLO'}
                  </button>

                  {/* Lista piatti waiting */}
                  <div className="p-3 flex-1 space-y-1.5 max-h-[40vh] overflow-y-auto">
                    {order.items.filter(it => it.workflow_status === 'waiting').map(item => (
                      <div key={item.id} className="flex items-start gap-2 text-[var(--color-text)]">
                        <span className="text-[var(--color-gold)] font-bold tnum shrink-0 text-base">
                          ×{item.quantity}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold leading-tight">{item.name}</p>
                          {item.notes && (
                            <p className="text-[var(--color-warn)] text-xs italic font-semibold mt-0.5">
                              ⚠ {item.notes}
                            </p>
                          )}
                          {item.prep_station && item.prep_station !== 'cucina' && (
                            <p className="text-[10px] text-[var(--color-text-3)] uppercase tracking-wider mt-0.5">
                              → {item.prep_station}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}
