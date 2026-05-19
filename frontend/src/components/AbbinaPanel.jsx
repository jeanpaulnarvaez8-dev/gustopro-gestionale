import { useState, useEffect, useCallback } from 'react'
import { Layers, Play, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { kdsAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

/**
 * AbbinaPanel — pannello che mostra gruppi di item duplicati attivi nel
 * KDS (es. "4 Margherite" attraverso 3 ordini).
 *
 * Sprint 5: lo chef puo' click "Inizia tutti" e batch-cookare invece
 * di gestire un piatto per volta.
 *
 * Props:
 *   - station: 'cucina'|'pizzeria'|'crudi'|'pasticceria'
 *   - onUpdate: callback dopo batch action (per refresh KDS parent)
 *
 * Refresh: socket new-order/order-item-added/item-status-updated +
 * polling 15s fallback.
 */
export default function AbbinaPanel({ station = 'cucina', onUpdate, socket }) {
  const { toast } = useToast()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState({})
  const [busy, setBusy] = useState({})

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await kdsAPI.abbina(station)
      setGroups(data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [station])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!socket) return
    const refresh = () => load()
    socket.on('new-order', refresh)
    socket.on('order-item-added', refresh)
    socket.on('item-status-updated', refresh)
    socket.on('items-batch-updated', refresh)
    socket.on('item-served', refresh)
    return () => {
      socket.off('new-order', refresh)
      socket.off('order-item-added', refresh)
      socket.off('item-status-updated', refresh)
      socket.off('items-batch-updated', refresh)
      socket.off('item-served', refresh)
    }
  }, [socket, load])

  async function batchAdvance(group, nextStatus) {
    const key = group.menu_item_id + '-' + nextStatus
    setBusy(p => ({ ...p, [key]: true }))
    try {
      // Filtra solo items che hanno lo status "precedente" (es. pending→cooking)
      const targetStatuses = nextStatus === 'cooking' ? ['pending']
                          : nextStatus === 'ready'    ? ['cooking','oven_done']
                          : []
      const ids = group.items.filter(it => targetStatuses.includes(it.status)).map(it => it.id)
      if (ids.length === 0) {
        toast({ type: 'info', title: 'Nessun item da aggiornare in batch' })
        return
      }
      const { data } = await kdsAPI.batchStatus(ids, nextStatus)
      toast({ type: 'success', title: `✓ Batch ${nextStatus}`, message: `${data.updated} item aggiornati insieme` })
      load()
      onUpdate?.()
    } catch {
      toast({ type: 'error', title: 'Errore batch' })
    } finally { setBusy(p => { const n = { ...p }; delete n[key]; return n }) }
  }

  if (loading && groups.length === 0) return null
  if (groups.length === 0) return null

  return (
    <div className="border-b border-[var(--color-border-soft)] bg-[var(--color-surface-2)]">
      <div className="px-4 py-2 flex items-center gap-2">
        <Layers size={14} className="text-[var(--color-gold)]" />
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-2)]">
          Abbina ({groups.length} {groups.length === 1 ? 'gruppo' : 'gruppi'})
        </span>
        <button onClick={load} className="ml-auto text-[var(--color-text-3)] hover:text-[var(--color-text)] p-1">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="px-4 pb-3 space-y-2">
        {groups.map(g => {
          const isExp = expanded[g.menu_item_id]
          const allPending = g.items.every(i => i.status === 'pending')
          const someCooking = g.items.some(i => i.status === 'cooking' || i.status === 'oven_done')
          return (
            <div key={g.menu_item_id} className="rounded-lg border border-[var(--color-gold-ring)] bg-[var(--color-surface)] overflow-hidden">
              <button
                onClick={() => setExpanded(p => ({ ...p, [g.menu_item_id]: !p[g.menu_item_id] }))}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[rgba(255,255,255,0.02)]"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-bold text-[var(--color-text)]">{g.item_name}</span>
                  <span className="ml-2 text-[10px] text-[var(--color-text-3)] uppercase tracking-wider">
                    {g.num_orders} ordini · totale {g.total_quantity}
                  </span>
                </div>
                {/* Action buttons batch */}
                {allPending && (
                  <button
                    onClick={(e) => { e.stopPropagation(); batchAdvance(g, 'cooking') }}
                    disabled={busy[g.menu_item_id + '-cooking']}
                    className="px-2.5 py-1 rounded-md bg-[var(--color-terracotta)] text-white text-[10px] font-bold flex items-center gap-1 disabled:opacity-50"
                    title="Inizia tutti insieme"
                  >
                    <Play size={10} /> Inizia tutti
                  </button>
                )}
                {someCooking && (
                  <button
                    onClick={(e) => { e.stopPropagation(); batchAdvance(g, 'ready') }}
                    disabled={busy[g.menu_item_id + '-ready']}
                    className="px-2.5 py-1 rounded-md bg-[var(--color-ok)] text-white text-[10px] font-bold disabled:opacity-50"
                    title="Marca tutti pronti"
                  >
                    Pronto tutti
                  </button>
                )}
                {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {isExp && (
                <div className="px-3 pb-2 space-y-1 text-[11px]">
                  {g.items.map(it => (
                    <div key={it.id} className="flex items-center gap-2 text-[var(--color-text-2)]">
                      <span className="text-[var(--color-gold)] tnum">T{it.table_number}</span>
                      <span className="tnum">×{it.quantity}</span>
                      <span className="text-[10px] uppercase tracking-wider opacity-70">{it.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
