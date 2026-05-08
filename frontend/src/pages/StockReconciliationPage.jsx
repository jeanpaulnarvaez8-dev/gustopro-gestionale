import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Download, RefreshCw, Calendar, AlertTriangle, TrendingDown, CheckCircle2 } from 'lucide-react'
import { adminAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { Card, Button } from '../components/v2'

// ─── Helpers ────────────────────────────────────────────────────────────────
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

const dateInputCls = 'bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-3 py-1.5 text-[var(--color-text)] text-xs outline-none transition tnum'

// ─── Page ────────────────────────────────────────────────────────────────────
export default function StockReconciliationPage() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [preset, setPreset]           = useState('today')
  const [from, setFrom]               = useState(() => getPreset('today').from)
  const [to, setTo]                   = useState(() => getPreset('today').to)
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(false)
  const [physicalStock, setPhysical]  = useState({})
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
    <div className="min-h-screen flex flex-col">

      {/* Header */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <ClipboardList size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Riconciliazione stock
        </h1>
        <span className="hidden md:inline text-[var(--color-text-3)] text-xs">
          Confronta sistema vs inventario fisico
        </span>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="secondary"
            disabled={!data || loading}
            leftIcon={<Download size={12} />}
            onClick={() => {
              if (!data) return
              download(buildCSV(data, physicalStock), `riconciliazione_${from}_${to}.csv`)
              toast({ type: 'success', title: 'CSV esportato' })
            }}
          >
            CSV
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-5 max-w-6xl mx-auto w-full">

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
            <Button size="sm" onClick={applyCustom}>Applica</Button>
          </div>
        </Card>

        {loading && (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={20} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento riconciliazione…</span>
          </div>
        )}

        {!loading && data && (
          <>
            {/* KPI */}
            <div className="grid grid-cols-3 gap-3">
              <Card padding="md">
                <p className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold mb-1.5">Perdita stimata</p>
                <p className={`serif text-2xl font-bold tnum ${totLoss > 0 ? 'text-[var(--color-err)]' : 'text-[var(--color-text-3)]'}`}>
                  {totLoss > 0 ? `€ ${fmt2(totLoss)}` : '—'}
                </p>
                <p className="text-[var(--color-text-3)] text-xs mt-1 tnum">{filledItems.length} ingredienti misurati</p>
              </Card>
              <Card padding="md">
                <p className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold mb-1.5">Con discrepanza</p>
                <p className={`serif text-2xl font-bold tnum ${countGap > 0 ? 'text-[var(--color-warn)]' : 'text-[var(--color-ok)]'}`}>
                  {countGap}
                </p>
                <p className="text-[var(--color-text-3)] text-xs mt-1">ingredienti sotto il sistema</p>
              </Card>
              <Card padding="md">
                <p className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold mb-1.5">Totale ingredienti</p>
                <p className="serif text-2xl font-bold text-[var(--color-text)] tnum">{data.items.length}</p>
                <p className="text-[var(--color-text-3)] text-xs mt-1">attivi in magazzino</p>
              </Card>
            </div>

            {/* Istruzioni */}
            <div className="flex items-start gap-3 bg-[var(--color-sea-soft)] border border-[var(--color-sea)]/30 rounded-xl p-4">
              <AlertTriangle size={14} className="text-[var(--color-sea)] shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--color-text-2)] leading-relaxed">
                Inserisci il <strong className="text-[var(--color-sea)]">peso fisico reale</strong> nella colonna &quot;Inventario fisico&quot; dopo aver
                pesato/contato la merce. La <strong className="text-[var(--color-sea)]">differenza</strong> = fisico − sistema: se negativa (rossa)
                c&apos;è una perdita non spiegata dal gestionale (porzioni eccessive, spreco, furto).
              </p>
            </div>

            {/* Search */}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca ingrediente…"
              className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-4 py-2 text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-3)] outline-none transition w-full max-w-xs"
            />

            {/* Tabella */}
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-[var(--color-surface-2)]">
                      <th className="text-left px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Ingrediente</th>
                      <th className="text-right px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Carichi</th>
                      <th className="text-right px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Consumo ordini</th>
                      <th className="text-right px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Scarichi manuali</th>
                      <th className="text-right px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Rettifiche</th>
                      <th className="text-right px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Stock sistema</th>
                      <th className="text-right px-4 py-3 text-[var(--color-gold)] text-[10px] font-semibold uppercase tracking-wider">Inventario fisico</th>
                      <th className="text-right px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Differenza</th>
                      <th className="text-right px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Costo perdita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(item => {
                      const physical  = parseFloat(physicalStock[item.id] ?? '')
                      const hasVal    = !isNaN(physical)
                      const diff      = hasVal ? physical - item.current_stock : null
                      const loss      = (diff !== null && diff < 0) ? Math.abs(diff) * item.cost_per_unit : 0
                      const isLoss    = diff !== null && diff < 0

                      return (
                        <tr key={item.id} className="border-b border-[var(--color-border-soft)] last:border-0 hover:bg-[rgba(212,175,55,0.04)] transition">
                          <td className="px-4 py-2.5">
                            <span className="text-[var(--color-text)] text-sm font-semibold">{item.name}</span>
                            <span className="text-[var(--color-text-3)] text-xs ml-1.5">{item.unit}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--color-ok)] text-xs tnum">
                            {item.qty_in > 0 ? `+${fmt3(item.qty_in)}` : <span className="text-[var(--color-text-3)]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--color-err)] text-xs tnum opacity-80">
                            {item.qty_consumed > 0 ? `-${fmt3(item.qty_consumed)}` : <span className="text-[var(--color-text-3)]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--color-terracotta)] text-xs tnum opacity-80">
                            {item.qty_manual_out > 0 ? `-${fmt3(item.qty_manual_out)}` : <span className="text-[var(--color-text-3)]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--color-sea)] text-xs tnum opacity-80">
                            {item.qty_adjustment !== 0 ? fmt3(item.qty_adjustment) : <span className="text-[var(--color-text-3)]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--color-text)] text-sm font-semibold tnum">
                            {fmt3(item.current_stock)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="number" step="0.001"
                              value={physicalStock[item.id] ?? ''}
                              onChange={e => setPhysical(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="—"
                              className="w-24 bg-[var(--color-surface-2)] border border-[var(--color-gold-ring)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-2 py-1 text-[var(--color-text)] text-sm text-right outline-none transition tnum"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-bold tnum">
                            {diff === null ? <span className="text-[var(--color-text-3)]">—</span>
                              : isLoss
                                ? <span className="text-[var(--color-err)] flex items-center justify-end gap-1"><TrendingDown size={12} />{fmt3(diff)}</span>
                                : <span className="text-[var(--color-ok)] flex items-center justify-end gap-1"><CheckCircle2 size={12} />+{fmt3(diff)}</span>
                            }
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm">
                            {loss > 0
                              ? <span className="text-[var(--color-err)] font-bold tnum">€ {fmt2(loss)}</span>
                              : <span className="text-[var(--color-text-3)]">—</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                    {visible.length === 0 && (
                      <tr><td colSpan={9} className="text-center text-[var(--color-text-3)] text-sm py-10">Nessun ingrediente trovato</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {!loading && !data && (
          <div className="flex flex-col items-center gap-3 py-20 text-[var(--color-text-3)]">
            <ClipboardList size={48} className="text-[var(--color-text-3)]/40" />
            <p className="serif text-[var(--color-text-2)] text-base font-bold">
              Seleziona un periodo e premi Applica
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
