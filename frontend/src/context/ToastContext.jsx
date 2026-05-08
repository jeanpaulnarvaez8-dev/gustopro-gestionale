/**
 * ToastContext — adapter retro-compatibile sopra components/v2/Toast.
 *
 * Storia: la v1 dell'app aveva il proprio sistema toast (palette emerald/red/
 * amber/blue, framer-motion, viewport in alto a destra). Phase 1 ha introdotto
 * il design system v2 con palette Riva (gold/sea/pine/...) e una nuova API
 * `useToast()` con helpers `toast.success(msg)` / `toast.error(msg)` / ...
 *
 * Migrare i 24 file consumatori uno-a-uno avrebbe richiesto effort senza
 * benefici visibili: il rendering finale e' gia' identico (l'adapter delega
 * al provider v2). Quindi questo file mantiene la API vecchia
 *
 *   const { toast } = useToast()
 *   toast({ type: 'error', title: 'X', message: 'Y' })
 *
 * traducendola in chiamate al provider v2:
 *
 *   v2.show({ tone: 'error', title: 'X', text: 'Y' })
 *
 * Bonus: l'oggetto toast espone ANCHE i metodi v2 nativi (.success, .error,
 * .warn, .info, .gold, .dismiss), cosi' il codice nuovo puo' usarli senza
 * importare nulla in piu'. La migrazione progressiva resta opzionale.
 */
import { useMemo } from 'react'
import { useToast as useV2Toast, ToastProvider as V2ToastProvider } from '../components/v2/Toast'

// Re-export del Provider v2 (un unico provider per tutta l'app, gia' montato
// in App.jsx; main.jsx lo mantiene per compat ma e' idempotente).
export { V2ToastProvider as ToastProvider }

// Map type vecchio → tone v2.
const TYPE_TO_TONE = {
  success: 'success',
  error:   'error',
  warning: 'warn',
  warn:    'warn',
  info:    'info',
}

export function useToast() {
  const v2 = useV2Toast()

  // CRITICO: `toast` deve avere identita' stabile tra render altrimenti
  // i consumer che lo mettono in useCallback([toast])/useEffect([toast])
  // entrano in infinite re-render loop. Esempio reale dove e' successo:
  // StaffPerformancePage 2026-05-08 → 3+ richieste API "pending forever"
  // perche' load(useCallback) cambiava ogni render.
  const toast = useMemo(() => {
    function toastFn(arg) {
      if (typeof arg === 'string') {
        return v2.info(arg)
      }
      const { type = 'info', title, message, text, duration } = arg || {}
      const tone = TYPE_TO_TONE[type] || 'info'
      return v2.show({ tone, title, text: text ?? message, duration })
    }
    // Helpers diretti (per code nuovo che vuole API v2 senza re-import)
    toastFn.show    = v2.show
    toastFn.dismiss = v2.dismiss
    toastFn.success = v2.success
    toastFn.error   = v2.error
    toastFn.warn    = v2.warn
    toastFn.warning = v2.warn // alias retro-compat
    toastFn.info    = v2.info
    toastFn.gold    = v2.gold
    return toastFn
  }, [v2])

  // L'oggetto wrapper {toast} non puo' essere lo stesso useMemo perche' i
  // consumer fanno destructuring: ogni destructure va bene quanto la
  // reference di `toast` interno e' stabile.
  return { toast }
}
