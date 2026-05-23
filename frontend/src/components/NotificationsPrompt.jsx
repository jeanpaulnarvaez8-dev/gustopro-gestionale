import { useEffect, useState, useRef } from 'react'
import { Bell, X, Volume2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isPushSupported, pushPermission, subscribePush } from '../lib/push'
import { unlockAudio, playNewOrderBeep, setSoundEnabled } from '../lib/kdsBeep'

/**
 * NotificationsPrompt — banner OBBLIGATORIO ad ogni accesso che richiede
 * consenso a notifiche + audio. Senza questo il personale non sente
 * gli alert su tablet/telefono.
 *
 * Logica (richiesta operativa Riva 2026-05-19):
 *  - Compare a OGNI login (non dismissible per sessione persistente).
 *  - Click "Attiva": richiede permission push + sblocca audio + ATTIVA
 *    audio in localStorage (se utente lo aveva spento prima).
 *  - "Continua senza" lo nasconde solo per questa sessione corrente
 *    (ricompare al prossimo login).
 *  - Plus: ad ogni click "Attiva" facciamo playNewOrderBeep di test
 *    per confermare audio funzionante (e per sbloccare audio context).
 */
const SESSION_DISMISS = 'gustopro_push_prompt_dismissed_v2'

export default function NotificationsPrompt() {
  const { isAuthenticated, user } = useAuth()
  const { toast } = useToast()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  // Tracciamo l'utente loggato corrente: a ogni cambio user.id, resettiamo
  // il flag dismiss → il banner riappare al nuovo login.
  const lastUserIdRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) {
      lastUserIdRef.current = null
      return
    }
    // Nuovo utente loggato? Reset dismiss + ripropone banner.
    if (user?.id && lastUserIdRef.current !== user.id) {
      lastUserIdRef.current = user.id
      try { sessionStorage.removeItem(SESSION_DISMISS) } catch {}
    }

    if (!isPushSupported()) {
      // Browser senza push API: comunque chiediamo conferma audio
      // (es. iOS Safari non-PWA) → unlock audio context al click.
      try {
        if (sessionStorage.getItem(SESSION_DISMISS) === '1') return
      } catch {}
      setShow(true)
      return
    }

    const perm = pushPermission()
    // Anche se gia' granted/denied, mostriamo il banner UNA volta per
    // sessione per: (a) sbloccare audio dopo refresh, (b) ricordare al
    // personale che gli alert suonano. "Continua" lo nasconde per la
    // sessione corrente.
    try {
      if (sessionStorage.getItem(SESSION_DISMISS) === '1') return
    } catch {}

    // Se permission already granted, prova auto-subscribe silente.
    // Comunque mostra banner per audio unlock.
    if (perm === 'granted') {
      subscribePush().catch(() => {})
    }
    setShow(true)
  }, [isAuthenticated, user?.id])

  if (!show) return null

  async function handleEnable() {
    setBusy(true)
    // 1. Sblocca audio context (alcuni browser richiedono user gesture)
    try { unlockAudio() } catch {}
    // 2. Forza audio ON in localStorage (anche se prima era off)
    try { setSoundEnabled(true) } catch {}
    // 3. Beep test (conferma audio + sblocca audio context su iOS)
    try { playNewOrderBeep() } catch {}

    // 4. Permessi push
    const ok = await subscribePush()
    setBusy(false)
    if (ok) {
      toast({ type: 'success', title: '🔔 Notifiche + audio attivi', message: 'Riceverai alert con suono anche con app chiusa.' })
    } else {
      toast({ type: 'warning', title: '🔊 Solo audio attivo', message: 'Push native non disponibili (browser/iOS) ma gli alert suoneranno.' })
    }
    try { sessionStorage.setItem(SESSION_DISMISS, '1') } catch {}
    setShow(false)
  }

  function continueWithout() {
    // Anche se l'utente clicca "continua", sblocchiamo audio + abilitiamo
    // suono (e' richiesta operativa: gli alert DEVONO suonare).
    try { unlockAudio() } catch {}
    try { setSoundEnabled(true) } catch {}
    try { playNewOrderBeep() } catch {}
    try { sessionStorage.setItem(SESSION_DISMISS, '1') } catch {}
    setShow(false)
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
      <div className="bg-[var(--color-surface)] border-2 border-[var(--color-gold)] rounded-2xl p-5 max-w-md w-full shadow-2xl">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-gold-soft)] border border-[var(--color-gold-ring)] flex items-center justify-center text-[var(--color-gold)] shrink-0">
            <Bell size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="serif font-bold text-lg text-[var(--color-text)]">Attiva audio e notifiche</h3>
            <p className="text-xs text-[var(--color-text-3)] mt-1">
              Gli alert di servizio (piatto pronto, presa comanda, sbarazzo) suoneranno sul tuo device.
              <br />Senza audio attivo, rischi di non sentire le notifiche.
            </p>
          </div>
        </div>

        <ul className="text-xs text-[var(--color-text-2)] space-y-1 ml-1 my-3">
          <li className="flex items-center gap-2"><Volume2 size={12} className="text-[var(--color-gold)] shrink-0"/> Beep audio per ogni nuovo ordine</li>
          <li className="flex items-center gap-2"><Bell size={12} className="text-[var(--color-gold)] shrink-0"/> Push native (anche con app chiusa)</li>
          <li className="flex items-center gap-2"><span className="text-[var(--color-gold)] shrink-0">⏰</span> Alert con suono per ritardi servizio</li>
        </ul>

        <p className="text-sm text-center font-bold text-[var(--color-warn)] mt-2 mb-3">
          ⚠️ Senza attivare NON ricevi i piatti pronti dalla cucina!
        </p>
        <button
          onClick={handleEnable}
          disabled={busy}
          className="w-full px-4 py-4 rounded-xl bg-[var(--color-gold)] text-[#13181C] text-lg font-extrabold uppercase tracking-wide disabled:opacity-50 hover:brightness-110 active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          {busy ? '…' : (<><Bell size={20}/> Attiva notifiche</>)}
        </button>
        <p className="text-[11px] text-center text-[var(--color-text-3)] mt-2">
          Il browser ti chiederà conferma — tocca <b>Consenti</b>.
        </p>
        <button
          onClick={continueWithout}
          disabled={busy}
          className="w-full text-center text-[var(--color-text-3)] hover:text-[var(--color-text-2)] text-xs mt-3 disabled:opacity-50"
        >
          continua senza (sconsigliato)
        </button>
      </div>
    </div>
  )
}
