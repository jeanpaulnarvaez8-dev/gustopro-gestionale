import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, TrendingUp, RefreshCw, Award, CalendarDays, Users, AlertCircle } from 'lucide-react'
import { adminAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'
import { Card, Badge } from '../components/v2'

const PERIOD_OPTIONS = [
  { label: '7 giorni',  days: 7,  weeks: 1 },
  { label: '30 giorni', days: 30, weeks: 4 },
  { label: '90 giorni', days: 90, weeks: 13 },
]

function staffingTone(value, max) {
  const ratio = max > 0 ? value / max : 0
  if (ratio >= 0.75) return { label: 'Alto',  tone: 'err'  }
  if (ratio >= 0.40) return { label: 'Medio', tone: 'warn' }
  return                     { label: 'Basso', tone: 'ok'   }
}

// ─── Top Items Bar Chart ─────────────────────────────────────────────────────
function TopItemsChart({ items }) {
  if (!items?.length) return (
    <p className="text-[var(--color-text-3)] text-sm text-center py-10">Nessun dato nel periodo</p>
  )

  const maxQty = Math.max(...items.map(i => i.total_quantity), 1)

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, idx) => {
        // Medaglia oro/argento/bronzo per top 3
        const rankColor =
          idx === 0 ? 'text-[var(--color-gold)]' :
          idx === 1 ? 'text-[var(--color-text)]' :
          idx === 2 ? 'text-[var(--color-terracotta)]' :
                      'text-[var(--color-text-3)]'
        return (
          <div key={item.id} className="flex items-center gap-3">
            <span className={`w-6 text-right text-sm font-bold tnum shrink-0 ${rankColor}`}>
              {idx + 1}
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[var(--color-text)] text-xs font-semibold truncate">{item.name}</span>
                <span className="text-[var(--color-text-3)] text-[10px] ml-2 shrink-0">{item.category}</span>
              </div>
              <div className="h-2 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-gold)] transition-all duration-500"
                  style={{ width: `${(item.total_quantity / maxQty) * 100}%` }}
                />
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-[var(--color-gold)] text-xs font-bold tnum">{item.total_quantity}×</div>
              <div className="text-[var(--color-text-3)] text-[10px] tnum">{formatPrice(item.total_revenue)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Weekday Chart ───────────────────────────────────────────────────────────
function WeekdayChart({ data }) {
  if (!data?.length) return (
    <p className="text-[var(--color-text-3)] text-sm text-center py-10">Nessun dato nel periodo</p>
  )

  const maxOrders = Math.max(...data.map(d => d.avg_orders_per_day), 1)
  const maxRevenue = Math.max(...data.map(d => d.avg_revenue), 1)
  const H = 80

  return (
    <div className="flex flex-col gap-6">
      {/* Bar chart — avg revenue per day */}
      <div>
        <p className="text-[var(--color-text-3)] text-xs mb-3 uppercase tracking-wider font-semibold">
          Incasso medio per giorno
        </p>
        <div className="flex items-end gap-2" style={{ height: H + 32 }}>
          {data.map(d => {
            const h = Math.round((d.avg_revenue / maxRevenue) * H)
            const staff = staffingTone(d.avg_orders_per_day, maxOrders)
            return (
              <div key={d.dow} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[var(--color-text-3)] text-[9px] tnum">{formatPrice(d.avg_revenue, 0)}</span>
                <div className="w-full flex flex-col justify-end" style={{ height: H }}>
                  <div
                    className={`w-full rounded-t transition-all duration-500 ${
                      d.avg_revenue > 0 ? 'bg-[var(--color-gold)]' : 'bg-[var(--color-surface-2)]'
                    }`}
                    style={{ height: h || 2 }}
                  />
                </div>
                <span className="text-[var(--color-text-2)] text-xs font-semibold">{d.label}</span>
                <Badge tone={staff.tone} size="sm">{staff.label}</Badge>
              </div>
            )
          })}
        </div>
      </div>

      {/* Staffing legend */}
      <div className="flex items-center gap-4 text-xs text-[var(--color-text-3)] flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--color-err)] inline-block" /> Alto bisogno personale
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--color-warn)] inline-block" /> Medio
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--color-ok)] inline-block" /> Basso
        </span>
      </div>

      {/* Table with detail */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border-soft)]">
              <th className="text-left py-2.5 text-[var(--color-text-3)] font-semibold uppercase tracking-wider">Giorno</th>
              <th className="text-right py-2.5 text-[var(--color-text-3)] font-semibold uppercase tracking-wider">Ordini / giorno</th>
              <th className="text-right py-2.5 text-[var(--color-text-3)] font-semibold uppercase tracking-wider">Incasso medio</th>
              <th className="text-right py-2.5 text-[var(--color-text-3)] font-semibold uppercase tracking-wider">Totale periodo</th>
              <th className="text-center py-2.5 text-[var(--color-text-3)] font-semibold uppercase tracking-wider">Personale</th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => {
              const staff = staffingTone(d.avg_orders_per_day, maxOrders)
              return (
                <tr key={d.dow} className="border-b border-[var(--color-border-soft)] last:border-0 hover:bg-[rgba(212,175,55,0.04)] transition">
                  <td className="py-3 text-[var(--color-text)] font-bold">{d.label}</td>
                  <td className="py-3 text-right text-[var(--color-text-2)] tnum">{d.avg_orders_per_day}</td>
                  <td className="py-3 text-right text-[var(--color-gold)] font-semibold tnum">{formatPrice(d.avg_revenue)}</td>
                  <td className="py-3 text-right text-[var(--color-text-2)] tnum">{formatPrice(d.total_revenue)}</td>
                  <td className="py-3 text-center">
                    <Badge tone={staff.tone} size="sm">{staff.label}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const navigate = useNavigate()
  const [periodIdx, setPeriodIdx] = useState(1)
  const [topItems, setTopItems]   = useState([])
  const [weekday, setWeekday]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const period = PERIOD_OPTIONS[periodIdx]

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [iRes, wRes] = await Promise.all([
        adminAPI.topItems(period.days, 10),
        adminAPI.weekday(period.weeks),
      ])
      setTopItems(iRes.data)
      setWeekday(wRes.data)
    } catch {
      setError('Errore nel caricamento dei dati analytics')
    } finally {
      setLoading(false)
    }
  }, [period.days, period.weeks])

  useEffect(() => { load() }, [load])

  // Insight summary
  const bestDay  = weekday.length  ? weekday.reduce((a, b) => b.avg_orders_per_day > a.avg_orders_per_day ? b : a, weekday[0]) : null
  const quietDay = weekday.length  ? weekday.reduce((a, b) => (b.avg_orders_per_day < a.avg_orders_per_day && b.avg_orders_per_day > 0) ? b : a, weekday[0]) : null
  const topDish  = topItems.length ? topItems[0] : null

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
        <TrendingUp size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Analytics
        </h1>

        {/* Period tabs */}
        <div className="flex rounded-lg overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] ml-2">
          {PERIOD_OPTIONS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setPeriodIdx(i)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${
                i === periodIdx
                  ? 'bg-[var(--color-gold-soft)] text-[var(--color-gold)]'
                  : 'text-[var(--color-text-2)] hover:text-[var(--color-text)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="ml-auto text-[var(--color-text-2)] hover:text-[var(--color-gold)] transition disabled:opacity-40 p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)]"
          aria-label="Aggiorna"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-6 max-w-[1400px] mx-auto w-full">

        {error && (
          <div className="flex items-center gap-2 text-[var(--color-err)] bg-[var(--color-err-soft)] border border-[var(--color-err)]/30 rounded-xl px-4 py-3 text-sm font-semibold">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Insight summary cards */}
        {!loading && !error && (bestDay || topDish) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topDish && (
              <Card padding="md" className="border-[var(--color-gold)]/30">
                <div className="flex items-center gap-2 mb-2">
                  <Award size={14} className="text-[var(--color-gold)]" />
                  <span className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold">
                    Piatto più venduto
                  </span>
                </div>
                <p className="serif text-[var(--color-text)] font-bold text-lg leading-tight tracking-tight">{topDish.name}</p>
                <p className="text-[var(--color-text-2)] text-xs mt-1 tnum">
                  {topDish.total_quantity} porzioni — {formatPrice(topDish.total_revenue)}
                </p>
              </Card>
            )}
            {bestDay && (
              <Card padding="md" className="border-[var(--color-err)]/30">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={14} className="text-[var(--color-err)]" />
                  <span className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold">
                    Giorno più affollato
                  </span>
                </div>
                <p className="serif text-[var(--color-text)] font-bold text-lg tracking-tight">{bestDay.label}</p>
                <p className="text-[var(--color-text-2)] text-xs mt-1 tnum">
                  ~{bestDay.avg_orders_per_day} ordini/giorno — servono più camerieri
                </p>
              </Card>
            )}
            {quietDay && quietDay.dow !== bestDay?.dow && (
              <Card padding="md" className="border-[var(--color-ok)]/30">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays size={14} className="text-[var(--color-ok)]" />
                  <span className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold">
                    Giorno più tranquillo
                  </span>
                </div>
                <p className="serif text-[var(--color-text)] font-bold text-lg tracking-tight">{quietDay.label}</p>
                <p className="text-[var(--color-text-2)] text-xs mt-1 tnum">
                  ~{quietDay.avg_orders_per_day} ordini/giorno — turni ridotti
                </p>
              </Card>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={20} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento analytics…</span>
          </div>
        ) : (
          <>
            {/* Top dishes */}
            <Card padding="lg">
              <div className="flex items-center gap-2 mb-5">
                <Award size={16} className="text-[var(--color-gold)]" />
                <h3 className="serif text-[var(--color-text)] font-bold text-base tracking-tight">Piatti più venduti</h3>
                <span className="text-[var(--color-text-3)] text-xs ml-1">ultimi {period.days} giorni</span>
              </div>
              <TopItemsChart items={topItems} />
            </Card>

            {/* Busiest days */}
            <Card padding="lg">
              <div className="flex items-center gap-2 mb-5">
                <CalendarDays size={16} className="text-[var(--color-gold)]" />
                <h3 className="serif text-[var(--color-text)] font-bold text-base tracking-tight">Affollamento per giorno</h3>
                <span className="text-[var(--color-text-3)] text-xs ml-1">ultime {period.weeks} settimane</span>
              </div>
              <WeekdayChart data={weekday} />
            </Card>
          </>
        )}

      </div>
    </div>
  )
}
