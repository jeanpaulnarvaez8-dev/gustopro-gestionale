import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isPushSupported, pushPermission, subscribePush, wasEverSubscribed } from '../lib/push'

/**
 * NotificationsPrompt — banner inline che propone l'attivazione delle
 * push notifications dopo il login.
 *
 * Logica:
 *  - Se browser non supportato → nasconde.
 *  - Se permission gia' granted o gia' subscribed in passato → silenzioso
 *    auto-resubscribe (idempotente, riallinea il backend al device).
 *  - Se permission denied → nasconde (l'utente ha gia' detto no).
 *  - Se permission default + non subscribed mai → mostra banner con
 *    pulsante "Attiva".
 *  - Dismissibile per sessione (sessionStorage), riappare al prossimo login.
 */
const SESSION_DISMISS = 'gustopro_push_prompt_dismissed'

export default function NotificationsPrompt() {
  const { isAuthenticated } = useAuth()
  const { toast } = useToast()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) return
    if (!isPushSupported()) return

    const perm = pushPermission()
    if (perm === 'denied') return

    // Re-subscribe silenzioso se gia' granted (es. nuovo login → vecchio
    // device → riallinea backend)
    if (perm === 'granted' || wasEverSubscribed()) {
      subscribePush().catch(() => {})
      return
    }

    // Default → mostra banner se non dismissed
    try {
      if (sessionStorage.getItem(SESSION_DISMISS) === '1') return
    } catch {}
    setShow(true)
  }, [isAuthenticated])

  if (!show) return null

  async function handleEnable() {
    setBusy(true)
    const ok = await subscribePush()
    setBusy(false)
    if (ok) {
      toast({ type: 'success', title: '🔔 Notifiche attive', message: 'Riceverai alert anche con app chiusa.' })
      setShow(false)
    } else {
      toast({ type: 'error', title: 'Permesso negato', message: 'Puoi abilitare dalle impostazioni del browser.' })
      setShow(false)
    }
  }

  function dismiss() {
    try { sessionStorage.setItem(SESSION_DISMISS, '1') } catch {}
    setShow(false)
  }

  return (
    <div className="fixed top-3 left-3 right-3 z-[95] md:top-4 md:left-auto md:right-4 md:max-w-md
                    bg-[var(--color-surface)] border border-[var(--color-gold-ring)] rounded-xl shadow-2xl
                    px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-[var(--color-gold-soft)] border border-[var(--color-gold-ring)]
                      flex items-center justify-center text-[var(--color-gold)] shrink-0">
        <Bell size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-text)] font-semibold">Attiva le notifiche</p>
        <p className="text-[11px] text-[var(--color-text-3)]">
          Push native su tablet/telefono per alert servizio anche con app chiusa.
        </p>
      </div>
      <button
        onClick={handleEnable}
        disabled={busy}
        className="px-3 py-1.5 rounded-md bg-[var(--color-gold)] text-[#13181C] text-xs font-bold hover:brightness-110 disabled:opacity-50 shrink-0"
      >
        {busy ? '…' : 'Attiva'}
      </button>
      <button
        onClick={dismiss}
        className="text-[var(--color-text-3)] hover:text-[var(--color-text)] p-1 shrink-0"
        aria-label="Chiudi"
      >
        <X size={16} />
      </button>
    </div>
  )
}
