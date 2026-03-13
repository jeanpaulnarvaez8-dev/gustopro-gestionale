import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Download, RefreshCw, AlertTriangle, Calendar, Receipt, FileCode } from 'lucide-react'
import { adminAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'
import { useToast } from '../context/ToastContext'

// ─── Helpers ─────────────────────────────────────────────────

function fmt2(n) { return n.toFixed(2) }
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Genera XML in formato DatiFiscali/Corrispettivi AdE (RT-ready)
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

// ─── Period presets ───────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────

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

  useEffect(() => { load(from, to) }, [])

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

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">

      {/* Header */}
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <FileText size={17} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Corrispettivi Fiscali</span>
        <span className="text-[#555] text-xs">Registro per Agenzia delle Entrate</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleExportCSV} disabled={!data || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#3A3A3A] text-[#888] hover:text-[#F5F5DC] hover:border-[#555] rounded-lg text-xs transition disabled:opacity-30">
            <Download size={12} /> CSV
          </button>
          <button onClick={handleExportXML} disabled={!data || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#3A3A3A] text-[#888] hover:text-[#D4AF37] hover:border-[#D4AF37]/50 rounded-lg text-xs transition disabled:opacity-30">
            <FileCode size={12} /> XML AdE
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 max-w-4xl mx-auto w-full">

        {/* Avviso integrazione futura */}
        <div className="flex items-start gap-3 bg-amber-900/15 border border-amber-500/25 rounded-xl p-4">
          <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-300/80 leading-relaxed">
            <span className="font-semibold text-amber-300">Prossima integrazione RT:</span> i dati qui mostrati sono pronti per la trasmissione telematica tramite Registratore di Cassa. L'export XML segue il formato {' '}
            <span className="font-mono bg-amber-900/30 px-1 rounded">CorrispettiviTelematici</span> dell'AdE. La trasmissione automatica verrà attivata collegando il servizio RT.
          </div>
        </div>

        {/* Period selector */}
        <div className="bg-[#222] border border-[#3A3A3A] rounded-2xl p-4 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  preset === p.key
                    ? 'bg-[#D4AF37] text-[#1A1A1A]'
                    : 'bg-[#2A2A2A] text-[#888] hover:text-[#F5F5DC] border border-[#3A3A3A]'
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Calendar size={13} className="text-[#555]" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-xs outline-none focus:border-[#D4AF37]/60 transition" />
            <span className="text-[#555] text-xs">→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-xs outline-none focus:border-[#D4AF37]/60 transition" />
            <button onClick={applyCustom}
              className="px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:bg-[#c9a42e] transition">
              Applica
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <RefreshCw size={20} className="animate-spin text-[#555]" />
          </div>
        )}

        {!loading && data && (
          <>
            {/* KPI totali */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Totale lordo',      value: formatPrice(data.totale.lordo),        color: 'text-[#D4AF37]' },
                { label: 'Totale imponibile', value: formatPrice(data.totale.imponibile),    color: 'text-blue-400' },
                { label: 'IVA totale',        value: formatPrice(data.totale.iva),           color: 'text-amber-400' },
                { label: 'N° scontrini',      value: data.totale.num_scontrini,              color: 'text-emerald-400' },
              ].map(k => (
                <div key={k.label} className="bg-[#222] border border-[#3A3A3A] rounded-xl p-4">
                  <p className="text-[#555] text-xs uppercase tracking-wide mb-1">{k.label}</p>
                  <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Riepilogo IVA per aliquota */}
            <div className="bg-[#222] border border-[#3A3A3A] rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#3A3A3A] flex items-center gap-2">
                <Receipt size={14} className="text-[#D4AF37]" />
                <span className="text-[#F5F5DC] font-semibold text-sm">Riepilogo IVA per aliquota</span>
                <span className="text-[#555] text-xs ml-auto">
                  {fmtDate(data.periodo.from)}{data.periodo.from !== data.periodo.to ? ` → ${fmtDate(data.periodo.to)}` : ''}
                </span>
              </div>

              {data.by_aliquota.length === 0 ? (
                <p className="text-[#555] text-xs text-center py-10">Nessun dato nel periodo selezionato</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2E2E2E]">
                      <th className="text-left px-5 py-2.5 text-[#555] text-xs font-medium">Aliquota IVA</th>
                      <th className="text-right px-5 py-2.5 text-[#555] text-xs font-medium">N° Scontrini</th>
                      <th className="text-right px-5 py-2.5 text-[#555] text-xs font-medium">Imponibile</th>
                      <th className="text-right px-5 py-2.5 text-[#555] text-xs font-medium">IVA</th>
                      <th className="text-right px-5 py-2.5 text-[#555] text-xs font-medium">Lordo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_aliquota.map(r => (
                      <tr key={r.aliquota} className="border-b border-[#252525] last:border-0 hover:bg-[#252525] transition">
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 bg-amber-900/20 border border-amber-500/25 text-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                            {fmt2(r.aliquota)}%
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-[#888] text-sm">{r.num_scontrini}</td>
                        <td className="px-5 py-3 text-right text-[#F5F5DC] text-sm font-medium">{formatPrice(r.imponibile)}</td>
                        <td className="px-5 py-3 text-right text-amber-400 text-sm font-medium">{formatPrice(r.iva)}</td>
                        <td className="px-5 py-3 text-right text-[#D4AF37] text-sm font-bold">{formatPrice(r.lordo)}</td>
                      </tr>
                    ))}
                    {/* Riga totale */}
                    <tr className="bg-[#1E1E1E] border-t-2 border-[#3A3A3A]">
                      <td className="px-5 py-3 text-[#888] text-xs font-bold uppercase tracking-wide">Totale</td>
                      <td className="px-5 py-3 text-right text-[#888] text-sm font-bold">{data.totale.num_scontrini}</td>
                      <td className="px-5 py-3 text-right text-[#F5F5DC] text-sm font-bold">{formatPrice(data.totale.imponibile)}</td>
                      <td className="px-5 py-3 text-right text-amber-400 text-sm font-bold">{formatPrice(data.totale.iva)}</td>
                      <td className="px-5 py-3 text-right text-[#D4AF37] text-sm font-bold">{formatPrice(data.totale.lordo)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Corrispettivi giornalieri */}
            {data.by_day.length > 0 && (
              <div className="bg-[#222] border border-[#3A3A3A] rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#3A3A3A]">
                  <span className="text-[#F5F5DC] font-semibold text-sm">Corrispettivi giornalieri</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2E2E2E]">
                      <th className="text-left px-5 py-2.5 text-[#555] text-xs font-medium">Data</th>
                      <th className="text-right px-5 py-2.5 text-[#555] text-xs font-medium">N° Scontrini</th>
                      <th className="text-right px-5 py-2.5 text-[#555] text-xs font-medium">IVA</th>
                      <th className="text-right px-5 py-2.5 text-[#555] text-xs font-medium">Lordo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_day.map(r => (
                      <tr key={r.giorno} className="border-b border-[#252525] last:border-0 hover:bg-[#252525] transition">
                        <td className="px-5 py-2.5 text-[#F5F5DC] text-sm">{fmtDate(r.giorno)}</td>
                        <td className="px-5 py-2.5 text-right text-[#888] text-sm">{r.num_scontrini}</td>
                        <td className="px-5 py-2.5 text-right text-amber-400 text-sm">{formatPrice(r.iva)}</td>
                        <td className="px-5 py-2.5 text-right text-[#D4AF37] font-semibold text-sm">{formatPrice(r.lordo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Nota RT */}
            <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 text-xs text-[#555] leading-relaxed">
              <p className="font-semibold text-[#888] mb-1.5">Come funzionerà la trasmissione RT</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Il Registratore Telematico (RT) riceverà i dati da questo sistema via API</li>
                <li>Ogni chiusura giornaliera genererà un file XML <span className="font-mono text-[#666]">CorrispettiviTelematici</span></li>
                <li>Il file verrà trasmesso automaticamente all'AdE entro le 24h successive</li>
                <li>Il numero di matricola RT e il codice fiscale dell'esercizio vanno configurati in Impostazioni</li>
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
