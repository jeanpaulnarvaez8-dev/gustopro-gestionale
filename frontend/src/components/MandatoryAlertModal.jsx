import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Zap, Clock, X } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { useToast } from '../context/ToastContext'
import { workflowAPI } from '../lib/api'

const DEFER_OPTIONS = [
  { minutes: 2, label: '2 min' },
  { minutes: 3, label: '3 min' },
  { minutes: 5, label: '5 min' },
]

export default function MandatoryAlertModal() {
  const { socket } = useSocket()
  const { toast } = useToast()
  const [alerts, setAlerts] = useState([])
  const [responding, setResponding] = useState(false)
  const [customMinutes, setCustomMinutes] = useState('')

  const loadAlerts = useCallback(async () => {
    try {
      const res = await workflowAPI.getPendingAlerts()
      setAlerts(res.data)
    } catch { /* silenzioso */ }
  }, [])

  useEffect(() => { loadAlerts() }, [loadAlerts])

  // Polling ogni 30s + socket
  useEffect(() => {
    const id = setInterval(loadAlerts, 30000)
    return () => clearInterval(id)
  }, [loadAlerts])

  useEffect(() => {
    if (!socket) return
    const onAlert = () => loadAlerts()
    socket.on('mandatory-course-alert', onAlert)
    socket.on('service-alert', onAlert)
    return () => {
      socket.off('mandatory-course-alert', onAlert)
      socket.off('service-alert', onAlert)
    }
  }, [socket, loadAlerts])

  const handleRelease = async (alertId) => {
    setResponding(true)
    try {
      await workflowAPI.respondToAlert(alertId, 'release')
      toast({ type: 'success', title: 'Portata sbloccata', message: 'Inviata in produzione' })
      loadAlerts()
    } catch {
      toast({ type: 'error', title: 'Errore sblocco' })
    } finally {
      setResponding(false)
    }
  }

  const handleDefer = async (alertId, minutes) => {
    setResponding(true)
    try {
      await workflowAPI.respondToAlert(alertId, 'defer', minutes)
      toast({ type: 'info', title: `Rinviato di ${minutes} min` })
      loadAlerts()
    } catch {
      toast({ type: 'error', title: 'Errore rinvio' })
    } finally {
      setResponding(false)
    }
  }

  const currentAlert = alerts[0]
  if (!currentAlert) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ y: 20, scale: 0.95 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 20, scale: 0.95 }}
          className="bg-[#222] border-2 border-amber-500/50 rounded-2xl w-full max-w-sm shadow-xl shadow-amber-500/10"
        >
          {/* Header */}
          <div className="px-5 py-4 bg-amber-900/20 rounded-t-2xl flex items-center gap-3 border-b border-amber-500/30">
            <AlertTriangle size={24} className="text-amber-400 flex-shrink-0" />
            <div>
              <h3 className="text-[#F5F5DC] font-bold text-base">Portata successiva</h3>
              <p className="text-amber-400/80 text-xs">Scegli: libera o rinvia</p>
            </div>
            {alerts.length > 1 && (
              <span className="ml-auto text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full font-bold">
                +{alerts.length - 1}
              </span>
            )}
          </div>

          {/* Alert info */}
          <div className="px-5 py-4 space-y-3">
            <div className="bg-[#1A1A1A] rounded-xl p-4 border border-[#333]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#F5F5DC] font-bold text-lg">{currentAlert.table_number}</span>
                <span className="text-[#555] text-xs">{currentAlert.zone_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-bold text-xs bg-amber-900/40 px-1.5 py-0.5 rounded">A</span>
                <span className="text-[#F5F5DC] text-sm font-semibold">
                  {currentAlert.quantity > 1 && <span className="text-amber-400 mr-1">x{currentAlert.quantity}</span>}
                  {currentAlert.item_name}
                </span>
              </div>
              {currentAlert.defer_count > 0 && (
                <p className="text-red-400/80 text-[10px] mt-2">
                  Gia' rinviato {currentAlert.defer_count} volt{currentAlert.defer_count === 1 ? 'a' : 'e'}
                </p>
              )}
            </div>

            {/* Action: Libera adesso */}
            <button
              onClick={() => handleRelease(currentAlert.id)}
              disabled={responding}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Zap size={16} /> Libera adesso
            </button>

            {/* Action: Rinvia */}
            <div className="space-y-2">
              <p className="text-[#888] text-xs text-center">oppure rinvia di:</p>
              <div className="flex gap-2">
                {DEFER_OPTIONS.map(opt => (
                  <button key={opt.minutes}
                    onClick={() => handleDefer(currentAlert.id, opt.minutes)}
                    disabled={responding}
                    className="flex-1 py-2.5 rounded-xl bg-[#333] hover:bg-[#444] text-[#F5F5DC] font-medium text-sm flex items-center justify-center gap-1 transition disabled:opacity-50"
                  >
                    <Clock size={12} /> {opt.label}
                  </button>
                ))}
              </div>
              {/* Custom */}
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={customMinutes}
                  onChange={e => setCustomMinutes(e.target.value)}
                  placeholder="min"
                  className="flex-1 bg-[#2A2A2A] border border-[#444] rounded-xl px-3 py-2 text-[#F5F5DC] text-sm text-center placeholder-[#555]"
                />
                <button
                  onClick={() => {
                    const m = parseInt(customMinutes)
                    if (m > 0 && m <= 30) {
                      handleDefer(currentAlert.id, m)
                      setCustomMinutes('')
                    }
                  }}
                  disabled={responding || !customMinutes || parseInt(customMinutes) <= 0}
                  className="px-4 py-2 rounded-xl bg-[#333] hover:bg-[#444] text-[#F5F5DC] text-sm font-medium disabled:opacity-30 transition"
                >
                  Rinvia
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
