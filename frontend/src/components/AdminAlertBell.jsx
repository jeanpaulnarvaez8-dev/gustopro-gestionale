import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellOff, Timer, PackageCheck, Check, Clock, X } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { serviceAPI, workflowAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

/**
 * AdminAlertBell — campanella unificata SOLO per admin.
 *
 * JP 2026-05-27: "le notifiche non farle arrivare al admin perche fanno
 *  impazzire, crea meglio un simbolo tipo campanella e se voglio vederle
 *  li schiaccio. Non che appargano cosi perche da fastidio al admin".
 *
 * Sostituisce ServiceAlertBanner + DirectDeliveredAlerts per il ruolo admin.
 * - Bottoncino campanella sempre presente in basso-destra (no pulse).
 * - Counter totale (service alerts + direct delivered ultime 24h).
 * - Click → dropdown con due sezioni:
 *     1) Piatti in attesa di servizio (con +3min / Servito)
 *     2) Consegne dirette degli ultimi (dismiss locale)
 * - Click fuori → chiude.
 *
 * Gli altri ruoli (waiter, manager, cashier, kitchen) continuano a vedere
 * i pop-up automatici come prima — sono operativi e quegli alert li
 * richiedono on-screen.
 */
export default function AdminAlertBell() {
  const { serviceAlerts, setServiceAlerts } = useSocket()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [directAlerts, setDirectAlerts] = useState([])
  const [dismissed, setDismissed] = useState(new Set())
  const panelRef = useRef(null)

  // Carica direct-delivered alerts una volta + refresh ogni 60s.
  const loadDirect = useCallback(async () => {
    try {
      const res = await workflowAPI.getDirectDelivered()
      const cutoff = Date.now() - 24 * 60 * 60 * 1000
      setDirectAlerts(res.data.filter(a => new Date(a.created_at).getTime() > cutoff))
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadDirect() }, [loadDirect])
  useEffect(() => {
    const id = setInterval(loadDirect, 60_000)
    return () => clearInterval(id)
  }, [loadDirect])

  // Click outside chiude il dropdown
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
          ? `Gia' posticipato ${deferCount}x.`
          : `Re-allarme tra 3 minuti.`
      })
    } catch (e) {
      const status = e?.response?.status
      if (status === 409) {
        toast({ type: 'error', title: 'Limite raggiunto', message: e?.response?.data?.error || 'Servi adesso.' })
      } else {
        toast({ type: 'error', title: 'Errore', message: 'Impossibile posticipare' })
      }
    }
  }

  async function handleServed(itemId, alertId) {
    try {
      await serviceAPI.markServed(itemId)
      setServiceAlerts(prev => prev.filter(a => a.alertId !== alertId))
      toast({ type: 'success', title: 'Servito' })
    } catch {
      toast({ type: 'error', title: 'Errore' })
    }
  }

  const serviceCount = serviceAlerts?.length || 0
  const directVisible = directAlerts.filter(a => !dismissed.has(a.id))
  const directCount = directVisible.length
  const totalCount = serviceCount + directCount

  return (
    <div ref={panelRef} className="fixed bottom-3 right-3 z-[100]">
      {/* Bell sempre visibile (anche con 0 alert) — l'admin sa dove cercare.
          NO pulse: e' un simbolo passivo, non un alert intrusivo. */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setExpanded(v => !v)}
        className={`relative flex items-center justify-center w-11 h-11 md:w-9 md:h-9 rounded-full shadow-lg transition-colors ${
          totalCount > 0
            ? 'bg-[var(--color-gold)] text-[#13181C] hover:brightness-110'
            : 'bg-[var(--color-surface-2)] text-[var(--color-text-3)] border border-[var(--color-border-strong)] hover:text-[var(--color-text)]'
        }`}
        aria-label={`Notifiche admin: ${totalCount}`}
      >
        {totalCount > 0 ? <Bell className="w-4 h-4 md:w-3.5 md:h-3.5" /> : <BellOff className="w-4 h-4 md:w-3.5 md:h-3.5" />}
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tnum">
            {totalCount}
          </span>
        )}
      </motion.button>

      {/* Dropdown unificato */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-14 right-0 w-[340px] md:w-[300px] max-w-[92vw] bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-2.5 bg-[var(--color-surface-2)] border-b border-[var(--color-border-soft)] flex items-center justify-between">
              <span className="font-semibold text-[var(--color-text)] text-sm flex items-center gap-2">
                <Bell className="w-4 h-4 text-[var(--color-gold)]" />
                Notifiche · {totalCount}
              </span>
              <button
                onClick={() => setExpanded(false)}
                className="p-1 text-[var(--color-text-3)] hover:text-[var(--color-text)] transition-colors"
                aria-label="Chiudi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {totalCount === 0 && (
                <div className="px-4 py-8 text-center text-[var(--color-text-3)] text-sm">
                  Nessuna notifica al momento.
                </div>
              )}

              {/* Sezione 1: piatti in attesa di servizio */}
              {serviceCount > 0 && (
                <div>
                  <div className="px-3 py-1.5 bg-red-50/5 text-red-400 text-[10px] font-bold tracking-wider border-b border-red-500/20">
                    IN ATTESA DI SERVIZIO ({serviceCount})
                  </div>
                  <div className="divide-y divide-[var(--color-border-soft)]">
                    {serviceAlerts.map(alert => (
                      <div key={alert.alertId} className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-[var(--color-surface-2)]">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${
                            alert.isBeverage ? 'bg-purple-500' : 'bg-red-500'
                          }`}>
                            {alert.tableNumber}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-[var(--color-text)] truncate">
                              {alert.quantity}x {alert.itemName}
                            </p>
                            <p className="text-[10px] text-red-400 flex items-center gap-1">
                              <Timer className="w-3 h-3" />
                              {alert.elapsedMinutes} min
                              {alert.zoneName && <span className="text-[var(--color-text-3)] ml-1">{alert.zoneName}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => handlePostpone(alert.alertId)}
                            className="px-2 py-1 text-[10px] font-medium rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors flex items-center gap-1"
                            title="Posticipa +3 min"
                          >
                            <Clock className="w-3 h-3" />
                            +3
                          </button>
                          <button
                            onClick={() => handleServed(alert.itemId, alert.alertId)}
                            className="px-2 py-1 text-[10px] font-medium rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors flex items-center gap-1"
                            title="Servito"
                          >
                            <Check className="w-3 h-3" />
                            OK
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sezione 2: consegne dirette */}
              {directCount > 0 && (
                <div>
                  <div className="px-3 py-1.5 bg-orange-50/5 text-orange-400 text-[10px] font-bold tracking-wider border-b border-orange-500/20">
                    CONSEGNATI DIRETTAMENTE ({directCount})
                  </div>
                  <div className="divide-y divide-[var(--color-border-soft)]">
                    {directVisible.slice(0, 20).map(alert => (
                      <div key={alert.id} className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-[var(--color-surface-2)]">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <PackageCheck className="w-4 h-4 text-orange-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-[var(--color-text)] truncate">
                              {alert.metadata?.quantity > 1 && <span className="text-orange-400">x{alert.metadata?.quantity} </span>}
                              {alert.metadata?.item_name || 'Item'}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-3)] truncate">
                              T.{alert.table_number} · {alert.user_name} · {new Date(alert.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setDismissed(prev => new Set([...prev, alert.id]))}
                          className="text-[var(--color-text-3)] hover:text-[var(--color-text)] p-1 transition-colors"
                          aria-label="Nascondi"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
