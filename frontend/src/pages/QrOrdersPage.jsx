import { useEffect, useState, useCallback, useRef } from 'react'
import { ShoppingBag, CheckCircle2, Loader2, Banknote, CreditCard, Smartphone, QrCode, LogOut } from 'lucide-react'
import { ordersAPI, billingAPI } from '../lib/api'
import { useSocket } from '../context/SocketContext'
import { formatPrice } from '../lib/utils'

/**
 * QrOrdersPage — vista CASSA degli ordini self-order da QR (JP 2026-06-12).
 * Da tenere aperta accanto alla cassa (tablet / finestra). Mostra gli ordini
 * in attesa di incasso: il cassiere incassa su Custom (fiscale) e qui fa
 * "INCASSATO" → la comanda parte. ANTI-FURTO: finche' non incassi, non parte.
 */
export default function QrOrdersPage() {
  const { socket } = useSocket()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(null)    // order.id in pagamento
  const [chooser, setChooser] = useState(null)  // order.id che mostra scelta metodo

  const load = useCallback(async () => {
    try { const r = await ordersAPI.qrPending(); setOrders(Array.isArray(r.data) ? r.data : []) }
    catch { /* silenzioso: ritenta al prossimo tick */ }
    finally { setLoading(false) }
  }, [])

  // polling ogni 8s + refresh immediato su evento socket
  useEffect(() => { load(); const i = setInterval(load, 8000); return () => clearInterval(i) }, [load])
  useEffect(() => {
    if (!socket) return
    const onNew = () => { beep(); load() }
    socket.on('qr-order-received', onNew)
    return () => { socket.off('qr-order-received', onNew) }
  }, [socket, load])

  const beep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.frequency.value = 880; o.type = 'sine'
      g.gain.setValueAtTime(0.25, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
      o.start(); o.stop(ctx.currentTime + 0.5)
    } catch { /* audio non disponibile, ignora */ }
  }

  const pay = async (order, method) => {
    setPaying(order.id); setChooser(null)
    try {
      await billingAPI.pay({ order_id: order.id, amount: Number(order.total_amount), payment_method: method })
      setOrders(prev => prev.filter(o => o.id !== order.id))  // sparisce subito
    } catch (e) {
      alert(e?.response?.data?.error || 'Errore incasso, riprova')
    } finally { setPaying(null) }
  }

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] p-4">
      <header className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl bg-[var(--color-sea)] text-white flex items-center justify-center">
          <QrCode size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Ordini da incassare</h1>
          <p className="text-sm text-[var(--color-text-3)]">QR + asporti · la comanda parte quando incassi</p>
        </div>
        <div className="ml-auto flex items-center gap-2 bg-[var(--color-surface-2)] px-3 py-2 rounded-lg">
          <ShoppingBag size={18} className="text-[var(--color-sea)]" />
          <span className="font-bold text-lg text-[var(--color-text)] tnum">{orders.length}</span>
        </div>
        {/* JP 2026-06-12: torna alla cassa (chiude la finestra app Chrome) */}
        <button
          onClick={() => { try { window.close() } catch {} window.open('', '_self'); window.close() }}
          className="flex items-center gap-2 bg-[var(--color-coral,#c0533a)] text-white px-4 py-2.5 rounded-lg font-semibold active:scale-95"
        >
          <LogOut size={18} /> Torna alla cassa
        </button>
      </header>

      {loading && (
        <div className="flex flex-col items-center gap-2 py-20 text-[var(--color-text-3)]">
          <Loader2 className="animate-spin" size={28} /> Carico…
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-[var(--color-text-3)] text-center">
          <QrCode size={48} strokeWidth={1.5} className="opacity-40" />
          <p className="text-lg font-medium">Nessun ordine in attesa</p>
          <p className="text-sm">Quando un cliente ordina dal QR, appare qui e suona.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orders.map(o => (
          <div key={o.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm">
            {/* Header card */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <div className="text-lg font-bold text-[var(--color-text)] leading-tight">{o.customer_name}</div>
                <div className="text-xs text-[var(--color-text-3)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>
                    {o.table_number === 'ASPORTO'
                      ? `🥡 Asporto${o.takeaway_number ? ` #${o.takeaway_number}` : ''}`
                      : `🍽️ Tavolo ${o.table_number}`}
                  </span>
                  {o.source === 'qr' && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--color-sea)] text-white text-[10px] font-bold">📱 QR</span>
                  )}
                  <span>· {new Date(o.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}</span>
                </div>
              </div>
              <div className="text-xl font-extrabold text-[var(--color-sea)] tnum">{formatPrice(o.total_amount)}</div>
            </div>

            {/* Piatti */}
            <ul className="text-sm text-[var(--color-text-2)] space-y-0.5 mb-4 max-h-44 overflow-auto">
              {o.items.map((it, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-semibold text-[var(--color-sea)] tnum">{it.quantity}×</span>
                  <span>{it.name}</span>
                </li>
              ))}
            </ul>

            {/* Azione incasso */}
            {chooser === o.id ? (
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => pay(o, 'cash')} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-[var(--color-leaf,#15803d)] text-white text-xs font-semibold active:scale-95">
                  <Banknote size={20} /> Contanti
                </button>
                <button onClick={() => pay(o, 'card')} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-[var(--color-sea)] text-white text-xs font-semibold active:scale-95">
                  <CreditCard size={20} /> Carta
                </button>
                <button onClick={() => pay(o, 'digital')} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-[var(--color-text-2)] text-white text-xs font-semibold active:scale-95">
                  <Smartphone size={20} /> Digitale
                </button>
                <button onClick={() => setChooser(null)} className="col-span-3 text-xs text-[var(--color-text-3)] py-1">Annulla</button>
              </div>
            ) : (
              <button
                onClick={() => setChooser(o.id)}
                disabled={paying === o.id}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--color-sea)] text-white font-bold active:scale-95 disabled:opacity-50"
              >
                {paying === o.id
                  ? <><Loader2 className="animate-spin" size={18} /> Incasso…</>
                  : <><CheckCircle2 size={20} /> INCASSATO → fai partire</>}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
