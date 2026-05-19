import { useEffect, useState } from 'react'
import { Wine, X, Clock, CheckCircle2, Coffee } from 'lucide-react'
import { barAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

/**
 * BarTableModal — modal che mostra SOLO le bevande di un tavolo specifico.
 *
 * Usato quando il bartender (waiter/bar) clicca un tavolo dalla mappa:
 * invece di vedere il conto intero, vede solo cosa concerne il bar
 * (cocktail/vini/caffè/...).
 *
 * Mostra item raggruppati per status (pending/cooking/ready/served) +
 * pulsanti rapidi Inizia/Pronto per ognuno (skip "Inizia" su bevande,
 * vanno direttamente a pronto come gestito in KDS).
 */
const STATUS_META = {
  pending:  { label: 'In attesa',     icon: Clock,         tone: 'warn',  next: 'ready', nextLabel: 'Pronto' },
  cooking:  { label: 'In prep',       icon: Clock,         tone: 'terracotta', next: 'ready', nextLabel: 'Pronto' },
  ready:    { label: 'Pronto',        icon: CheckCircle2,  tone: 'ok',    next: 'served', nextLabel: 'Servito' },
  served:   { label: 'Servito',       icon: Coffee,        tone: 'neutral', next: null },
  cancelled:{ label: 'Annullato',     icon: X,             tone: 'err',   next: null },
}

function fmt(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export default function BarTableModal({ tableId, onClose }) {
  const { toast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState({})

  async function load() {
    if (!tableId) return
    setLoading(true)
    try {
      const r = await barAPI.byTable(tableId)
      setData(r.data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento bevande' })
    } finally { setLoading(false) }
  }

  useEffect(() => { load() /* eslint-disable-line */ }, [tableId])

  async function advance(itemId, nextStatus) {
    setUpdating(p => ({ ...p, [itemId]: true }))
    try {
      await barAPI.updateItemStatus(itemId, nextStatus)
      // Optimistic update
      setData(d => d && ({
        ...d,
        items: d.items.map(i => i.id === itemId ? { ...i, status: nextStatus } : i),
      }))
    } catch {
      toast({ type: 'error', title: 'Errore aggiornamento' })
      load()
    } finally {
      setUpdating(p => { const n = { ...p }; delete n[itemId]; return n })
    }
  }

  if (!tableId) return null

  return (
    <div
      className="fixed inset-0 z-[105] bg-black/70 flex items-end md:items-center justify-center md:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-surface)] w-full md:max-w-2xl md:rounded-2xl border border-[var(--color-border-strong)] shadow-2xl flex flex-col max-h-[85vh] md:max-h-[80vh]"
      >
        <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border-soft)] shrink-0">
          <Wine size={20} className="text-[var(--color-gold)]" />
          <h3 className="serif font-bold text-lg text-[var(--color-text)] flex-1">
            Bevande Tavolo {data?.table_number ?? '…'}
          </h3>
          <button onClick={onClose} className="p-2 text-[var(--color-text-3)] hover:text-[var(--color-text)] rounded-lg">
            <X size={18} />
          </button>
        </header>

        {loading && (
          <div className="flex-1 flex items-center justify-center text-[var(--color-text-2)] text-sm py-12">
            Caricamento…
          </div>
        )}

        {!loading && data && data.items.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-[var(--color-text-3)]">
            <Wine size={36} className="opacity-40 mb-2" />
            <p className="text-sm">Nessuna bevanda su questo tavolo.</p>
          </div>
        )}

        {!loading && data && data.items.length > 0 && (
          <>
            {/* Counters per status */}
            <div className="px-4 py-2 border-b border-[var(--color-border-soft)] flex gap-2 text-[10px] shrink-0 overflow-x-auto">
              {Object.entries(data.counts).filter(([_, n]) => n > 0).map(([st, n]) => {
                const meta = STATUS_META[st]
                if (!meta) return null
                return (
                  <span key={st} className={`px-2 py-1 rounded-md font-semibold uppercase tracking-wider border ${
                    meta.tone === 'warn'  ? 'text-[var(--color-warn)] bg-[var(--color-warn-soft)] border-[var(--color-warn)]/30' :
                    meta.tone === 'terracotta' ? 'text-[var(--color-terracotta)] bg-[var(--color-terracotta-soft)] border-[var(--color-terracotta)]/30' :
                    meta.tone === 'ok'    ? 'text-[var(--color-ok)] bg-[var(--color-ok-soft)] border-[var(--color-ok)]/30' :
                    'text-[var(--color-text-3)] bg-[var(--color-surface-2)] border-[var(--color-border-soft)]'
                  }`}>
                    {n}× {meta.label}
                  </span>
                )
              })}
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--color-border-soft)]">
              {data.items.map(item => {
                const meta = STATUS_META[item.status] || STATUS_META.pending
                const isUpd = !!updating[item.id]
                const Icon = meta.icon
                return (
                  <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                    <Icon size={16} className={`shrink-0 ${meta.tone === 'ok' ? 'text-[var(--color-ok)]' : meta.tone === 'warn' ? 'text-[var(--color-warn)]' : meta.tone === 'terracotta' ? 'text-[var(--color-terracotta)]' : 'text-[var(--color-text-3)]'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text)]">
                        <span className="text-[var(--color-gold)] tnum">{item.quantity}×</span> {item.item_name}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-3)]">
                        {item.category_name && <span>{item.category_name} · </span>}
                        <span>cameriere {item.waiter_name || '?'}</span>
                        {item.sent_at && <span> · {fmt(item.sent_at)}</span>}
                      </p>
                      {item.notes && (
                        <p className="text-[10px] text-[var(--color-warn)] italic mt-0.5">⚠ {item.notes}</p>
                      )}
                    </div>
                    {meta.next && (
                      <button
                        onClick={() => advance(item.id, meta.next)}
                        disabled={isUpd}
                        className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-bold transition disabled:opacity-50 ${
                          meta.next === 'ready' ? 'bg-[var(--color-ok)] text-white hover:brightness-110'
                          : 'bg-[var(--color-surface-2)] text-[var(--color-text-2)] border border-[var(--color-border-strong)]'
                        }`}
                      >
                        {isUpd ? '…' : meta.nextLabel}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
