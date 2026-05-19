import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Sunrise, RefreshCw } from 'lucide-react'
import { dayCloseAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useSocket } from '../context/SocketContext'

/**
 * DayStatusBadge — pillola che mostra stato giornata + click per apri/chiudi.
 *
 * Visibilita': admin/manager/cashier (gli altri ruoli lo vedono read-only).
 * Stati:
 *   - Mai aperta oggi → "Apri giornata" (pulsante verde)
 *   - Aperta + non chiusa → "📅 Aperta dalle HH:MM da X" (pillola verde)
 *   - Chiusa → "🔒 Chiusa alle HH:MM" (pillola grigia)
 *
 * Click su "Apri": chiama dayCloseAPI.open() + refresh status.
 * Click su badge chiuso/aperto: naviga a /day-close per dettagli e chiusura.
 */
function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export default function DayStatusBadge({ userRole, compact = false }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { socket } = useSocket()
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const canManage = ['admin','manager','cashier'].includes(userRole)

  const refresh = useCallback(async () => {
    try {
      const r = await dayCloseAPI.status()
      setStatus(r.data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Realtime: se altro device chiude/apre, mi aggiorno
  useEffect(() => {
    if (!socket) return
    const handler = () => refresh()
    socket.on('day-status-changed', handler)
    return () => socket.off('day-status-changed', handler)
  }, [socket, refresh])

  async function handleOpen() {
    if (!canManage) return
    setBusy(true)
    try {
      await dayCloseAPI.open()
      toast({ type: 'success', title: '☀️ Giornata aperta', message: 'Servizio iniziato. Buon lavoro!' })
      refresh()
    } catch {
      toast({ type: 'error', title: 'Errore apertura' })
    } finally { setBusy(false) }
  }

  // Loading state
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-2)] text-[var(--color-text-3)] text-[10px]">
        <RefreshCw size={10} className="animate-spin" /> …
      </span>
    )
  }

  // Mai aperta → pulsante "Apri"
  if (!status.opened_at) {
    if (!canManage) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border-soft)] text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold">
          📅 Giornata non aperta
        </span>
      )
    }
    return (
      <button
        onClick={handleOpen}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--color-ok)] text-white text-xs font-bold hover:brightness-110 disabled:opacity-50 shadow-sm"
        title="Apre la giornata di servizio: i KPI iniziano a contare da ora"
      >
        <Sunrise size={13} />
        {busy ? 'Apertura…' : (compact ? 'Apri giornata' : '☀️ Apri giornata')}
      </button>
    )
  }

  // Chiusa
  if (status.closed_at) {
    return (
      <button
        onClick={() => canManage && navigate('/day-close')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] text-[11px] font-semibold ${canManage ? 'hover:text-[var(--color-text)] cursor-pointer' : ''}`}
        title={`Giornata chiusa alle ${fmtTime(status.closed_at)} da ${status.closed_by_name || '?'}`}
      >
        <Lock size={11} className="text-[var(--color-text-3)]" />
        Chiusa {fmtTime(status.closed_at)}
      </button>
    )
  }

  // Aperta (= active)
  return (
    <button
      onClick={() => canManage && navigate('/day-close')}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-ok-soft)] border border-[var(--color-ok)]/40 text-[var(--color-ok)] text-[11px] font-semibold ${canManage ? 'hover:brightness-110 cursor-pointer' : ''}`}
      title={`Aperta alle ${fmtTime(status.opened_at)} da ${status.opened_by_name || '?'} — click per chiudere`}
    >
      <Sunrise size={11} />
      Aperta {fmtTime(status.opened_at)}
    </button>
  )
}
