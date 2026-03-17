import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Download, RefreshCw, Calendar, AlertTriangle, TrendingDown, CheckCircle2 } from 'lucide-react'
import { adminAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

// ─── Helpers ──────────────────────────────────────────────────
function fmt3(n) { return parseFloat(n).toFixed(3) }
function fmt2(n) { return parseFloat(n).toFixed(2) }

function getPreset(preset) {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  const today = fmt(now)
  if (preset === 'today')     return { from: today, to: today }
  if (preset === 'week') {
    const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay()+6)%7))
    return { from: fmt(mon), to: today }
  }
  if (preset === 'month') {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
  }
  if (preset === 'lastmonth') {
    const first = new Date(now.getFullYear(), now.getMonth()-1, 1)
    const last  = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: fmt(first), to: fmt(last) }
  }
  return { from: today, to: today }
}

function buildCSV(data, physicalStock) {
  const lines = [
    `Riconciliazione Stock — ${data.periodo.from} → ${data.periodo.to}`,
    '',
    'Ingrediente;Unità;Stock DB;Inventario Fisico;Differenza;Costo Perdita €;Carichi;Consumo Ordini;Scarichi Manuali;Rettifiche',
    ...data.items.map(item => {
      const physical = parseFloat(physicalStock[item.id] ?? '')
      const hasMeasure = !isNaN(physical)
      const diff = hasMeasure ? physical - item.current_stock : ''
      const loss = (diff !== '' && diff < 0) ? Math.abs(diff) * item.cost_per_unit : 0
      return [
        item.name, item.unit,
        fmt3(item.current_stock),
        hasMeasure ? fmt3(physical) : '',
        diff !== '' ? fmt3(diff) : '',
        loss > 0 ? fmt2(loss) : '',
        fmt3(item.qty_in),
        fmt3(item.qty_consumed),
        fmt3(item.qty_manual_out),
        fmt3(item.qty_adjustment),
      ].join(';')
    }),
  ]
  return lines.join('\n')
}

