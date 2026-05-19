import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, RefreshCw, CheckCircle2, BellRing, Users } from 'lucide-react'
import { comandistaAPI } from '../lib/api'
import { useSocket } from '../context/SocketContext'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { Card, Badge } from '../components/v2'

/**
 * ComandistaPage — Banco del pass (Sprint 6).
 *
 * Lo chef vede tutti gli ordini con almeno 1 item 'ready' (al pass).
 * Per ognuno: button "Chiama cameriere" → push native al waiter +
 * socket pass-call → cameriere riceve notifica + URL /order/X.
 *
 * Quando il cameriere arriva fisicamente, scansiona il QR del tavolo
 * (o tap "Confermo ritiro tutti") → items vanno servito + pass_call
 * acknowledged.
 *
 * Refresh: socket new-order, item-status-updated, items-batch-updated,
 * pass-call, item-served.
 */
export default function ComandistaPage() {
  const navigate = useNavigate()
  const { socket } = useSocket()
  const { toast } = useToast()
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState({})

  const load = useCallback(async () => {
    try {
      const { data } = await comandistaAPI.ready()
      setOrders(data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento pass' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!socket) return
    const refresh = () => load()
    socket.on('new-order', refresh)
    socket.on('order-item-added', refresh)
    socket.on('item-status-updated', refresh)
    socket.on('items-batch-updated', refresh)
    socket.on('item-served', refresh)
    socket.on('pass-call', refresh)
    return () => {
      socket.off('new-order', refresh)
      socket.off('order-item-added', refresh)
      socket.off('item-status-updated', refresh)
      socket.off('items-batch-updated', refresh)
      socket.off('item-served', refresh)
      socket.off('pass-call', refresh)
    }
  }, [socket, load])

  async function handleCall(orderId, tableNumber) {
    setBusy(p => ({ ...p, [`call-${orderId}`]: true }))
    try {
      await comandistaAPI.call(orderId)
      toast({ type: 'success', title: `🛎️ Cameriere chiamato per T${tableNumber}` })
      load()
    } catch {
      toast({ type: 'error', title: 'Errore chiamata' })
    } finally {
      setBusy(p => { const n = { ...p }; delete n[`call-${orderId}`]; return n })
    }
  }

  async function handlePickupAll(order) {
    const readyItemIds = order.items.filter(i => i.status === 'ready').map(i => i.id)
    if (readyItemIds.length === 0) return
    setBusy(p => ({ ...p, [`pickup-${order.order_id}`]: true }))
    try {
      const { data } = await comandistaAPI.pickup(order.order_id, readyItemIds, 'manual')
      toast({ type: 'success', title: `✓ Ritirati ${data.served} piatti T${order.table_number}` })
      load()
    } catch {
      toast({ type: 'error', title: 'Errore conferma ritiro' })
    } finally {
      setBusy(p => { const n = { ...p }; delete n[`pickup-${order.order_id}`]; return n })
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] flex flex-col">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => navigate(-1)} className="text-[var(--color-text-2)] hover:text-[var(--color-text)] p-1.5 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <Bell size={20} className="text-[var(--color-gold)]" />
        <h1 className="serif font-bold text-lg text-[var(--color-text)] flex-1">Banco Comandista</h1>
        <Badge tone="gold" size="sm">{orders.length} al pass</Badge>
        <button onClick={load} disabled={loading} className="text-[var(--color-text-2)] hover:text-[var(--color-gold)] p-1.5 rounded-lg disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-3 max-w-[1400px] mx-auto w-full">
        {loading && orders.length === 0 && (
          <div className="flex items-center gap-2 text-[var(--color-text-2)] py-12 justify-center">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" /> Caricamento…
          </div>
        )}
        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-3)]">
            <CheckCircle2 size={36} className="opacity-30 mb-2" />
            <p className="text-sm">Nessun ordine al pass.</p>
            <p className="text-xs mt-1">Gli ordini con items 'pronti' appaiono qui.</p>
          </div>
        )}
        {orders.map(o => {
          const readyCount = o.items.filter(i => i.status === 'ready').length
          const totalCount = o.items.length
          const hasOpenCall = !!o.open_call_at
          const minutesSinceCall = hasOpenCall
            ? Math.floor((Date.now() - new Date(o.open_call_at).getTime()) / 60000) : 0
          return (
            <Card key={o.order_id} padding="md" className={`border-l-4 ${hasOpenCall ? 'border-[var(--color-warn)]' : 'border-[var(--color-gold)]'}`}>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="text-[var(--color-gold)] serif font-bold text-3xl tnum shrink-0">
                  T{o.table_number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge tone="ok" size="sm">{readyCount} pronti</Badge>
                    {totalCount > readyCount && (
                      <Badge tone="warn" size="sm">{totalCount - readyCount} in attesa</Badge>
                    )}
                    {o.waiter_name && (
                      <span className="text-xs text-[var(--color-text-3)] flex items-center gap-1">
                        <Users size={11}/> {o.waiter_name}
                      </span>
                    )}
                    {hasOpenCall && (
                      <Badge tone="warn" size="sm">
                        <BellRing size={10} className="inline mr-1"/> chiamato {minutesSinceCall}'
                      </Badge>
                    )}
                  </div>
                  {/* Items list compatta */}
                  <ul className="text-xs text-[var(--color-text-2)] space-y-0.5">
                    {o.items.map(it => (
                      <li key={it.id} className="flex items-center gap-2">
                        <span className={`tnum ${it.status === 'ready' ? 'text-[var(--color-ok)] font-bold' : 'text-[var(--color-text-3)]'}`}>
                          {it.quantity}×
                        </span>
                        <span className={it.status === 'ready' ? 'text-[var(--color-text)]' : 'opacity-60'}>
                          {it.name}
                        </span>
                        {Array.isArray(it.required_kit) && it.required_kit.length > 0 && (
                          <span className="text-[10px] text-[var(--color-gold)]">🛠️ {it.required_kit.join('·')}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => handleCall(o.order_id, o.table_number)}
                    disabled={busy[`call-${o.order_id}`]}
                    className="px-3 py-1.5 rounded-md bg-[var(--color-warn)] text-black text-xs font-bold flex items-center gap-1 hover:brightness-110 disabled:opacity-50"
                  >
                    <BellRing size={12}/> {hasOpenCall ? 'Richiama' : 'Chiama camerier'+(o.waiter_name?.split(' ')[0]||'e')}
                  </button>
                  <button
                    onClick={() => handlePickupAll(o)}
                    disabled={busy[`pickup-${o.order_id}`]}
                    className="px-3 py-1.5 rounded-md bg-[var(--color-ok)] text-white text-xs font-bold flex items-center gap-1 hover:brightness-110 disabled:opacity-50"
                  >
                    <CheckCircle2 size={12}/> Ritirato {readyCount}
                  </button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
