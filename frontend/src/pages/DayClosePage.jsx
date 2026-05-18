import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock, Printer, RefreshCw, History, Wallet, CheckCircle2 } from 'lucide-react'
import { dayCloseAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { Card, Badge } from '../components/v2'
import { formatPrice } from '../lib/utils'

/**
 * DayClosePage — chiusura cassa fine giornata (Z report non fiscale).
 *
 * Flow operativo:
 *   1. Cassiere a fine turno seleziona data + (opzionale) cassa specifica.
 *   2. Preview totali current → vede revenue, contante, carta, digitale.
 *   3. Conta fisicamente il contante nel cassetto → digita "physical_cash".
 *   4. Sistema mostra variance (sistema vs contato).
 *   5. Click "Chiudi giornata" → record sigillato in day_closures.
 *   6. Stampa report (CSS print) e mette nel quaderno cassa.
 */
const REGISTER_OPTS = [
  { id: '',         label: 'Tutte le casse' },
  { id: 'cassa_1',  label: 'Cassa 1' },
  { id: 'cassa_2',  label: 'Cassa 2' },
]

export default function DayClosePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [register, setRegister] = useState('')
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [physicalCash, setPhysicalCash] = useState('')
  const [notes, setNotes] = useState('')
  const [closing, setClosing] = useState(false)
  const [closed, setClosed] = useState(null) // result dopo chiusura
  const [history, setHistory] = useState([])

  async function loadPreview() {
    setLoading(true)
    try {
      const { data } = await dayCloseAPI.preview(date, register || null)
      setPreview(data)
      if (data.existing_closure?.physical_cash != null) {
        setPhysicalCash(String(data.existing_closure.physical_cash))
      }
      if (data.existing_closure?.notes) setNotes(data.existing_closure.notes)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento totali' })
    } finally { setLoading(false) }
  }

  async function loadHistory() {
    try {
      const { data } = await dayCloseAPI.list(30)
      setHistory(data)
    } catch { /* silent */ }
  }

  useEffect(() => { loadPreview() /* eslint-disable-line */ }, [date, register])
  useEffect(() => { loadHistory() }, [])

  async function handleClose() {
    if (!preview) return
    setClosing(true)
    try {
      const { data } = await dayCloseAPI.close({
        date,
        register: register || null,
        physical_cash: physicalCash !== '' ? parseFloat(physicalCash) : null,
        notes: notes || null,
      })
      setClosed(data)
      toast({ type: 'success', title: 'Giornata sigillata', message: `${date} — ${formatPrice(data.total_amount)}` })
      loadHistory()
    } catch (e) {
      toast({ type: 'error', title: 'Errore chiusura', message: e?.response?.data?.error || 'Riprova' })
    } finally { setClosing(false) }
  }

  const t = preview?.totals
  const variance = (physicalCash !== '' && t)
    ? (parseFloat(physicalCash) - parseFloat(t.total_cash)).toFixed(2)
    : null
  const existing = preview?.existing_closure

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 sticky top-0 z-20 flex-wrap no-print">
        <button onClick={() => navigate(-1)} className="text-[var(--color-text-2)] hover:text-[var(--color-text)] p-1.5 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <Lock size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif font-bold text-lg text-[var(--color-text)]">Chiusura Cassa</h1>
        <div className="ml-auto flex items-center gap-2 text-xs flex-wrap">
          <label className="text-[var(--color-text-3)]">Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today}
            className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-md px-2 py-1 text-[var(--color-text)]" />
          <select value={register} onChange={(e) => setRegister(e.target.value)}
            className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-md px-2 py-1 text-[var(--color-text)]">
            {REGISTER_OPTS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <button
            onClick={() => window.print()}
            disabled={!preview}
            className="px-2.5 py-1 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] flex items-center gap-1 disabled:opacity-40"
          >
            <Printer size={12} /> Stampa
          </button>
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        {loading && (
          <div className="flex items-center gap-2 text-[var(--color-text-2)] py-10 justify-center">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" /> <span className="text-sm">Calcolo totali…</span>
          </div>
        )}
        {!loading && preview && (
          <>
            {existing && !closed && (
              <Card padding="md" className="border-l-4 border-[var(--color-ok)]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-[var(--color-ok)] mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-[var(--color-text)]">Giornata già sigillata</p>
                    <p className="text-xs text-[var(--color-text-3)] mt-0.5">
                      Chiusa da <b>{existing.closed_by_name}</b> il {new Date(existing.closed_at).toLocaleString('it-IT')}
                    </p>
                    {existing.variance_cash != null && Math.abs(parseFloat(existing.variance_cash)) > 0.01 && (
                      <p className="text-xs mt-1">
                        <Badge tone={parseFloat(existing.variance_cash) < 0 ? 'err' : 'warn'} size="sm">
                          Scostamento cassa: {formatPrice(existing.variance_cash)}
                        </Badge>
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Z-Report preview (stampabile) */}
            <Card padding="lg" className="receipt-print">
              <div className="text-center mb-4">
                <h2 className="serif font-bold text-2xl text-[var(--color-text)]">CHIUSURA CASSA</h2>
                <p className="text-xs text-[var(--color-text-3)] uppercase tracking-wider mt-1">Documento non fiscale</p>
                <p className="text-sm text-[var(--color-text)] mt-2 tnum">
                  {date} {register && <span className="text-[var(--color-gold)] uppercase">· {register.replace('cassa_', 'C')}</span>}
                </p>
              </div>
              <div className="border-t border-dashed border-[var(--color-border-strong)] my-3" />
              <div className="space-y-2 text-sm font-mono">
                <Row label="Totale incassato" value={formatPrice(t.total_amount)} bold large />
                <Row label="• Contanti" value={formatPrice(t.total_cash)} />
                <Row label="• Carta" value={formatPrice(t.total_card)} />
                <Row label="• Digitale" value={formatPrice(t.total_digital)} />
                {parseFloat(t.total_other) > 0 && <Row label="• Altro" value={formatPrice(t.total_other)} />}
              </div>
              <div className="border-t border-dashed border-[var(--color-border-strong)] my-3" />
              <div className="space-y-1 text-xs text-[var(--color-text-2)]">
                <Row label="Pagamenti" value={t.num_payments} />
                <Row label="Ordini" value={t.num_orders} />
                <Row label="Ricevute" value={t.num_receipts} />
                <Row label="Coperti" value={t.num_covers} />
                {t.num_orders > 0 && (
                  <Row label="Scontrino medio" value={formatPrice(t.total_amount / t.num_orders)} />
                )}
              </div>
            </Card>

            {/* Riconciliazione fisica + chiusura */}
            <Card padding="md" className="no-print">
              <div className="flex items-center gap-2 mb-3">
                <Wallet size={16} className="text-[var(--color-gold)]" />
                <h3 className="font-bold text-[var(--color-text)] text-sm">Riconciliazione contanti</h3>
              </div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)] font-semibold">
                Contante effettivo nel cassetto (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={physicalCash}
                onChange={(e) => setPhysicalCash(e.target.value)}
                placeholder={`Sistema: ${parseFloat(t.total_cash).toFixed(2)}`}
                className="mt-1 w-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-gold)] tnum"
              />
              {variance !== null && (
                <p className="mt-2 text-sm font-bold tnum">
                  Scostamento:
                  <span className={`ml-2 ${parseFloat(variance) === 0 ? 'text-[var(--color-ok)]' : parseFloat(variance) < 0 ? 'text-[var(--color-err)]' : 'text-[var(--color-warn)]'}`}>
                    {formatPrice(variance)} {parseFloat(variance) === 0 ? '✓ OK' : parseFloat(variance) < 0 ? '(mancante)' : '(eccesso)'}
                  </span>
                </p>
              )}

              <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)] font-semibold mt-3 block">
                Note (opzionali)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="es. fondo cassa cambiato a metà servizio, mancata di un cliente, etc."
                className="mt-1 w-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-gold)]"
              />

              <button
                onClick={handleClose}
                disabled={closing}
                className="mt-4 w-full px-4 py-2.5 rounded-lg bg-[var(--color-gold)] text-[#13181C] font-bold text-sm disabled:opacity-50 hover:brightness-110 flex items-center justify-center gap-2"
              >
                <Lock size={14} />
                {closing ? 'Sto sigillando…' : (existing ? 'Aggiorna chiusura' : 'Chiudi giornata')}
              </button>
              <p className="text-[10px] text-[var(--color-text-3)] mt-2 text-center">
                La chiusura non cancella ordini né ricevute, sigilla i totali per audit.
              </p>
            </Card>

            {/* Storico ultime chiusure */}
            <div className="no-print">
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)] font-semibold mb-2 flex items-center gap-1"><History size={11}/> Storico ultime chiusure</h3>
              <Card padding="none" className="overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--color-surface-2)] text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
                      <th className="text-left px-3 py-2">Data</th>
                      <th className="text-left px-3 py-2">Cassa</th>
                      <th className="text-right px-3 py-2">Totale</th>
                      <th className="text-right px-3 py-2">Variance</th>
                      <th className="text-left px-3 py-2">Chiusa da</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-4 text-[var(--color-text-3)]">Nessuna chiusura.</td></tr>
                    )}
                    {history.map(h => (
                      <tr key={h.id} className="border-t border-[var(--color-border-soft)]">
                        <td className="px-3 py-2 text-[var(--color-text)] tnum">{h.business_date}</td>
                        <td className="px-3 py-2 text-[var(--color-text-2)] uppercase">{h.register || 'tutte'}</td>
                        <td className="px-3 py-2 text-right tnum text-[var(--color-gold)] font-semibold">{formatPrice(h.total_amount)}</td>
                        <td className="px-3 py-2 text-right tnum">
                          {h.variance_cash != null ? (
                            <span className={Math.abs(parseFloat(h.variance_cash)) < 0.01 ? 'text-[var(--color-ok)]' : 'text-[var(--color-err)]'}>
                              {formatPrice(h.variance_cash)}
                            </span>
                          ) : <span className="text-[var(--color-text-3)]">—</span>}
                        </td>
                        <td className="px-3 py-2 text-[var(--color-text-3)]">{h.closed_by_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  )
}

function Row({ label, value, bold, large }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-bold text-[var(--color-text)]' : 'text-[var(--color-text-2)]'}>{label}</span>
      <span className={`tnum ${bold ? 'font-bold' : ''} ${large ? 'text-lg text-[var(--color-gold)]' : 'text-[var(--color-text)]'}`}>{value}</span>
    </div>
  )
}
