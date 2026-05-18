import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

/**
 * InstallPrompt — banner "Installa app" che usa il PWA beforeinstallprompt.
 *
 * Logica:
 *  1. Browser supportato (Chrome/Edge Android/desktop) emette
 *     `beforeinstallprompt` quando il sito e' eligible (manifest valido +
 *     SW + servito su HTTPS). Salviamo l'event per innescarlo on-click.
 *  2. Banner appare solo se non gia' installato e non dismissed in sessione.
 *  3. iOS Safari NON supporta beforeinstallprompt → fallback istruzioni
 *     "Aggiungi a Home" (Share → Add to Home Screen).
 *  4. Dopo install (event `appinstalled`), banner sparisce permanente.
 */
const STORAGE_KEY = 'gustopro_install_dismissed'

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}
function isInStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
         window.navigator.standalone === true
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  useEffect(() => {
    if (isInStandaloneMode()) return // gia' installata
    function onBeforeInstall(e) {
      e.preventDefault()
      setDeferred(e)
    }
    function onInstalled() {
      setDeferred(null)
      try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (isInStandaloneMode() || dismissed) return null

  // iOS: niente prompt nativo, mostra istruzioni manuali
  const ios = isIOS()
  if (!deferred && !ios) return null

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
  }

  async function handleInstall() {
    if (ios) {
      setShowIOSHelp(true)
      return
    }
    if (!deferred) return
    try {
      deferred.prompt()
      const choice = await deferred.userChoice
      if (choice?.outcome === 'accepted') dismiss()
      setDeferred(null)
    } catch {
      dismiss()
    }
  }

  return (
    <>
      <div className="fixed bottom-3 left-3 right-3 z-[90] md:bottom-4 md:left-auto md:right-4 md:max-w-sm
                      bg-[var(--color-surface)] border border-[var(--color-gold-ring)] rounded-xl shadow-2xl
                      px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-gold-soft)] border border-[var(--color-gold-ring)]
                        flex items-center justify-center text-[var(--color-gold)] shrink-0">
          <Download size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--color-text)] font-semibold">Installa GustoPro</p>
          <p className="text-[11px] text-[var(--color-text-3)]">
            App sul telefono per push notifiche e accesso rapido.
          </p>
        </div>
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 rounded-md bg-[var(--color-gold)] text-[#13181C] text-xs font-bold hover:brightness-110 shrink-0"
        >
          Installa
        </button>
        <button
          onClick={dismiss}
          className="text-[var(--color-text-3)] hover:text-[var(--color-text)] p-1 shrink-0"
          aria-label="Chiudi"
        >
          <X size={16} />
        </button>
      </div>

      {/* iOS help modal */}
      {showIOSHelp && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowIOSHelp(false)}>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-2xl p-5 max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="serif font-bold text-[var(--color-text)] mb-3">Installa su iPhone/iPad</h3>
            <ol className="text-sm text-[var(--color-text-2)] space-y-2 list-decimal list-inside">
              <li>Tocca il pulsante <strong>Condividi</strong> (in basso al centro di Safari)</li>
              <li>Scorri e tocca <strong>"Aggiungi a Home"</strong></li>
              <li>Conferma → l'icona GustoPro apparirà sulla home</li>
            </ol>
            <button
              onClick={() => { setShowIOSHelp(false); dismiss() }}
              className="mt-4 w-full px-4 py-2 rounded-lg bg-[var(--color-gold)] text-[#13181C] text-sm font-bold"
            >
              Ho capito
            </button>
          </div>
        </div>
      )}
    </>
  )
}
