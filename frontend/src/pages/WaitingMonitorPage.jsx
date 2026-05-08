import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Clock, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { workflowAPI } from '../lib/api'
import { Badge } from '../components/v2'

function formatWaitTime(seconds) {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}min`
}

function waitTone(seconds) {
  const mins = seconds / 60
  if (mins < 5)  return 'ok'
  if (mins < 15) return 'warn'
  return 'err'
}

export default function WaitingMonitorPage() {
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const res = await workflowAPI.getWaiting()
      setOrders(res.data)
    } catch {
      // keep existing
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Aggiorna tempo attesa ogni 30s
  useEffect(() => {
    const id = setInterval(loadData, 30000)
    return () => clearInterval(id)
  }, [loadData])

  // Socket: ricarica su cambi workflow
  useEffect(() => {
    if (!socket) return
    const reload = () => loadData()
    socket.on('workflow-status-changed', reload)
    socket.on('item-released-to-production', reload)
    socket.on('new-order', reload)
    socket.on('order-item-added', reload)
    socket.on('connect', reload)
    return () => {
      socket.off('workflow-status-changed', reload)
      socket.off('item-released-to-production', reload)
      socket.off('new-order', reload)
      socket.off('order-item-added', reload)
      socket.off('connect', reload)
    }
  }, [socket, loadData])

  const totalWaiting = orders.reduce((s, o) => s + o.items.length, 0)

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)]">

      {/* Header */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => navigate(-1)}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <Clock size={20} className="text-[var(--color-warn)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Monitor attese
        </h1>
        <Badge tone="warn" size="sm">{totalWaiting} voci</Badge>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={loadData}
            className="text-[var(--color-text-2)] hover:text-[var(--color-gold)] transition p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)]"
            aria-label="Aggiorna"
          >
            <RefreshCw size={14} />
          </button>
          <Badge
            tone={isConnected ? 'ok' : 'err'}
            size="sm"
            leftIcon={isConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          >
            {isConnected ? 'Live' : 'Offline'}
          </Badge>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-64 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={20} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento attese…</span>
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-[var(--color-text-3)]">
            <Clock size={56} className="text-[var(--color-ok)]/40" />
            <p className="serif text-[var(--color-text-2)] text-base font-bold">
              Nessuna voce in attesa
            </p>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {orders.map(order => (
                <motion.div
                  key={order.order_id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-[var(--color-surface)] rounded-xl border-2 border-[var(--color-warn)]/30 flex flex-col overflow-hidden"
                >
                  {/* Header ordine */}
                  <div className="px-4 py-3 bg-[var(--color-warn-soft)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="serif text-[var(--color-text)] font-bold text-2xl tnum">
                        {order.table_number}
                      </span>
                      {order.zone_name && (
                        <span className="text-[var(--color-text-3)] text-xs">{order.zone_name}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[var(--color-text-2)] text-xs block font-medium">
                        {order.waiter_name}
                      </span>
                      {order.covers && (
                        <span className="text-[var(--color-text-3)] text-[10px] tnum">{order.covers} pers.</span>
                      )}
                    </div>
                  </div>

                  {/* Items in attesa */}
                  <div className="flex-1 p-3 flex flex-col gap-2">
                    {order.items.map(item => {
                      const tone = waitTone(item.seconds_waiting)
                      const toneText =
                        tone === 'err'  ? 'text-[var(--color-err)]'  :
                        tone === 'warn' ? 'text-[var(--color-warn)]' :
                                          'text-[var(--color-ok)]'
                      return (
                        <div
                          key={item.id}
                          className="rounded-lg border border-[var(--color-warn)]/30 bg-[var(--color-warn-soft)] p-3 flex items-start justify-between gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-[var(--color-warn)] bg-[var(--color-warn)]/20 px-1.5 py-0.5 rounded">
                                A
                              </span>
                              <span className="text-[var(--color-text)] font-bold text-sm">
                                {item.quantity > 1 && (
                                  <span className="text-[var(--color-warn)] mr-1 tnum">×{item.quantity}</span>
                                )}
                                {item.name}
                              </span>
                            </div>
                            {item.course_type && item.course_type !== 'altro' && (
                              <span className="text-[10px] text-[var(--color-text-3)] mt-0.5 block">
                                {item.course_type}
                              </span>
                            )}
                            {item.notes && (
                              <span className="text-[var(--color-warn)] text-[11px] italic mt-0.5 block opacity-80">
                                {item.notes}
                              </span>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className={`text-xs font-bold tnum ${toneText}`}>
                              {formatWaitTime(item.seconds_waiting)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
