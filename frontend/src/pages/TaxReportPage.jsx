import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Download, RefreshCw, AlertTriangle, Calendar, Receipt, FileCode } from 'lucide-react'
import { adminAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'
import { useToast } from '../context/ToastContext'
import { Card, Badge, Button } from '../components/v2'

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt2(n) { return n.toFixed(2) }
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function buildXML(data) {
  const { periodo, by_aliquota, by_day, totale } = data

  const righeAliquota = by_aliquota.map(r => `
    <DatiRiepilogo>
      <AliquotaIVA>${fmt2(r.aliquota)}</AliquotaIVA>
      <EsigibilitaIVA>I</EsigibilitaIVA>
      <ImponibileImporto>${fmt2(r.imponibile)}</ImponibileImporto>
      <Imposta>${fmt2(r.iva)}</Imposta>
    </DatiRiepilogo>`).join('')

  const righeGiornaliere = by_day.map(r => `
    <Corrispettivo>
      <Data>${r.giorno}</Data>
      <NumeroScontrini>${r.num_scontrini}</NumeroScontrini>
      <ImportoLordo>${fmt2(r.lordo)}</ImportoLordo>
      <IVATotale>${fmt2(r.iva)}</IVATotale>
    </Corrispettivo>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<CorrispettiviTelematici xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Periodo>
    <Dal>${periodo.from}</Dal>
    <Al>${periodo.to}</Al>
  </Periodo>
  <RiepilogoIVA>${righeAliquota}
  </RiepilogoIVA>
  <CorrispettiviGiornalieri>${righeGiornaliere}
  </CorrispettiviGiornalieri>
  <Totale>
    <ImportoLordo>${fmt2(totale.lordo)}</ImportoLordo>
    <ImponibileTotale>${fmt2(totale.imponibile)}</ImponibileTotale>
    <IVATotale>${fmt2(totale.iva)}</IVATotale>
    <NumeroScontrini>${totale.num_scontrini}</NumeroScontrini>
  </Totale>
</CorrispettiviTelematici>`
}

function buildCSV(data) {
  const { by_aliquota, by_day } = data
  const lines = [
    '--- RIEPILOGO IVA PER ALIQUOTA ---',
    'Aliquota %;N° Scontrini;Imponibile €;IVA €;Lordo €',
    ...by_aliquota.map(r =>
      `${fmt2(r.aliquota)};${r.num_scontrini};${fmt2(r.imponibile)};${fmt2(r.iva)};${fmt2(r.lordo)}`
    ),
    '',
    '--- CORRISPETTIVI GIORNALIERI ---',
    'Data;N° Scontrini;Lordo €;IVA €',
    ...by_day.map(r =>
      `${r.giorno};${r.num_scontrini};${fmt2(r.lordo)};${fmt2(r.iva)}`
    ),
  ]
  return lines.join('\n')
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function getPreset(preset) {
  const now   = new Date()
  const pad   = n => String(n).padStart(2, '0')
  const fmt   = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  const today = fmt(now)

  if (preset === 'today') return { from: today, to: today }
  if (preset === 'week') {
    const mon = new Date(now)
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    return { from: fmt(mon), to: today }
  }
  if (preset === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: fmt(first), to: today }
  }
  if (preset === 'lastmonth') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last  = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: fmt(first), to: fmt(last) }
  }
  return { from: today, to: today }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function TaxReportPage() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [preset, setPreset]     = useState('today')
  const [from, setFrom]         = useState(() => getPreset('today').from)
  const [to, setTo]             = useState(() => getPreset('today').to)
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)

  const load = useCallback(async (f, t) => {
    setLoading(true)
    try {
      const r = await adminAPI.taxReport(f, t)
      setData(r.data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento dati fiscali' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load(from, to) }, []) // eslint-disable-line

  const applyPreset = (p) => {
    setPreset(p)
    const range = getPreset(p)
    setFrom(range.from)
    setTo(range.to)
    load(range.from, range.to)
  }

  const applyCustom = () => {
    setPreset('custom')
    load(from, to)
  }

  const handleExportCSV = () => {
    if (!data) return
    download(buildCSV(data), `corrispettivi_${from}_${to}.csv`, 'text/csv;charset=utf-8;')
    toast({ type: 'success', title: 'CSV esportato' })
  }

  const handleExportXML = () => {
    if (!data) return
    download(buildXML(data), `corrispettivi_${from}_${to}.xml`, 'application/xml')
    toast({ type: 'success', title: 'XML AdE esportato' })
  }

  const PRESETS = [
    { key: 'today',     label: 'Oggi' },
    { key: 'week',      label: 'Settimana' },
    { key: 'month',     label: 'Mese corrente' },
    { key: 'lastmonth', label: 'Mese scorso' },
  ]

  const dateInputCls = 'bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-3 py-1.5 text-[var(--color-text)] text-xs outline-none transition tnum'

  return (
    <div className="min-h-screen flex flex-col">

      {/* Header */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-20">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <FileText size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Corrispettivi fiscali
        </h1>
        <span className="hidden md:inline text-[var(--color-text-3)] text-xs">
          Registro per Agenzia delle Entrate
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!data || loading}
            leftIcon={<Download size={12} />}
            onClick={handleExportCSV}
          >
            CSV
          </Button>
          <Button
            size="sm"
            disabled={!data || loading}
            leftIcon={<FileCode size={12} />}
            onClick={handleExportXML}
          >
            XML AdE
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-5 max-w-4xl mx-auto w-full">

        {/* Avviso integrazione futura */}
        <div className="flex items-start gap-3 bg-[var(--color-warn-soft)] border border-[var(--color-warn)]/30 rounded-xl p-4">
          <AlertTriangle size={15} className="text-[var(--color-warn)] shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--color-text-2)] leading-relaxed">
            <span className="font-semibold text-[var(--color-warn)]">Prossima integrazione RT:</span> i dati qui
            mostrati sono pronti per la trasmissione telematica tramite Registratore di Cassa. L&apos;export XML segue
            il formato {' '}
            <span className="font-mono bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded text-[var(--color-warn)]">CorrispettiviTelematici</span>
            {' '}dell&apos;AdE. La trasmissione automatica verrà attivata collegando il servizio RT.
          </div>
        </div>

        {/* Period selector */}
        <Card padding="md" className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  preset === p.key
                    ? 'bg-[var(--color-gold)] text-[#13181C]'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text)] border border-[var(--color-border-strong)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Calendar size={13} className="text-[var(--color-text-3)]" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={dateInputCls} />
            <span className="text-[var(--color-text-3)] text-xs">→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={dateInputCls} />
            <Button size="sm" onClick={applyCustom}>
              Applica
            </Button>
          </div>
        </Card>

        {loading && (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={20} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento dati fiscali…</span>
          </div>
        )}

        {!loading && data && (
          <>
            {/* KPI totali */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Totale lordo',      value: formatPrice(data.totale.lordo),        tone: 'gold' },
                { label: 'Totale imponibile', value: formatPrice(data.totale.imponibile),    tone: 'sea'  },
                { label: 'IVA totale',        value: formatPrice(data.totale.iva),           tone: 'warn' },
                { label: 'N° scontrini',      value: data.totale.num_scontrini,              tone: 'ok'   },
              ].map(k => (
                <Card key={k.label} padding="md">
                  <p className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold mb-1.5">{k.label}</p>
                  <p className={`serif text-2xl font-bold tnum text-[var(--color-${k.tone})]`}>{k.value}</p>
                </Card>
              ))}
            </div>

            {/* Riepilogo IVA per aliquota */}
            <Card padding="none" className="overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--color-border-soft)] flex items-center gap-2 bg-[var(--color-surface-2)]">
                <Receipt size={14} className="text-[var(--color-gold)]" />
                <span className="serif text-[var(--color-text)] font-bold text-base tracking-tight">Riepilogo IVA per aliquota</span>
                <span className="text-[var(--color-text-3)] text-xs ml-auto tnum">
                  {fmtDate(data.periodo.from)}{data.periodo.from !== data.periodo.to ? ` → ${fmtDate(data.periodo.to)}` : ''}
                </span>
              </div>

              {data.by_aliquota.length === 0 ? (
                <p className="text-[var(--color-text-3)] text-sm text-center py-10">Nessun dato nel periodo selezionato</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border-soft)]">
                        <th className="text-left px-5 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Aliquota IVA</th>
                        <th className="text-right px-5 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">N° Scontrini</th>
                        <th className="text-right px-5 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Imponibile</th>
                        <th className="text-right px-5 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">IVA</th>
                        <th className="text-right px-5 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Lordo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_aliquota.map(r => (
                        <tr key={r.aliquota} className="border-b border-[var(--color-border-soft)] last:border-0 hover:bg-[rgba(212,175,55,0.04)] transition">
                          <td className="px-5 py-3">
                            <Badge tone="warn" size="md">{fmt2(r.aliquota)}%</Badge>
                          </td>
                          <td className="px-5 py-3 text-right text-[var(--color-text-2)] text-sm tnum">{r.num_scontrini}</td>
                          <td className="px-5 py-3 text-right text-[var(--color-text)] text-sm font-semibold tnum">{formatPrice(r.imponibile)}</td>
                          <td className="px-5 py-3 text-right text-[var(--color-warn)] text-sm font-semibold tnum">{formatPrice(r.iva)}</td>
                          <td className="px-5 py-3 text-right text-[var(--color-gold)] text-sm font-bold tnum">{formatPrice(r.lordo)}</td>
                        </tr>
                      ))}
                      <tr className="bg-[var(--color-surface-2)] border-t-2 border-[var(--color-border-strong)]">
                        <td className="px-5 py-3 text-[var(--color-text-2)] text-xs font-bold uppercase tracking-wide">Totale</td>
                        <td className="px-5 py-3 text-right text-[var(--color-text)] text-sm font-bold tnum">{data.totale.num_scontrini}</td>
                        <td className="px-5 py-3 text-right text-[var(--color-text)] text-sm font-bold tnum">{formatPrice(data.totale.imponibile)}</td>
                        <td className="px-5 py-3 text-right text-[var(--color-warn)] text-sm font-bold tnum">{formatPrice(data.totale.iva)}</td>
                        <td className="px-5 py-3 text-right text-[var(--color-gold)] text-sm font-bold tnum">{formatPrice(data.totale.lordo)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Corrispettivi giornalieri */}
            {data.by_day.length > 0 && (
              <Card padding="none" className="overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--color-border-soft)] bg-[var(--color-surface-2)]">
                  <span className="serif text-[var(--color-text)] font-bold text-base tracking-tight">Corrispettivi giornalieri</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border-soft)]">
                        <th className="text-left px-5 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Data</th>
                        <th className="text-right px-5 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">N° Scontrini</th>
                        <th className="text-right px-5 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">IVA</th>
                        <th className="text-right px-5 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Lordo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_day.map(r => (
                        <tr key={r.giorno} className="border-b border-[var(--color-border-soft)] last:border-0 hover:bg-[rgba(212,175,55,0.04)] transition">
                          <td className="px-5 py-2.5 text-[var(--color-text)] text-sm tnum">{fmtDate(r.giorno)}</td>
                          <td className="px-5 py-2.5 text-right text-[var(--color-text-2)] text-sm tnum">{r.num_scontrini}</td>
                          <td className="px-5 py-2.5 text-right text-[var(--color-warn)] text-sm tnum">{formatPrice(r.iva)}</td>
                          <td className="px-5 py-2.5 text-right text-[var(--color-gold)] font-bold text-sm tnum">{formatPrice(r.lordo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Nota RT */}
            <Card variant="outline" padding="md" className="text-xs text-[var(--color-text-3)] leading-relaxed">
              <p className="font-semibold text-[var(--color-text-2)] mb-1.5">Come funzionerà la trasmissione RT</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Il Registratore Telematico (RT) riceverà i dati da questo sistema via API</li>
                <li>Ogni chiusura giornaliera genererà un file XML <span className="font-mono text-[var(--color-text-2)]">CorrispettiviTelematici</span></li>
                <li>Il file verrà trasmesso automaticamente all&apos;AdE entro le 24h successive</li>
                <li>Il numero di matricola RT e il codice fiscale dell&apos;esercizio vanno configurati in Impostazioni</li>
              </ol>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
