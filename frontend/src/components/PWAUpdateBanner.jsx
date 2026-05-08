import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { Button, Card } from './v2'

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
      className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-[90] pointer-events-none"
      style={{ animation: 'slide-up 280ms ease-out' }}
    >
      <Card
        variant="elevated"
        padding="sm"
        className="pointer-events-auto border-[var(--color-gold-ring)] flex items-center gap-3 px-4 py-3 max-w-[360px] sm:max-w-[420px]"
        style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(212,175,55,0.18)' }}
        >
          <Sparkles size={16} className="text-[var(--color-gold)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[var(--color-text)] text-sm font-semibold leading-tight">
            Nuova versione disponibile
          </p>
          <p className="text-[var(--color-text-3)] text-xs leading-snug mt-0.5">
            Aggiorna per ottenere ultime correzioni e migliorie.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          loading={updating}
          leftIcon={!updating && <RefreshCw size={14} />}
          onClick={apply}
          aria-label="Aggiorna applicazione"
        >
          {updating ? 'Aggiorno…' : 'Aggiorna'}
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-[var(--color-text-3)] hover:text-[var(--color-text-2)] text-xs px-1 py-2"
          aria-label="Più tardi"
        >
          dopo
        </button>
      </Card>
    </div>
  )
}
