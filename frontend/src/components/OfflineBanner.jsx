import { useState, useEffect } from 'react'
import { WifiOff, CloudUpload, AlertTriangle } from 'lucide-react'
import { countPending, db } from '../lib/offlineDB'

// Banner globale che mostra:
//   - "Offline" quando navigator.onLine = false
//   - "N ordini in coda da sincronizzare" se ci sono record pending
//   - Si aggiorna in tempo reale via Dexie hook (db.pendingActions.hook('creating'/'deleting'))
// Stile sobrio: barra fissa in cima alla viewport, bordo ambra/giallo, icona.

export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    // Polling iniziale + ogni 5s come fallback (Dexie hooks coprono il real-time
    // quando lo stesso tab fa enqueue, ma altri tab non emettono evento).
    const refresh = async () => {
      try { setPending(await countPending()) } catch {}
    }
    refresh()
    const t = setInterval(refresh, 5000)

    // Hook diretti su Dexie per real-time same-tab
    const onCreate = () => setPending((c) => c + 1)
    const onDelete = () => setPending((c) => Math.max(0, c - 1))
    db.pendingActions.hook('creating', onCreate)
    db.pendingActions.hook('deleting', onDelete)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      clearInterval(t)
      db.pendingActions.hook('creating').unsubscribe(onCreate)
      db.pendingActions.hook('deleting').unsubscribe(onDelete)
    }
  }, [])

  // Niente banner se siamo online E queue vuota
  if (online && pending === 0) return null

  const palette = !online
    ? { bg: 'bg-red-950/90', border: 'border-red-700', text: 'text-red-200', icon: WifiOff, label: 'Offline' }
    : { bg: 'bg-amber-950/90', border: 'border-amber-700', text: 'text-amber-100', icon: CloudUpload, label: 'Sincronizzazione in attesa' }

  const Icon = palette.icon

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 inset-x-0 z-[60] ${palette.bg} ${palette.border} border-b backdrop-blur-sm`}
    >
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center gap-2 text-xs">
        <Icon size={14} className={palette.text} />
        <span className={`${palette.text} font-medium`}>{palette.label}</span>
        {pending > 0 && (
          <>
            <span className="text-[#666]">·</span>
            <span className={palette.text}>
              <strong>{pending}</strong> ordini in coda
            </span>
          </>
        )}
        {!online && pending === 0 && (
          <span className="text-[#999] hidden sm:inline">— gli ordini verranno salvati e sincronizzati al ritorno della rete</span>
        )}
        {!online && (
          <AlertTriangle size={12} className="ml-auto text-amber-400" />
        )}
      </div>
    </div>
  )
}