function download(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const PRESETS = [
  { key: 'today',     label: 'Oggi' },
  { key: 'week',      label: 'Settimana' },
  { key: 'month',     label: 'Mese corrente' },
  { key: 'lastmonth', label: 'Mese scorso' },
]

// ─── Page ──────────────────────────────────────────────────────
export default function StockReconciliationPage() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [preset, setPreset]           = useState('today')
  const [from, setFrom]               = useState(() => getPreset('today').from)
  const [to, setTo]                   = useState(() => getPreset('today').to)
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(false)
  const [physicalStock, setPhysical]  = useState({})  // { [id]: string }
  const [search, setSearch]           = useState('')

  const load = useCallback(async (f, t) => {
    setLoading(true)
    setPhysical({})
    try {
      const r = await adminAPI.stockReconciliation(f, t)
      setData(r.data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento' })
    } finally { setLoading(false) }
  }, [toast])

  const applyPreset = (p) => {
    setPreset(p)
    const range = getPreset(p)
    setFrom(range.from); setTo(range.to)
    load(range.from, range.to)
  }

  const applyCustom = () => { setPreset('custom'); load(from, to) }

  // KPI calcolati
  const filledItems = data?.items.filter(i => !isNaN(parseFloat(physicalStock[i.id] ?? ''))) ?? []
  const totLoss = filledItems.reduce((acc, item) => {
    const diff = parseFloat(physicalStock[item.id]) - item.current_stock
    return diff < 0 ? acc + Math.abs(diff) * item.cost_per_unit : acc
  }, 0)
  const countGap = filledItems.filter(item =>
    parseFloat(physicalStock[item.id]) < item.current_stock
  ).length

  const visible = (data?.items ?? []).filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">

      {/* Header */}
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <ClipboardList size={17} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Riconciliazione Stock</span>
        <span className="text-[#555] text-xs hidden md:block">Confronta sistema vs inventario fisico</span>
        <div className="ml-auto">
          <button onClick={() => { if (!data) return; download(buildCSV(data, physicalStock), `riconciliazione_${from}_${to}.csv`); toast({ type: 'success', title: 'CSV esportato' }) }}
            disabled={!data || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#3A3A3A] text-[#888] hover:text-[#F5F5DC] hover:border-[#555] rounded-lg text-xs transition disabled:opacity-30">
            <Download size={12} /> CSV
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 max-w-6xl mx-auto w-full">

        {/* Period selector */}
        <div className="bg-[#222] border border-[#3A3A3A] rounded-2xl p-4 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  preset === p.key ? 'bg-[#D4AF37] text-[#1A1A1A]' : 'bg-[#2A2A2A] text-[#888] hover:text-[#F5F5DC] border border-[#3A3A3A]'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Calendar size={13} className="text-[#555]" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-xs outline-none focus:border-[#D4AF37]/60" />
            <span className="text-[#555] text-xs">→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-xs outline-none focus:border-[#D4AF37]/60" />
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
            {/* KPI */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#222] border border-[#3A3A3A] rounded-xl p-4">
                <p className="text-[#555] text-xs uppercase tracking-wide mb-1">Perdita stimata</p>
                <p className={`text-2xl font-bold ${totLoss > 0 ? 'text-red-400' : 'text-[#555]'}`}>
                  {totLoss > 0 ? `€ ${fmt2(totLoss)}` : '—'}
                </p>
                <p className="text-[#555] text-xs mt-1">{filledItems.length} ingredienti misurati</p>
              </div>
              <div className="bg-[#222] border border-[#3A3A3A] rounded-xl p-4">
                <p className="text-[#555] text-xs uppercase tracking-wide mb-1">Con discrepanza</p>
                <p className={`text-2xl font-bold ${countGap > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {countGap}
                </p>
                <p className="text-[#555] text-xs mt-1">ingredienti sotto il sistema</p>
              </div>
              <div className="bg-[#222] border border-[#3A3A3A] rounded-xl p-4">
                <p className="text-[#555] text-xs uppercase tracking-wide mb-1">Totale ingredienti</p>
                <p className="text-2xl font-bold text-[#F5F5DC]">{data.items.length}</p>
                <p className="text-[#555] text-xs mt-1">attivi in magazzino</p>
              </div>
            </div>

            {/* Istruzioni */}
            <div className="flex items-start gap-3 bg-blue-900/15 border border-blue-500/25 rounded-xl p-4">
              <AlertTriangle size={14} className="text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300/80 leading-relaxed">
                Inserisci il <strong className="text-blue-300">peso fisico reale</strong> nella colonna "Inventario fisico" dopo aver pesato/contato la merce.
                La <strong className="text-blue-300">differenza</strong> = fisico − sistema: se negativa (rossa) c'è una perdita non spiegata dal gestionale (porzioni eccessive, spreco, furto).
              </p>
            </div>

            {/* Search */}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca ingrediente..."
              className="bg-[#222] border border-[#3A3A3A] rounded-lg px-4 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 w-full max-w-xs" />

            {/* Tabella */}
            <div className="bg-[#222] border border-[#3A3A3A] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2E2E2E]">
                      <th className="text-left px-4 py-3 text-[#555] text-xs font-medium">Ingrediente</th>
                      <th className="text-right px-4 py-3 text-[#555] text-xs font-medium">Carichi</th>
                      <th className="text-right px-4 py-3 text-[#555] text-xs font-medium">Consumo ordini</th>
                      <th className="text-right px-4 py-3 text-[#555] text-xs font-medium">Scarichi manuali</th>
                      <th className="text-right px-4 py-3 text-[#555] text-xs font-medium">Rettifiche</th>
                      <th className="text-right px-4 py-3 text-[#555] text-xs font-medium">Stock sistema</th>
                      <th className="text-right px-4 py-3 text-[#D4AF37] text-xs font-medium">Inventario fisico</th>
                      <th className="text-right px-4 py-3 text-[#555] text-xs font-medium">Differenza</th>
                      <th className="text-right px-4 py-3 text-[#555] text-xs font-medium">Costo perdita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(item => {
                      const physical  = parseFloat(physicalStock[item.id] ?? '')
                      const hasVal    = !isNaN(physical)
                      const diff      = hasVal ? physical - item.current_stock : null
                      const loss      = (diff !== null && diff < 0) ? Math.abs(diff) * item.cost_per_unit : 0
                      const isLoss    = diff !== null && diff < 0
                      const isOk      = diff !== null && diff >= 0

                      return (
                        <tr key={item.id} className="border-b border-[#252525] last:border-0 hover:bg-[#252525] transition">
                          <td className="px-4 py-2.5">
                            <span className="text-[#F5F5DC] text-sm">{item.name}</span>
                            <span className="text-[#555] text-xs ml-1.5">{item.unit}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-emerald-400 text-xs">
                            {item.qty_in > 0 ? `+${fmt3(item.qty_in)}` : <span className="text-[#444]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-red-400/70 text-xs">
                            {item.qty_consumed > 0 ? `-${fmt3(item.qty_consumed)}` : <span className="text-[#444]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-orange-400/70 text-xs">
                            {item.qty_manual_out > 0 ? `-${fmt3(item.qty_manual_out)}` : <span className="text-[#444]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-blue-400/70 text-xs">
                            {item.qty_adjustment !== 0 ? fmt3(item.qty_adjustment) : <span className="text-[#444]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[#F5F5DC] text-sm font-medium">
                            {fmt3(item.current_stock)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="number" step="0.001"
                              value={physicalStock[item.id] ?? ''}
                              onChange={e => setPhysical(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="—"
                              className="w-24 bg-[#2A2A2A] border border-[#D4AF37]/30 rounded-lg px-2 py-1 text-[#F5F5DC] text-sm text-right outline-none focus:border-[#D4AF37]/70 transition"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-semibold">
                            {diff === null ? <span className="text-[#444]">—</span>
                              : isLoss
                                ? <span className="text-red-400 flex items-center justify-end gap-1"><TrendingDown size={12} />{fmt3(diff)}</span>
                                : <span className="text-emerald-400 flex items-center justify-end gap-1"><CheckCircle2 size={12} />+{fmt3(diff)}</span>
                            }
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm">
                            {loss > 0
                              ? <span className="text-red-400 font-bold">€ {fmt2(loss)}</span>
                              : <span className="text-[#444]">—</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                    {visible.length === 0 && (
                      <tr><td colSpan={9} className="text-center text-[#555] text-xs py-10">Nessun ingrediente trovato</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!loading && !data && (
          <div className="flex flex-col items-center gap-3 py-20">
            <ClipboardList size={40} className="text-[#333]" />
            <p className="text-[#555] text-sm">Seleziona un periodo e premi Applica</p>
          </div>
        )}
      </div>
    </div>
  )
}
