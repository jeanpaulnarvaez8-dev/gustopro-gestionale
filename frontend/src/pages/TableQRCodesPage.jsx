import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, Download, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'
import { tablesAPI, zonesAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

/**
 * TableQRCodesPage — genera + stampa QR cavalieri per tutti i tavoli.
 *
 * QR formato: https://gestione.gustopro.it/t/{table_id}
 * (il path /t/:id puo' poi puntare a una landing pubblica con il menu —
 * per ora rimanda alla home, scanner interno usa solo l'ID).
 *
 * Layout stampa: griglia 4 colonne A4 con QR 5cm + numero tavolo grande
 * sotto. Stampabile direttamente dal browser (@media print).
 */
const BASE = window.location.origin

export default function TableQRCodesPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [tables, setTables] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [qrDataUrls, setQrDataUrls] = useState({})
  const [zoneFilter, setZoneFilter] = useState('all')

  useEffect(() => {
    (async () => {
      try {
        const [tRes, zRes] = await Promise.all([tablesAPI.list(), zonesAPI.list()])
        setTables(tRes.data)
        setZones(zRes.data)
        // Genera QR per ogni tavolo (parallel, 200 QR max non rallenta)
        const map = {}
        await Promise.all(tRes.data.map(async (t) => {
          const url = `${BASE}/t/${t.id}`
          map[t.id] = await QRCode.toDataURL(url, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 300,
            color: { dark: '#000000', light: '#FFFFFF' },
          })
        }))
        setQrDataUrls(map)
      } catch {
        toast({ type: 'error', title: 'Errore caricamento tavoli' })
      } finally { setLoading(false) }
    })()
  }, [toast])

  const filtered = tables
    .filter(t => zoneFilter === 'all' ? true : t.zone_id === zoneFilter)
    .sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), 'it', { numeric: true }))

  const zoneName = (id) => zones.find(z => z.id === id)?.name || ''

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      {/* Header (no-print) */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 sticky top-0 z-20 no-print">
        <button onClick={() => navigate(-1)} className="text-[var(--color-text-2)] hover:text-[var(--color-text)] p-1.5 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <h1 className="serif text-lg font-bold text-[var(--color-text)] flex-1">QR Cavalieri Tavoli</h1>
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-text)]"
        >
          <option value="all">Tutte le zone ({tables.length})</option>
          {zones.map(z => (
            <option key={z.id} value={z.id}>{z.name} ({tables.filter(t => t.zone_id === z.id).length})</option>
          ))}
        </select>
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
        <div className="qr-grid">
          {filtered.map(t => (
            <div key={t.id} className="qr-card">
              {qrDataUrls[t.id] && (
                <img src={qrDataUrls[t.id]} alt={`QR T${t.table_number}`} className="qr-img" />
              )}
              <div className="qr-label">
                <div className="qr-number">{t.table_number}</div>
                <div className="qr-zone">{zoneName(t.zone_id)}</div>
                <div className="qr-brand">Riva Beach Salento</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CSS print + grid */}
      <style>{`
        .qr-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          padding: 16px;
          max-width: 100%;
        }
        .qr-card {
          background: white;
          border: 1px dashed #888;
          border-radius: 8px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .qr-img { width: 100%; max-width: 180px; height: auto; }
        .qr-label { text-align: center; margin-top: 6px; color: #000; }
        .qr-number {
          font-family: Georgia, serif;
          font-size: 32px;
          font-weight: 800;
          line-height: 1;
        }
        .qr-zone {
          font-size: 11px;
          color: #555;
          margin-top: 2px;
          letter-spacing: 0.4px;
        }
        .qr-brand {
          font-size: 9px;
          color: #888;
          margin-top: 4px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .qr-grid {
            padding: 6mm;
            gap: 6mm;
            grid-template-columns: repeat(4, 1fr);
          }
          .qr-card {
            border: 1px dashed #aaa;
            page-break-inside: avoid;
          }
          @page { size: A4; margin: 5mm; }
        }
      `}</style>
    </div>
  )
}
