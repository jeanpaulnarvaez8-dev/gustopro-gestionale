import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, History, RefreshCw, ChefHat, Wine, Sparkles, Cookie, Clock } from 'lucide-react'
import { kdsAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { Card, Badge } from '../components/v2'

/**
 * KDSHistoryPage — storico item che sono passati dal KDS oggi (default).
 * Filtrabile per stazione, status, range data.
 *
 * Mostra:
 *  - 4 KPI riassuntivi: totale, serviti, cancellati, tempo medio prep
 *  - Tabella scrollabile con: ora invio, tavolo, item, stazione, status,
 *    minuti prep, minuti pass, cameriere
 *
 * Accessibile da: kitchen, waiter, manager, admin.
 */
const STATIONS = [
  { id: 'all',          label: 'Tutte',       icon: History,    color: '' },
  { id: 'cucina',       label: 'Cucina',      icon: ChefHat,    color: 'text-[var(--color-terracotta)]' },
  { id: 'pizzeria',     label: 'Pizzeria',    icon: ChefHat,    color: 'text-[var(--color-warn)]' },
  { id: 'crudi',        label: 'Crudi',       icon: Sparkles,   color: 'text-[var(--color-sea)]' },
  { id: 'pasticceria',  label: 'Pasticceria', icon: Cookie,     color: 'text-[var(--color-park)]' },
  { id: 'bar',          label: 'Bar',         icon: Wine,       color: 'text-[var(--color-gold)]' },
]

const STATUS_TONES = {
  pending:   'warn',
  cooking:   'terracotta',
  oven_done: 'sea',
  ready:     'ok',
  served:    'neutral',
  cancelled: 'err',
}
const STATUS_LABELS = {
  pending:   'In attesa',
  cooking:   'In prep',
  oven_done: 'Sfornata',
  ready:     'Pronto',
  served:    'Servito',
  cancelled: 'Annullato',
}

function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export default function KDSHistoryPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(today)
  const [to, setTo]     = useState(today)
  const [station, setStation] = useState('all')
  const [status, setStatus] = useState('all')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await kdsAPI.history({ from, to, station, status })
      setData(r.data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento storico' })
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-line */ }, [from, to, station, status])

  const a = data?.aggregati

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 sticky top-0 z-20 flex-wrap">
        <button onClick={() => navigate(-1)} className="text-[var(--color-text-2)] hover:text-[var(--color-text)] p-1.5 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <History size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif font-bold text-lg text-[var(--color-text)] flex-1 min-w-0">Storico KDS</h1>
        <div className="flex items-center gap-2 text-xs">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={today}
            className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-md px-2 py-1 text-[var(--color-text)]" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} max={today}
            className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-md px-2 py-1 text-[var(--color-text)]" />
        </div>
        <button onClick={load} disabled={loading}
          className="text-[var(--color-text-2)] hover:text-[var(--color-gold)] p-1.5 rounded-lg disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="p-4 space-y-4 max-w-[1400px] mx-auto">
        {/* Station pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {STATIONS.map(s => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => setStation(s.id)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                  station === s.id
                    ? 'bg-[var(--color-gold)] text-[#13181C]'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-text-2)] border border-[var(--color-border-soft)] hover:text-[var(--color-text)]'
                }`}
              >
                <Icon size={12} className={station === s.id ? '' : s.color} />
                {s.label}
              </button>
            )
          })}
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] uppercase tracking-wider">
          <span className="text-[var(--color-text-3)] font-semibold">Status:</span>
          {['all','ready','served','cancelled'].map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-2 py-1 rounded font-semibold transition ${
                status === s
                  ? 'bg-[var(--color-gold)] text-[#13181C]'
                  : 'text-[var(--color-text-3)] hover:text-[var(--color-text)] border border-[var(--color-border-soft)]'
              }`}
            >
              {s === 'all' ? 'Tutti' : STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>

        {/* KPI aggregati */}
        {a && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card padding="md" className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">Totale items</span>
              <span className="serif text-2xl font-bold text-[var(--color-text)] tnum">{a.total}</span>
            </Card>
            <Card padding="md" className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">Serviti</span>
              <span className="serif text-2xl font-bold text-[var(--color-ok)] tnum">{a.served}</span>
            </Card>
            <Card padding="md" className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">Cancellati</span>
              <span className="serif text-2xl font-bold text-[var(--color-err)] tnum">{a.cancelled}</span>
            </Card>
            <Card padding="md" className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)] flex items-center gap-1"><Clock size={10}/> Prep media</span>
              <span className="serif text-2xl font-bold text-[var(--color-gold)] tnum">{a.avg_prep_min}<span className="text-xs">m</span></span>
            </Card>
          </div>
        )}

        {/* Items table */}
        <Card padding="none" className="overflow-hidden">
          {loading && (
            <div className="flex items-center gap-2 text-[var(--color-text-2)] py-10 justify-center">
              <RefreshCw size={16} className="animate-spin text-[var(--color-gold)]" /> Caricamento storico…
            </div>
          )}
          {!loading && data?.items?.length === 0 && (
            <div className="text-center py-12 text-[var(--color-text-3)]">
              <History size={32} className="opacity-30 mx-auto mb-2" />
              Nessun item nel periodo/filtro selezionato.
            </div>
          )}
          {!loading && data?.items?.length > 0 && (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--color-surface-2)] text-[10px] uppercase tracking-wider text-[var(--color-text-3)] z-10">
                  <tr>
                    <th className="text-left px-3 py-2">Ora</th>
                    <th className="text-left px-3 py-2">Tavolo</th>
                    <th className="text-left px-3 py-2">Item</th>
                    <th className="text-left px-3 py-2">Stazione</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Prep (min)</th>
                    <th className="text-right px-3 py-2">Pass (min)</th>
                    <th className="text-left px-3 py-2">Cameriere</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(it => (
                    <tr key={it.id} className="border-t border-[var(--color-border-soft)] hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="px-3 py-2 text-[var(--color-text-3)] tnum">{fmtTime(it.sent_at)}</td>
                      <td className="px-3 py-2 text-[var(--color-gold)] font-bold tnum">{it.table_number}</td>
                      <td className="px-3 py-2 text-[var(--color-text)]">
                        <span className="text-[var(--color-gold)] tnum">×{it.quantity}</span> {it.item_name}
                        {it.notes && <span className="ml-1 text-[var(--color-warn)] italic">⚠ {it.notes}</span>}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-2)] uppercase text-[10px]">{it.is_beverage ? 'bar' : it.prep_station}</td>
                      <td className="px-3 py-2">
                        <Badge tone={STATUS_TONES[it.status] || 'neutral'} size="sm">
                          {STATUS_LABELS[it.status] || it.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tnum text-[var(--color-text-2)]">{it.prep_minutes ?? '—'}</td>
                      <td className="px-3 py-2 text-right tnum text-[var(--color-text-2)]">{it.pass_minutes ?? '—'}</td>
                      <td className="px-3 py-2 text-[var(--color-text-3)]">{it.waiter_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
