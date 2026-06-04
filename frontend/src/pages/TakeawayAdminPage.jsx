import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Printer, Clock, User, Phone, Package } from 'lucide-react'
import { adminAPI, printAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { formatPrice } from '../lib/utils'

/**
 * TakeawayAdminPage — JP 2026-06-04
 *
 * Lista asporti del giorno corrente con totale e items, accessibile
 * dall'admin / manager. Per ogni asporto pulsante "Stampa preconto"
 * che mette in coda print (kind=preconto) → l'agent locale stampa
 * sulla .24. Niente coperto (asporto = no covers fee).
 */
export default function TakeawayAdminPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState({})

  const load = useCallback(async () => {
    try {
      const { data } = await adminAPI.takeawayList()
      setOrders(Array.isArray(data) ? data : [])
    } catch {
      toast({ type: 'error', title: 'Errore caricamento asporti' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  const handlePrint = async (orderId, customer) => {
    if (printing[orderId]) return
    setPrinting(p => ({ ...p, [orderId]: true }))
    try {
      await printAPI.enqueue('preconto', orderId)
      toast({
        type: 'success',
        title: `🖨 Preconto in stampa`,
        message: `${customer || 'Asporto'} — esce dalla .24 fra qualche secondo`,
      })
    } catch (e) {
      toast({
        type: 'error',
        title: 'Errore stampa',
        message: e?.response?.data?.error || 'Agent offline?',
      })
    } finally {
      setPrinting(p => { const n = { ...p }; delete n[orderId]; return n })
    }
  }

  const totalToday = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0)
  const openCount = orders.filter(o => o.status === 'open').length
  const closedCount = orders.filter(o => o.status === 'completed').length

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)]">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => navigate('/admin-home')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
        >
          <ArrowLeft size={18} />
        </button>
        <Package size={20} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Asporti di oggi
        </h1>
        <div className="ml-3 flex gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-[var(--color-warn-soft)] text-[var(--color-warn)] font-semibold">
            {openCount} aperti
          </span>
          <span className="px-2 py-0.5 rounded bg-[var(--color-ok-soft)] text-[var(--color-ok)] font-semibold">
            {closedCount} chiusi
          </span>
        </div>
        <span className="ml-auto serif text-[var(--color-gold)] font-bold text-xl tnum">
          {formatPrice(totalToday)}
        </span>
        <button
          onClick={load}
          className="ml-2 p-1.5 rounded-lg text-[var(--color-text-2)] hover:text-[var(--color-gold)] hover:bg-[rgba(255,255,255,0.04)] transition"
        >
          <RefreshCw size={16} />
        </button>
      </header>

      <div className="flex-1 p-4 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-64 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={20} className="animate-spin text-[var(--color-gold)]" />
            <span>Caricamento…</span>
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <Package size={48} className="text-[var(--color-text-3)] opacity-40" />
            <p className="text-[var(--color-text-2)] text-sm">Nessun asporto oggi</p>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map(o => (
              <div
                key={o.id}
                className={`bg-[var(--color-surface)] rounded-xl border-2 p-4 flex flex-col gap-3 ${
                  o.status === 'open'
                    ? 'border-[var(--color-warn)]/40'
                    : 'border-[var(--color-ok)]/30 opacity-90'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[var(--color-text)] font-extrabold text-lg">
                      <User size={16} className="text-[var(--color-gold)] shrink-0" />
                      <span className="truncate">{o.customer_name || '—'}</span>
                    </div>
                    {o.customer_phone && (
                      <div className="flex items-center gap-1.5 text-[var(--color-text-2)] text-xs mt-0.5">
                        <Phone size={11} /> {o.customer_phone}
                      </div>
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      o.status === 'open'
                        ? 'bg-[var(--color-warn)] text-black'
                        : 'bg-[var(--color-ok)] text-white'
                    }`}
                  >
                    {o.status === 'open' ? 'Aperto' : 'Chiuso'}
                  </span>
                </div>

                {o.pickup_time && (
                  <div className="flex items-center gap-1.5 text-[var(--color-gold)] font-bold text-sm">
                    <Clock size={14} /> Ritiro: {String(o.pickup_time).slice(0, 5)}
                  </div>
                )}

                {Array.isArray(o.items) && o.items.length > 0 && (
                  <div className="border-t border-[var(--color-border-soft)] pt-2 space-y-1 text-sm">
                    {o.items.map((it, i) => (
                      <div key={i} className="flex justify-between gap-2 text-[var(--color-text-2)]">
                        <span className="truncate">
                          <span className="text-[var(--color-gold)] font-bold tnum">×{it.quantity}</span>{' '}
                          {it.name}
                        </span>
                        <span className="tnum shrink-0">{formatPrice(it.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-2">
                  <span className="text-[var(--color-text-2)] text-xs uppercase">Totale</span>
                  <span className="serif text-[var(--color-gold)] font-extrabold text-xl tnum">
                    {formatPrice(o.total_amount)}
                  </span>
                </div>

                <button
                  onClick={() => handlePrint(o.id, o.customer_name)}
                  disabled={printing[o.id]}
                  className="w-full py-2.5 rounded-lg bg-[var(--color-gold)] text-[#13181C] font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-50"
                >
                  <Printer size={16} />
                  {printing[o.id] ? '…' : 'Stampa preconto'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
