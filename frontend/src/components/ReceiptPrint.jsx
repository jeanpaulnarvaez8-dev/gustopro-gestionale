import { formatPrice } from '../lib/utils'

/**
 * ReceiptPrint — Ricevuta NON FISCALE stampabile.
 *
 * Format: 80mm POS thermal (standard stampanti scontrini).
 * - Width 80mm = ~302px @96dpi → ottimizzato per font mono + leggibilità a 1m
 * - Print: CSS @media print nasconde tutto il resto, mostra solo questa view
 * - Compatibile con: Epson TM-T20, Star Micronics TSP100, qualsiasi stampante
 *   80mm con driver standard PDF/CUPS
 *
 * Layout (dal alto verso basso):
 *   ┌──────────────────────────────┐
 *   │  RISTORANTE (header serif)   │
 *   │  Indirizzo                   │
 *   │  P.IVA xxxxxxxxxxx           │
 *   │ ──────────────────────────── │
 *   │  Data: dd/mm/yyyy HH:MM      │
 *   │  Tavolo: M5 (4 cop.)         │
 *   │  Cameriere: Marco            │
 *   │  N. {receiptId}              │
 *   │ ──────────────────────────── │
 *   │  Items: nome ... qty x prezzo │
 *   │  ...                          │
 *   │ ──────────────────────────── │
 *   │  Subtotale       42.50€      │
 *   │  IVA 10%          4.25€      │
 *   │  TOTALE          46.75€      │
 *   │ ──────────────────────────── │
 *   │  Pagato:    50.00€ (Cash)    │
 *   │  Resto:      3.25€           │
 *   │ ──────────────────────────── │
 *   │  Documento NON FISCALE       │
 *   │  Grazie e arrivederci        │
 *   └──────────────────────────────┘
 */
export default function ReceiptPrint({ bill, payment, receipt, cashierName }) {
  if (!bill) return null
  const t = bill.tenant || {}
  const fiscal = t.fiscal_data || {}
  const issuedAt = receipt?.issued_at || new Date().toISOString()
  const dt = new Date(issuedAt)
  const dtStr = dt.toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const receiptN = receipt?.id?.slice(0, 8) || '—'
  const isTakeaway = bill.order_type === 'takeaway'
  const tableLabel = isTakeaway
    ? `Asporto · ${bill.customer_name || ''}`.trim()
    : `Tavolo ${bill.table_number}${bill.covers ? ` · ${bill.covers} cop.` : ''}`

  const payMethod = payment?.payment_method || ''
  const payMethodLabel = {
    cash: 'Contanti',
    card: 'Carta',
    voucher: 'Buono',
    other: 'Altro',
  }[payMethod] || payMethod

  // Render-safe items (no React #31)
  const items = Array.isArray(bill.items)
    ? bill.items.filter((it) => it && it.status !== 'cancelled')
    : []

  return (
    <div className="receipt-print mx-auto bg-white text-black p-4" style={{
      width: '80mm',
      maxWidth: '80mm',
      fontFamily: '"Courier New", Menlo, monospace',
      fontSize: '12px',
      lineHeight: '1.4',
      color: '#000',
    }}>
      {/* Header brand */}
      <div className="text-center mb-2">
        <div style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '0.5px' }}>
          {t.name || 'GustoPro'}
        </div>
        {fiscal.address && (
          <div style={{ fontSize: '11px', marginTop: '2px' }}>{fiscal.address}</div>
        )}
        {fiscal.piva && (
          <div style={{ fontSize: '11px' }}>P.IVA {fiscal.piva}</div>
        )}
        {fiscal.phone && (
          <div style={{ fontSize: '11px' }}>Tel. {fiscal.phone}</div>
        )}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

      {/* Meta info */}
      <div style={{ fontSize: '11px' }}>
        <Row label="Data" value={dtStr} />
        <Row label={isTakeaway ? 'Tipo' : 'Tavolo'} value={tableLabel} />
        {cashierName && <Row label="Cassiere" value={cashierName} />}
        <Row label="N." value={`#${receiptN}`} />
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

      {/* Items list */}
      <div style={{ fontSize: '12px' }}>
        {items.length === 0 && (
          <div style={{ textAlign: 'center', fontStyle: 'italic' }}>
            (nessun articolo)
          </div>
        )}
        {items.map((it, idx) => {
          const qty = Number(it.quantity) || 1
          const unit = Number(it.unit_price) || 0
          const modifierTotal = Number(it.modifier_total) || 0
          const subtotal = Number(it.subtotal) || (qty * (unit + modifierTotal))
          return (
            <div key={`it-${idx}`} style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ flex: 1, marginRight: '6px' }}>
                  {qty > 1 ? `${qty}× ` : ''}{it.item_name}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {formatPrice(subtotal)}
                </span>
              </div>
              {/* Modifiers (extra) */}
              {Array.isArray(it.modifiers) && it.modifiers.length > 0 && (
                <div style={{ fontSize: '10px', paddingLeft: '8px', color: '#444' }}>
                  {it.modifiers.map((m, mi) => (
                    <div key={mi}>
                      + {m.name}{m.price_extra > 0 ? ` (${formatPrice(m.price_extra)})` : ''}
                    </div>
                  ))}
                </div>
              )}
              {it.notes && (
                <div style={{ fontSize: '10px', paddingLeft: '8px', fontStyle: 'italic', color: '#444' }}>
                  Note: {it.notes}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

      {/* Totals */}
      <div style={{ fontSize: '12px' }}>
        <Row label="Subtotale"  value={formatPrice(bill.subtotal)} />
        {Number(bill.tax_amount) > 0 && (
          <Row label="IVA inclusa" value={formatPrice(bill.tax_amount)} />
        )}
        <div style={{ borderTop: '1px solid #000', margin: '4px 0' }} />
        <Row
          label="TOTALE"
          value={formatPrice(bill.total_amount)}
          bold
          large
        />
      </div>

      {/* Payment */}
      {payment && (
        <>
          <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />
          <div style={{ fontSize: '11px' }}>
            <Row
              label={`Pagato (${payMethodLabel})`}
              value={formatPrice(payment.received_amount || payment.amount)}
            />
            {payment.change_given > 0 && (
              <Row label="Resto" value={formatPrice(payment.change_given)} bold />
            )}
          </div>
        </>
      )}

      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

      {/* Footer */}
      <div className="text-center" style={{ fontSize: '10px', marginTop: '4px' }}>
        <div style={{ fontWeight: 700, marginBottom: '4px' }}>
          DOCUMENTO NON FISCALE
        </div>
        <div>Non valido ai fini fiscali</div>
        <div style={{ marginTop: '8px', fontSize: '11px' }}>
          Grazie e arrivederci ❤
        </div>
      </div>

      {/* Padding finale per la stampante (taglio) */}
      <div style={{ height: '20mm' }} />
    </div>
  )
}

function Row({ label, value, bold, large }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      fontWeight: bold ? 700 : 400,
      fontSize: large ? '14px' : 'inherit',
      marginTop: large ? '4px' : '0',
    }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}
