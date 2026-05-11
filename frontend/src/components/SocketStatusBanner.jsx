import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { useToast } from '../context/ToastContext'

/**
 * SocketStatusBanner — banner sticky che mostra stato di riconnessione.
 *
 * Comportamento:
 *  - Online stable → nessun banner
 *  - Offline da 0-3s → nessun banner (false positive di network flicker)
 *  - Offline da >3s  → banner sticky in alto "Riconnessione in corso..."
 *                      con spinner che gira (animation infinite)
 *  - Riconnesso dopo offline → toast verde "Connesso ✓" + banner svanisce
 *
 * Posizione: top: 0 sticky, sopra tutto (z-index 70).
 * Mobile-friendly: compatto, no h padding inutile.
 */
export default function SocketStatusBanner() {
  const { isConnected } = useSocket()
  const { toast } = useToast()
  const [showBanner, setShowBanner] = useState(false)
  const [wasDisconnected, setWasDisconnected] = useState(false)

  useEffect(() => {
    if (isConnected) {
      // Era offline e ora torna online → toast success
      if (wasDisconnected) {
        toast({ type: 'success', title: '🟢 Connessione ripristinata', duration: 2500 })
        setWasDisconnected(false)
      }
      setShowBanner(false)
      return
    }
    // Disconnesso: aspetta 3s prima di mostrare banner (evita falsi positivi)
    const timer = setTimeout(() => {
      setShowBanner(true)
      setWasDisconnected(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [isConnected, wasDisconnected, toast])

  if (!showBanner) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[70] flex items-center justify-center gap-2 py-2 px-4 bg-[var(--color-err)] text-white text-xs font-semibold shadow-lg"
      style={{ animation: 'slide-up 200ms ease-out' }}
      role="status"
      aria-live="polite"
    >
      <RefreshCw size={14} className="animate-spin" />
      <span>Riconnessione in corso…</span>
      <WifiOff size={13} className="opacity-70 ml-1" />
    </div>
  )
}
