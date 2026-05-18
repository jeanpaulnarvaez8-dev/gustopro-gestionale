import { useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'

/**
 * ManagerOverrideModal — modal generico per richiedere PIN manager/admin
 * prima di eseguire un'operazione sensibile (cancellazione, sconto, ecc.).
 *
 * Usage:
 *   <ManagerOverrideModal
 *     open={open}
 *     title="Cancellare 1× Spaghetti?"
 *     description="Il piatto e' gia' stato inviato in cucina."
 *     actionLabel="Conferma cancellazione"
 *     onClose={() => setOpen(false)}
 *     onConfirm={({ pin, reason }) => handleAction({ pin, reason })}
 *   />
 *
 * Il chiamante poi usa { pin, reason } come `override` nei body API.
 * Il PIN NON viene salvato — solo passato una volta.
 */
export default function ManagerOverrideModal({
  open,
  title = 'Autorizzazione responsabile',
  description,
  actionLabel = 'Conferma',
  onClose,
  onConfirm,
}) {
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleSubmit(e) {
    e?.preventDefault?.()
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN deve essere 4-6 cifre'); return
    }
    setError('')
    setSubmitting(true)
    try {
      await onConfirm({ pin, reason })
      setPin(''); setReason('')
    } catch (e) {
      setError(e?.response?.data?.error || 'Errore. PIN errato?')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4" onClick={() => !submitting && onClose?.()}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-[var(--color-surface)] border border-[var(--color-warn)]/40 rounded-2xl p-5 max-w-md w-full shadow-2xl"
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-warn-soft)] border border-[var(--color-warn)]/40 flex items-center justify-center text-[var(--color-warn)] shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="serif font-bold text-[var(--color-text)]">{title}</h3>
            {description && <p className="text-xs text-[var(--color-text-3)] mt-1">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-[var(--color-text-3)] hover:text-[var(--color-text)] p-1" aria-label="Chiudi">
            <X size={16} />
          </button>
        </div>

        <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-2)] font-semibold">
          PIN responsabile
        </label>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoFocus
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="mt-1 w-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2.5 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-warn)] font-mono tracking-widest text-center"
          placeholder="••••"
          disabled={submitting}
        />

        <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-2)] font-semibold mt-3 block">
          Motivo (opzionale)
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={120}
          placeholder="es. cliente cambia idea"
          className="mt-1 w-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-gold)]"
          disabled={submitting}
        />

        {error && (
          <p className="text-[var(--color-err)] text-xs mt-2 font-semibold">{error}</p>
        )}

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] text-sm font-semibold disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={submitting || pin.length < 4}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-warn)] text-black text-sm font-bold disabled:opacity-40 hover:brightness-110"
          >
            {submitting ? 'Verifico…' : actionLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
