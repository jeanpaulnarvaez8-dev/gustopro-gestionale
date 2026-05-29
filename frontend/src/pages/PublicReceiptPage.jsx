import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { publicAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'

/**
 * PublicReceiptPage — scontrino NON fiscale visibile pubblicamente via link
 * condivisibile (WhatsApp/SMS/Mail). Route PUBBLICA /receipt/:id (no login).
 * L'id e' un UUID non indovinabile. Mostra solo dati di visualizzazione.
 *
 * .normalcase: questa pagina e' rivolta al cliente → niente MAIUSCOLO globale.
 */
export default function PublicReceiptPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(false)
    publicAPI.receipt(id)
      .then(r => { if (alive) setData(r.data) })
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id])

  if (loading) {
    return (
      <div className="normalcase min-h-[100dvh] flex items-center justify-center bg-[#0f1115] text-[#cbd5e1]">
        <p className="text-sm">Caricamento scontrino…</p>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="normalcase min-h-[100dvh] flex flex-col items-center justify-center bg-[#0f1115] text-[#cbd5e1] gap-2 px-6 text-center">
        <p className="text-lg font-semibold">Scontrino non trovato</p>
        <p className="text-sm text-[#94a3b8]">Il link potrebbe essere scaduto o errato.</p>
      </div>
    )
  }

  const fiscal = data.fiscal_data || {}
  const dt = new Date(data.created_at)
  const dtStr = dt.toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const receiptN = String(data.id || '').slice(0, 8)
  const items = Array.isArray(data.items) ? data.items : []
  const tableLabel = data.table_number === 'Asporto' ? 'Asporto' : `Tavolo ${data.table_number}`

  return (
    <div className="normalcase min-h-[100dvh] bg-[#0f1115] py-6 px-3 flex flex-col items-center">
      {/* Scontrino su carta bianca */}
      <div
        className="receipt-print bg-white text-black rounded-lg shadow-xl w-full"
        style={{ maxWidth: '380px', fontFamily: '"Courier New", Menlo, monospace', fontSize: '13px', lineHeight: 1.5, padding: '20px' }}
      >
        {/* Header */}
        <div className="text-center mb-2">
          <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.5px' }}>
            {data.restaurant_name || 'GustoPro'}
          </div>
          {fiscal.address && <div style={{ fontSize: '11px', marginTop: 2 }}>{fiscal.address}</div>}
          {fiscal.piva && <div style={{ fontSize: '11px' }}>P.IVA {fiscal.piva}</div>}
          {fiscal.phone && <div style={{ fontSize: '11px' }}>Tel. {fiscal.phone}</div>}
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }} />

        {/* Meta */}
        <div style={{ fontSize: '12px' }}>
          <Row label="Data" value={dtStr} />
          <Row label="Tavolo" value={tableLabel} />
          <Row label="N." value={`#${receiptN}`} />
          {data.is_split && <Row label="Conto" value={`${data.split_index}/${data.split_total}`} />}
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }} />

        {/* Voci */}
        <div>
          {items.length === 0 && (
            <div style={{ textAlign: 'center', fontStyle: 'italic' }}>(nessun articolo)</div>
          )}
          {items.map((it, idx) => {
            const qty = Number(it.quantity) || 1
            const subtotal = Number(it.subtotal) || 0
            return (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ flex: 1, marginRight: 8 }}>
                  {qty > 1 ? `${qty}× ` : ''}{it.item_name}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {formatPrice(subtotal)}
                </span>
              </div>
            )
          })}
        </div>

        <div style={{ borderTop: '1px solid #000', margin: '10px 0' }} />

        {/* Totali */}
        {Number(data.tax_amount) > 0 && (
          <Row label="IVA inclusa" value={formatPrice(data.tax_amount)} />
        )}
        <Row label="TOTALE" value={formatPrice(data.total_amount)} bold large />

        <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }} />

        {/* Footer */}
        <div className="text-center" style={{ fontSize: '11px' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>DOCUMENTO NON FISCALE</div>
          <div>Non valido ai fini fiscali</div>
          <div style={{ marginTop: 8, fontSize: '12px' }}>Grazie e arrivederci ❤</div>
        </div>
      </div>

      {/* Bottone stampa (nascosto in stampa) */}
      <button
        onClick={() => window.print()}
        className="no-print mt-5 px-6 py-3 rounded-xl bg-[#D4AF37] text-[#13181C] font-bold text-base active:scale-95 transition"
      >
        Stampa / Salva PDF
      </button>
    </div>
  )
}

function Row({ label, value, bold, large }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      fontWeight: bold ? 700 : 400,
      fontSize: large ? '15px' : 'inherit',
      marginTop: large ? 4 : 0,
    }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}
