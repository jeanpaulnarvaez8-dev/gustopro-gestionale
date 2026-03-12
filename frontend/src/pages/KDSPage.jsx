import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Wifi, WifiOff, RefreshCw, ChefHat, CheckCircle2, Clock } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { useToast } from '../context/ToastContext'
import { kdsAPI } from '../lib/api'
import { formatElapsed, elapsedMinutes } from '../lib/utils'

const ITEM_STATUS = {
  pending: { label: 'In attesa',       bg: 'bg-amber-900/40',  border: 'border-amber-500/50',  text: 'text-amber-400',  next: 'cooking', nextLabel: 'Inizia' },
  cooking: { label: 'In preparazione', bg: 'bg-orange-900/40', border: 'border-orange-500/50', text: 'text-orange-400', next: 'ready',   nextLabel: 'Pronto' },
  ready:   { label: 'Pronto',          bg: 'bg-emerald-900/40',border: 'border-emerald-500/50',text: 'text-emerald-400',next: null,      nextLabel: null },
}

function elapsedColor(minutes) {
  if (minutes < 10) return 'text-emerald-400'
  if (minutes < 20) return 'text-amber-400'
  return 'text-red-400'
}

function ElapsedTick({ sentAt }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])
  const mins = elapsedMinutes(sentAt)
  return (
    <span className={`text-xs flex items-center gap-1 ${elapsedColor(mins)}`}>
      <Clock size={10} /> {formatElapsed(sentAt)}
    </span>
  )
}

export default function KDSPage() {
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()
  const { toast } = useToast()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState({}) // itemId → true
  const loadedRef = useRef(false)

  const loadOrders = useCallback(async () => {
    try {
      const res = await kdsAPI.pending()
      setOrders(res.data)
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!loadedRef.current) { loadedRef.current = true; loadOrders() }
  }, [loadOrders])

  // Socket real-time updates
  useEffect(() => {
    if (!socket) return

    const onNewOrder = () => loadOrders()
    const onItemAdded = () => loadOrders()

    const onItemUpdated = ({ orderId, itemId, status }) => {
      setOrders(prev => {
        const updated = prev.map(order => {
          if (order.order_id !== orderId) return order
          const newItems = order.items.map(it =>
            it.id === itemId ? { ...it, status } : it
          )
          // Remove order if all items are ready/served/cancelled
          const active = newItems.filter(it => it.status === 'pending' || it.status === 'cooking')
          if (active.length === 0) return null
          return { ...order, items: newItems }
        })
        return updated.filter(Boolean)
      })
    }

    socket.on('new-order', onNewOrder)
    socket.on('order-item-added', onItemAdded)
    socket.on('item-status-updated', onItemUpdated)

    return () => {
      socket.off('new-order', onNewOrder)
      socket.off('order-item-added', onItemAdded)
      socket.off('item-status-updated', onItemUpdated)
    }
  }, [socket, loadOrders])

  const handleAdvance = async (itemId, nextStatus) => {
    if (!nextStatus) return
    setUpdating(prev => ({ ...prev, [itemId]: true }))
    try {
      await kdsAPI.updateItemStatus(itemId, nextStatus)
    } catch {
      toast({ type: 'error', title: 'Errore aggiornamento stato' })
    } finally {
      setUpdating(prev => { const n = { ...prev }; delete n[itemId]; return n })
    }
  }

  const pendingCount = orders.reduce((sum, o) =>
    sum + o.items.filter(i => i.status === 'pending').length, 0)
  const cookingCount = orders.reduce((sum, o) =>
    sum + o.items.filter(i => i.status === 'cooking').length, 0)

  return (
    <div className="min-h-screen bg-[#111] flex flex-col">

      {/* Header */}
      <header className="bg-[#1A1A1A] border-b border-[#2A2A2A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/tables')}
          className="text-[#555] hover:text-[#888] transition">
          <ArrowLeft size={18} />
        </button>
        <ChefHat size={20} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold text-base tracking-wide">KDS CUCINA</span>

        <div className="flex items-center gap-4 ml-4 text-xs">
          <span className="text-amber-400">{pendingCount} in attesa</span>
          <span className="text-orange-400">{cookingCount} in prep.</span>
          <span className="text-[#555]">{orders.length} ordini</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button onClick={loadOrders} className="text-[#555] hover:text-[#888] transition">
            <RefreshCw size={14} />
          </button>
          <div className={`flex items-center gap-1 text-xs ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
            {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{isConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">

        {loading && (
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={20} className="animate-spin text-[#555]" />
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <CheckCircle2 size={48} className="text-emerald-500/40" />
            <p className="text-[#555] text-sm">Nessun ordine in coda</p>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {orders.map(order => {
                const oldest = order.items.reduce((min, it) =>
                  !min || new Date(it.sent_at) < new Date(min) ? it.sent_at : min, null)
                const mins = elapsedMinutes(oldest)

                return (
                  <motion.div key={order.order_id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className={`bg-[#1A1A1A] rounded-xl border-2 flex flex-col overflow-hidden ${
                      mins >= 20 ? 'border-red-500/60' :
                      mins >= 10 ? 'border-amber-500/40' :
                                   'border-[#2A2A2A]'
                    }`}>

                    {/* Order header */}
                    <div className={`px-4 py-3 flex items-center justify-between ${
                      mins >= 20 ? 'bg-red-900/20' :
                      mins >= 10 ? 'bg-amber-900/20' :
                                   'bg-[#222]'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-[#F5F5DC] font-bold text-xl">{order.table_number}</span>
                        <span className="text-[#555] text-xs">{order.zone_name}</span>
                      </div>
                      <ElapsedTick sentAt={oldest} />
                    </div>

                    {/* Items */}
                    <div className="flex-1 p-3 flex flex-col gap-2">
                      {order.items.map(item => {
                        const cfg = ITEM_STATUS[item.status] ?? ITEM_STATUS.pending
                        const isUpdating = updating[item.id]
                        return (
                          <div key={item.id}
                            className={`rounded-lg border p-3 flex flex-col gap-2 ${cfg.bg} ${cfg.border}`}>

                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <span className="text-[#F5F5DC] text-sm font-semibold">
                                  {item.quantity > 1 && (
                                    <span className="text-[#D4AF37] mr-1">×{item.quantity}</span>
                                  )}
                                  {item.name}
                                </span>
                                {item.modifiers?.length > 0 && (
                                  <p className="text-[#888] text-xs mt-0.5">
                                    {item.modifiers.join(', ')}
                                  </p>
                                )}
                                {item.notes && (
                                  <p className="text-amber-300 text-xs mt-0.5 italic">
                                    ⚠ {item.notes}
                                  </p>
                                )}
                              </div>
                              <span className={`text-xs font-medium whitespace-nowrap ${cfg.text}`}>
                                {cfg.label}
                              </span>
                            </div>

                            {cfg.next && (
                              <button
                                onClick={() => handleAdvance(item.id, cfg.next)}
                                disabled={isUpdating}
                                className={`w-full py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${
                                  cfg.next === 'ready'
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                    : 'bg-orange-600 hover:bg-orange-500 text-white'
                                } disabled:opacity-50`}>
                                {isUpdating
                                  ? <RefreshCw size={12} className="animate-spin" />
                                  : cfg.nextLabel
                                }
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
