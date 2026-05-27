import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Clock, Check, Timer, X } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { serviceAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

/**
 * ServiceAlertBanner — badge notifica piccolo (NON banner full-width).
 *
 * Storia: in origine era una barra rossa fissata in top-0 left-0 right-0 che
 * occupava ~50px di altezza e bloccava la UI dell'admin. JP 2026-05-26:
 * "fai in modo che i piatti che ci sono in servizio appaiano in piccolo o
 *  in un posto dove ci sia la notifica perche' non mi fa vedere le cose
 *  quando cerco di far qualcosa come admin".
 *
 * Soluzione: badge circolare fixed bottom-right con contatore + bell.
 * Click → dropdown con la lista completa e le azioni "+3min" / "Servito".
 * Stay fuori-vista quando non ci sono alert.
 */
export default function ServiceAlertBanner() {
  const { serviceAlerts, setServiceAlerts } = useSocket()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef(null)

  // Chiudi il dropdown se clicchi fuori.
  useEffect(() => {
    if (!expanded) return
    function onDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [expanded])

  if (!serviceAlerts || serviceAlerts.length === 0) return null

  async function handlePostpone(alertId) {
    try {
      const res = await serviceAPI.postpone(alertId)
      setServiceAlerts(prev => prev.filter(a => a.alertId !== alertId))
      const deferCount = res?.data?.defer_count
      const isLast = deferCount >= 2
      toast({
        type: isLast ? 'warning' : 'info',
        title: isLast ? 'Ultimo posticipo' : 'Posticipato +3 min',
        message: isLast
          ? `Hai gia' posticipato ${deferCount}x. Prossimo: escalation manager.`
          : `Re-allarme tra 3 minuti se non servi.`
      })
    } catch (e) {
      const status = e?.response?.status
      if (status === 409) {
        toast({
          type: 'error',
          title: 'Limite raggiunto',
          message: e?.response?.data?.error || 'Servi adesso o chiama il responsabile.'
        })
      } else {
        toast({ type: 'error', title: 'Errore', message: 'Impossibile posticipare' })
      }
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

  const count = serviceAlerts.length

  return (
    <div ref={panelRef} className="fixed bottom-3 right-3 z-[100]">
      {/* Badge piccolo — sempre visibile quando c'e' >0 alert.
          Tablet (md+): leggermente piu' piccolo per non rubare spazio. */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setExpanded(v => !v)}
        className="relative flex items-center justify-center w-12 h-12 md:w-10 md:h-10 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 transition-colors"
        aria-label={`${count} piatti in attesa di servizio`}
      >
        <Bell className="w-5 h-5 md:w-4 md:h-4 animate-pulse" />
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-black text-[10px] font-bold flex items-center justify-center tnum">
          {count}
        </span>
      </motion.button>

      {/* Dropdown espanso — anch'esso un filo piu' stretto sul tablet */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-14 right-0 w-[320px] md:w-[280px] max-w-[92vw] bg-white border border-red-200 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-2.5 bg-red-600 text-white flex items-center justify-between">
              <span className="font-semibold text-sm flex items-center gap-2">
                <Bell className="w-4 h-4" />
                {count} in attesa di servizio
              </span>
              <button
                onClick={() => setExpanded(false)}
                className="p-1 hover:bg-red-700 rounded transition-colors"
                aria-label="Chiudi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-red-100">
              {serviceAlerts.map(alert => (
                <div key={alert.alertId} className="px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-red-50">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                      alert.isBeverage ? 'bg-purple-500' : 'bg-red-500'
                    }`}>
                      {alert.tableNumber}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">
                        {alert.quantity}x {alert.itemName}
                      </p>
                      <p className="text-[11px] text-red-600 flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        {alert.elapsedMinutes} min
                        {alert.zoneName && <span className="text-slate-500 ml-1">{alert.zoneName}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handlePostpone(alert.alertId)}
                      className="px-2 py-1 text-[11px] font-medium rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors flex items-center gap-1"
                      title="Posticipa +3 min"
                    >
                      <Clock className="w-3 h-3" />
                      +3
                    </button>
                    <button
                      onClick={() => handleServed(alert.itemId, alert.alertId)}
                      className="px-2 py-1 text-[11px] font-medium rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors flex items-center gap-1"
                      title="Servito"
                    >
                      <Check className="w-3 h-3" />
                      OK
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
