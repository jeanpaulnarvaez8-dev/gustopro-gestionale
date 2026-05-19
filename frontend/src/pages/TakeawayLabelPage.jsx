import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react'
import { ordersAPI, billingAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

/**
 * TakeawayLabelPage — etichetta stampabile per il box asporto.
 *
 * Format A6 (105×148mm), un'etichetta per pagina con:
 *   - Numero ordine GIGANTE (T101) per identificazione veloce al ritiro
 *   - Nome cliente + orario pickup
 *   - Lista items (font medio)
 *   - Nome ristorante (footer)
 *
 * Lo staff la stampa e la appiccica al box prima della consegna.
 * Quando il cliente arriva dice "T101" → match istantaneo.
 */
export default function TakeawayLabelPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([ordersAPI.get(orderId), billingAPI.preConto(orderId)])
      .then(([orderRes, billRes]) => {
        if (cancelled) return
        setData({ order: orderRes.data, bill: billRes.data })
      })
      .catch(() => toast({ type: 'error', title: 'Errore caricamento ordine' }))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [orderId, toast])

  function fmtTime(d) {
    if (!d) return ''
    return new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 sticky top-0 z-20 no-print">
        <button onClick={() => navigate(-1)} className="text-[var(--color-text-2)] hover:text-[var(--color-text)] p-1.5 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <h1 className="serif font-bold text-lg text-[var(--color-text)] flex-1">Etichetta Asporto</h1>
        <button
          onClick={() => window.print()}
          disabled={!data}
          className="px-3 py-1.5 rounded-md bg-[var(--color-gold)] text-[#13181C] text-sm font-bold flex items-center gap-1.5 disabled:opacity-40 hover:brightness-110"
        >
          <Printer size={14} /> Stampa
        </button>
      </header>

      <div className="p-4 max-w-2xl mx-auto">
        {loading && (
          <div className="flex items-center gap-2 text-[var(--color-text-2)] py-12 justify-center">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" /> Caricamento…
          </div>
        )}
        {!loading && data && (
          <div className="label-box bg-white text-black border-2 border-dashed border-gray-400 rounded-lg p-6 mx-auto" style={{ width: '105mm', minHeight: '148mm' }}>
            {/* Numero gigante */}
            <div className="text-center mb-4">
              <p className="text-xs uppercase tracking-widest text-gray-600 mb-2">ASPORTO</p>
              <p className="text-7xl font-extrabold leading-none tnum">
                {data.order.takeaway_number ? `T${data.order.takeaway_number}` : 'T—'}
              </p>
            </div>
            <hr className="border-dashed border-gray-400 my-3" />

            {/* Cliente + ora */}
            <div className="text-sm space-y-1 mb-3">
              <p><span className="text-gray-600 text-xs uppercase tracking-wider">Cliente:</span> <strong>{data.order.customer_name || '—'}</strong></p>
              {data.order.customer_phone && (
                <p><span className="text-gray-600 text-xs uppercase tracking-wider">Tel:</span> {data.order.customer_phone}</p>
              )}
              {data.order.pickup_time && (
                <p className="text-base">
                  <span className="text-gray-600 text-xs uppercase tracking-wider">Ritiro:</span>{' '}
                  <strong>{fmtTime(data.order.pickup_time)}</strong>
                </p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Ordinato: {fmtTime(data.order.created_at)} · {data.bill.items?.length || 0} articoli · €{Number(data.bill.total_amount || 0).toFixed(2)}
              </p>
            </div>

            <hr className="border-dashed border-gray-400 my-3" />

            {/* Items list compatta */}
            <div className="text-sm space-y-1">
              {data.bill.items?.map((it, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span><strong className="tnum">{it.quantity}×</strong> {it.item_name}</span>
                </div>
              ))}
            </div>

            {/* Footer brand */}
            <div className="mt-auto pt-4 text-center text-[10px] text-gray-500 uppercase tracking-widest">
              Riva Beach Salento · Asporto
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: A6; margin: 5mm; }
          .label-box { border: 1px solid black !important; }
        }
      `}</style>
    </div>
  )
}
