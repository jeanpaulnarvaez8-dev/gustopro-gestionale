import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'
import { tablesAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

/**
 * MenuQRPage — genera + stampa un QR MENU CLIENTE per ogni tavolo.
 *
 * QR formato: {origin}/menu/riva-beach/{numero_tavolo}
 * Il cliente lo inquadra → vede il menu + bottone "Chiama cameriere".
 * Layout stampa A4, 3 colonne, cartellino da ritagliare e mettere sul tavolo.
 */
const BASE = window.location.origin
const SLUG = 'riva-beach' // tenant Riva Beach Salento

export default function MenuQRPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [qr, setQr] = useState({})

  useEffect(() => {
    (async () => {
      try {
        const { data } = await tablesAPI.list()
        setTables(data)
        const map = {}
        await Promise.all(data.map(async (t) => {
          const url = `${BASE}/menu/${SLUG}/${encodeURIComponent(t.table_number)}`
          map[t.id] = await QRCode.toDataURL(url, {
            errorCorrectionLevel: 'M', margin: 1, width: 320,
            color: { dark: '#13181C', light: '#FFFFFF' },
          })
        }))
        setQr(map)
      } catch {
        toast({ type: 'error', title: 'Errore caricamento tavoli' })
      } finally { setLoading(false) }
    })()
  }, [toast])

  const sorted = [...tables].sort((a, b) =>
    String(a.table_number).localeCompare(String(b.table_number), 'it', { numeric: true }))

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 sticky top-0 z-20 no-print">
        <button onClick={() => navigate(-1)} className="text-[var(--color-text-2)] hover:text-[var(--color-text)] p-1.5 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <h1 className="serif text-lg font-bold text-[var(--color-text)] flex-1">QR Menu Cliente ({tables.length})</h1>
        <button
          onClick={() => window.print()}
          className="px-3 py-1.5 rounded-md bg-[var(--color-gold)] text-[#13181C] text-sm font-bold flex items-center gap-1.5 hover:brightness-110"
        >
          <Printer size={14} /> Stampa
        </button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-[var(--color-text-2)]">
          <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
          <span>Generazione QR…</span>
        </div>
      ) : (
        <div className="qrm-grid">
          {sorted.map(t => (
            <div key={t.id} className="qrm-card">
              <div className="qrm-top">RIVA BEACH SALENTO</div>
              <div className="qrm-scan">Inquadra per il MENU</div>
              {qr[t.id] && <img src={qr[t.id]} alt={`QR menu tavolo ${t.table_number}`} className="qrm-img" />}
              <div className="qrm-table">TAVOLO {t.table_number}</div>
              <div className="qrm-hint">📱 Menu + chiama il cameriere</div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .qrm-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          padding: 16px;
        }
        .qrm-card {
          background: #fff;
          border: 1px dashed #888;
          border-radius: 10px;
          padding: 14px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          break-inside: avoid;
          page-break-inside: avoid;
          color: #13181C;
        }
        .qrm-top { font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #9c7e1f; }
        .qrm-scan { font-size: 13px; font-weight: 600; margin-top: 2px; color: #444; }
        .qrm-img { width: 100%; max-width: 200px; height: auto; margin: 8px 0; }
        .qrm-table { font-family: Georgia, serif; font-size: 30px; font-weight: 800; line-height: 1; }
        .qrm-hint { font-size: 11px; color: #666; margin-top: 6px; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .qrm-grid { padding: 6mm; gap: 8mm; grid-template-columns: repeat(3, 1fr); }
          .qrm-card { border: 1px dashed #aaa; }
          @page { size: A4; margin: 6mm; }
        }
      `}</style>
    </div>
  )
}
