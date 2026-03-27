import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Clock, ChevronDown, ChevronUp, Check, Timer } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { serviceAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

export default function ServiceAlertBanner() {
  const { serviceAlerts, setServiceAlerts } = useSocket()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)

  if (!serviceAlerts || serviceAlerts.length === 0) return null

  async function handlePostpone(alertId) {
    try {
      await serviceAPI.postpone(alertId)
      setServiceAlerts(prev => prev.filter(a => a.alertId !== alertId))
      toast({ type: 'info', title: 'Posticipato', message: 'Alert posticipato di 5 minuti' })
    } catch {
      toast({ type: 'error', title: 'Errore', message: 'Impossibile posticipare' })
    }
  }

  async function handleServed(itemId, alertId) {
    try {
      await serviceAPI.markServed(itemId)
      setServiceAlerts(prev => prev.filter(a => a.alertId !== alertId))
      toast({ type: 'success', title: 'Servito', message: 'Piatto marcato come servito' })
    } catch {
      toast({ type: 'error', title: 'Errore', message: 'Impossibile aggiornare' })
    }
  }

  return (
    <motion.div
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-[100]"
    >
      {/* Header banner */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-red-600 text-white shadow-lg"
      >
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 animate-pulse" />
          <span className="font-semibold text-sm">
            {serviceAlerts.length} piatt{serviceAlerts.length === 1 ? 'o' : 'i'} in attesa di servizio
          </span>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>

      {/* Lista alert espansa */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-50 border-b-2 border-red-200 shadow-lg overflow-hidden"
          >
            <div className="max-h-60 overflow-y-auto divide-y divide-red-100">
              {serviceAlerts.map(alert => (
                <div key={alert.alertId} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                      alert.isBeverage ? 'bg-purple-500' : 'bg-red-500'
                    }`}>
                      {alert.tableNumber}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {alert.quantity}× {alert.itemName}
                      </p>
                      <p className="text-xs text-red-600 flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        {alert.elapsedMinutes} min in attesa
                        {alert.zoneName && <span className="text-slate-500 ml-1">· {alert.zoneName}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handlePostpone(alert.alertId)}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors flex items-center gap-1"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      +5 min
                    </button>
                    <button
                      onClick={() => handleServed(alert.itemId, alert.alertId)}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-100 text-green-700 hover:bg-green-200 transition-colors flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Servito
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
