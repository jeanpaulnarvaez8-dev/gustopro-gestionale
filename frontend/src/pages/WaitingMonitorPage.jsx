import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Clock, RefreshCw, Wifi, WifiOff, ChefHat, Zap } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { workflowAPI } from '../lib/api'

function formatWaitTime(seconds) {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}min`
}

function waitColor(seconds) {
  const mins = seconds / 60
  if (mins < 5) return 'text-emerald-400'
  if (mins < 15) return 'text-amber-400'
  return 'text-red-400'
}

export default function WaitingMonitorPage() {
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()
  const { toast } = useToast()
  const { user } = useAuth()
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
    <div className="min-h-screen bg-[#111] flex flex-col">

      {/* Header */}
      <header className="bg-[#1A1A1A] border-b border-[#2A2A2A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-[#555] hover:text-[#888] transition">
          <ArrowLeft size={18} />
        </button>
        <Clock size={20} className="text-amber-400" />
        <span className="text-[#F5F5DC] font-bold text-base tracking-wide">MONITOR ATTESE</span>
        <span className="text-amber-400 text-xs ml-2">{totalWaiting} voci in attesa</span>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={loadData} className="text-[#555] hover:text-[#888] transition">
            <RefreshCw size={14} />
          </button>
          <div className={`flex items-center gap-1 text-xs ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
            {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
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
            <Clock size={48} className="text-emerald-500/40" />
            <p className="text-[#555] text-sm">Nessuna voce in attesa</p>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {orders.map(order => (
                <motion.div key={order.order_id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-[#1A1A1A] rounded-xl border-2 border-amber-500/30 flex flex-col overflow-hidden">

                  {/* Header ordine */}
                  <div className="px-4 py-3 bg-amber-900/15 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[#F5F5DC] font-bold text-xl">{order.table_number}</span>
                      {order.zone_name && <span className="text-[#555] text-xs">{order.zone_name}</span>}
                    </div>
                    <div className="text-right">
                      <span className="text-[#888] text-xs block">{order.waiter_name}</span>
                      {order.covers && <span className="text-[#555] text-[10px]">{order.covers} pers.</span>}
                    </div>
                  </div>

                  {/* Items in attesa */}
                  <div className="flex-1 p-3 flex flex-col gap-2">
                    {order.items.map(item => (
                      <div key={item.id}
                        className="rounded-lg border border-amber-500/30 bg-amber-900/10 p-3 flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-amber-400 bg-amber-900/40 px-1.5 py-0.5 rounded">A</span>
                            <span className="text-[#F5F5DC] font-semibold text-sm">
                              {item.quantity > 1 && <span className="text-amber-400 mr-1">x{item.quantity}</span>}
                              {item.name}
                            </span>
                          </div>
                          {item.course_type && item.course_type !== 'altro' && (
                            <span className="text-[9px] text-[#888] mt-0.5 block">{item.course_type}</span>
                          )}
                          {item.notes && (
                            <span className="text-amber-300/70 text-[10px] italic mt-0.5 block">{item.notes}</span>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={`text-xs font-mono ${waitColor(item.seconds_waiting)}`}>
                            {formatWaitTime(item.seconds_waiting)}
                          </span>
                        </div>
                      </div>
                    ))}
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
