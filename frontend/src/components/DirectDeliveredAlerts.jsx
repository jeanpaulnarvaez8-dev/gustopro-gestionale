import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, PackageCheck, X } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { workflowAPI } from '../lib/api'

export default function DirectDeliveredAlerts() {
  const { socket } = useSocket()
  const [alerts, setAlerts] = useState([])
  const [dismissed, setDismissed] = useState(new Set())

  const loadAlerts = useCallback(async () => {
    try {
      const res = await workflowAPI.getDirectDelivered()
      // Mostra solo le ultime 24h
      const cutoff = Date.now() - 24 * 60 * 60 * 1000
      setAlerts(res.data.filter(a => new Date(a.created_at).getTime() > cutoff))
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadAlerts() }, [loadAlerts])

  useEffect(() => {
    if (!socket) return
    const onAlert = (data) => {
      // Aggiungi alert in tempo reale
      setAlerts(prev => [{
        id: data.itemId,
        user_name: data.waiterName,
        metadata: { item_name: data.itemName, quantity: data.quantity },
        created_at: data.timestamp,
        table_number: data.tableNumber,
        action: 'direct_delivered',
      }, ...prev])
    }
    socket.on('direct-delivered-alert', onAlert)
    return () => socket.off('direct-delivered-alert', onAlert)
  }, [socket])

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id))
  if (visibleAlerts.length === 0) return null

  // JP 2026-05-26: "fai vedere le notifiche piccole nel tablet perche se no
  // e' troppo grande". Su tablet (md+) compattiamo: meno alert visibili
  // contemporanei, padding minore, font piu' piccolo. Mobile resta come prima.
  return (
    <div className="fixed top-3 right-3 z-[90] flex flex-col gap-1.5 max-w-[280px] md:max-w-[220px]">
      <AnimatePresence>
        {visibleAlerts.slice(0, 3).map(alert => (
          <motion.div key={alert.id}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            className="bg-[#2A2A2A] border border-red-500/40 rounded-lg p-2 md:p-1.5 shadow-lg shadow-red-900/20 flex items-start gap-2"
          >
            <PackageCheck size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-red-400 text-[10px] font-bold">CONSEGNATO DIRETTO</p>
              <p className="text-[#F5F5DC] text-xs font-semibold mt-0.5 truncate">
                {alert.metadata?.quantity > 1 && <span className="text-red-400">x{alert.metadata?.quantity} </span>}
                {alert.metadata?.item_name || 'Item'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-[#888] truncate">
                <span>T.{alert.table_number}</span>
                <span>·</span>
                <span className="truncate">{alert.user_name}</span>
                <span>·</span>
                <span>{new Date(alert.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            <button onClick={() => setDismissed(prev => new Set([...prev, alert.id]))}
              className="text-[#555] hover:text-[#888] transition flex-shrink-0">
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
