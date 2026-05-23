import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'

/**
 * PWAUpdateBanner — notifica utente di una nuova versione disponibile.
 *
 * Trigger: main.jsx chiama registerSW(...) di vite-plugin-pwa. Quando il
 * Service Worker rileva un precache aggiornato, invoca onNeedRefresh →
 * dispatch CustomEvent('pwa-need-refresh') + setta window.__SW_UPDATE_AVAILABLE.
 *
 * Quando l'evento arriva (o il flag e' gia' true al mount), mostriamo un
 * banner sticky in basso: copy serif Riva + bottone oro "Aggiorna ora".
 * Click → window.__SW_APPLY_UPDATE() → SW skipWaiting + reload.
 *
 * UX:
 * - Non blocca l'app: l'utente puo' continuare a lavorare e aggiornare quando
 *   gli fa comodo (l'aggiornamento richiede 1-3s di reload)
 * - Posizionato sopra <MobileBottomNav>, animato fade-in/slide-up
 * - Si nasconde se l'utente clicca "Più tardi" (no aggressive popup)
 */
export default function PWAUpdateBanner() {
  const [needsUpdate, setNeedsUpdate] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    // Caso edge: l'evento e' gia' arrivato prima del mount del component
    if (typeof window !== 'undefined' && window.__SW_UPDATE_AVAILABLE) {
      setNeedsUpdate(true)
    }
    const handler = () => setNeedsUpdate(true)
    window.addEventListener('pwa-need-refresh', handler)
    return () => window.removeEventListener('pwa-need-refresh', handler)
  }, [])

  if (!needsUpdate || dismissed) return null

  const apply = () => {
    setUpdating(true)
    if (typeof window.__SW_APPLY_UPDATE === 'function') {
      window.__SW_APPLY_UPDATE()
    } else {
      // Fallback: hard reload (clears stale chunks)
      window.location.reload()
    }
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200]"
      style={{ animation: 'slide-up 280ms ease-out' }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 bg-[var(--color-gold)] text-[#13181C]"
        style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
      >
        <Sparkles size={22} strokeWidth={2.5} className="shrink-0" />
        <p className="flex-1 min-w-0 font-extrabold text-base sm:text-lg uppercase tracking-wide leading-tight">
          Nuova versione — aggiorna per vederla
        </p>
        <button
          type="button"
          onClick={apply}
          disabled={updating}
          className="shrink-0 px-5 py-2.5 rounded-xl bg-[#13181C] text-[var(--color-gold)] font-extrabold text-base uppercase flex items-center gap-2 active:scale-95 disabled:opacity-60"
          aria-label="Aggiorna applicazione"
        >
          {updating ? <RefreshCw size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          {updating ? 'Aggiorno…' : 'Aggiorna'}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 text-[#13181C]/70 hover:text-[#13181C] text-sm font-semibold px-1"
          aria-label="Più tardi"
        >
          dopo
        </button>
      </div>
    </div>
  )
}
