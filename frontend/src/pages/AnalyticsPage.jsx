import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, TrendingUp, RefreshCw, Award, CalendarDays, Users, AlertCircle } from 'lucide-react'
import { adminAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'

// ─── Helpers ───────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: '7 giorni',  days: 7,  weeks: 1 },
  { label: '30 giorni', days: 30, weeks: 4 },
  { label: '90 giorni', days: 90, weeks: 13 },
]

function staffingLabel(value, max) {
  const ratio = max > 0 ? value / max : 0
  if (ratio >= 0.75) return { label: 'Alto',   color: 'text-red-400',     bg: 'bg-red-900/30' }
  if (ratio >= 0.40) return { label: 'Medio',  color: 'text-amber-400',   bg: 'bg-amber-900/30' }
  return              { label: 'Basso',  color: 'text-emerald-400', bg: 'bg-emerald-900/30' }
}

// ─── Top Items Bar Chart ────────────────────────────────────────────────────

function TopItemsChart({ items }) {
  if (!items?.length) return (
    <p className="text-[#555] text-xs text-center py-10">Nessun dato nel periodo</p>
  )

  const maxQty = Math.max(...items.map(i => i.total_quantity), 1)

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-3">
          {/* Rank */}
          <span className={`w-5 text-right text-xs font-bold shrink-0 ${
            idx === 0 ? 'text-[#D4AF37]' : idx === 1 ? 'text-[#A8A9AD]' : idx === 2 ? 'text-[#CD7F32]' : 'text-[#555]'
          }`}>{idx + 1}</span>

          {/* Name + bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[#F5F5DC] text-xs font-medium truncate">{item.name}</span>
              <span className="text-[#555] text-[10px] ml-2 shrink-0">{item.category}</span>
            </div>
            <div className="h-2 bg-[#2A2A2A] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#D4AF37] transition-all duration-500"
                style={{ width: `${(item.total_quantity / maxQty) * 100}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="text-right shrink-0">
            <div className="text-[#D4AF37] text-xs font-bold">{item.total_quantity}×</div>
            <div className="text-[#555] text-[10px]">{formatPrice(item.total_revenue)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Weekday Chart ──────────────────────────────────────────────────────────

function WeekdayChart({ data }) {
  if (!data?.length) return (
    <p className="text-[#555] text-xs text-center py-10">Nessun dato nel periodo</p>
  )

  const maxOrders = Math.max(...data.map(d => d.avg_orders_per_day), 1)
  const maxRevenue = Math.max(...data.map(d => d.avg_revenue), 1)
  const H = 80

  return (
    <div className="flex flex-col gap-6">
      {/* Bar chart — avg revenue per day */}
      <div>
        <p className="text-[#555] text-xs mb-3 uppercase tracking-wider">Incasso medio per giorno</p>
        <div className="flex items-end gap-2" style={{ height: H + 28 }}>
          {data.map(d => {
            const h = Math.round((d.avg_revenue / maxRevenue) * H)
            const staff = staffingLabel(d.avg_orders_per_day, maxOrders)
            return (
              <div key={d.dow} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[#555] text-[9px]">{formatPrice(d.avg_revenue, 0)}</span>
                <div className="w-full flex flex-col justify-end" style={{ height: H }}>
                  <div
                    className={`w-full rounded-t transition-all duration-500 ${
                      d.avg_revenue > 0 ? 'bg-[#D4AF37]' : 'bg-[#2A2A2A]'
                    }`}
                    style={{ height: h || 2 }}
                  />
                </div>
                <span className="text-[#888] text-xs font-medium">{d.label}</span>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${staff.color} ${staff.bg}`}>
                  {staff.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Staffing legend */}
      <div className="flex items-center gap-4 text-xs text-[#555]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Alto bisogno personale</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Medio</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Basso</span>
      </div>

      {/* Table with detail */}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#2E2E2E]">
            <th className="text-left py-2 text-[#555] font-medium">Giorno</th>
            <th className="text-right py-2 text-[#555] font-medium">Ordini / giorno</th>
            <th className="text-right py-2 text-[#555] font-medium">Incasso medio</th>
            <th className="text-right py-2 text-[#555] font-medium">Totale periodo</th>
            <th className="text-center py-2 text-[#555] font-medium">Personale</th>
          </tr>
        </thead>
        <tbody>
          {data.map(d => {
            const staff = staffingLabel(d.avg_orders_per_day, maxOrders)
            return (
              <tr key={d.dow} className="border-b border-[#2A2A2A] last:border-0">
                <td className="py-2.5 text-[#F5F5DC] font-semibold">{d.label}</td>
                <td className="py-2.5 text-right text-[#888]">{d.avg_orders_per_day}</td>
                <td className="py-2.5 text-right text-[#D4AF37]">{formatPrice(d.avg_revenue)}</td>
                <td className="py-2.5 text-right text-[#888]">{formatPrice(d.total_revenue)}</td>
                <td className="py-2.5 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${staff.color} ${staff.bg}`}>
                    {staff.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const [periodIdx, setPeriodIdx] = useState(1) // default 30 days
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

  // Summary: best day + best dish
  const bestDay  = weekday.length  ? weekday.reduce((a, b) => b.avg_orders_per_day > a.avg_orders_per_day ? b : a, weekday[0]) : null
  const quietDay = weekday.length  ? weekday.reduce((a, b) => (b.avg_orders_per_day < a.avg_orders_per_day && b.avg_orders_per_day > 0) ? b : a, weekday[0]) : null
  const topDish  = topItems.length ? topItems[0] : null

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">

      {/* Header */}
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')}
          className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <TrendingUp size={18} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Analytics</span>

        {/* Period tabs */}
        <div className="flex rounded-lg overflow-hidden border border-[#3A3A3A] ml-4">
          {PERIOD_OPTIONS.map((p, i) => (
            <button key={p.label} onClick={() => setPeriodIdx(i)}
              className={`px-3 py-1.5 text-xs transition ${
                i === periodIdx ? 'bg-[#3A3A3A] text-[#F5F5DC]' : 'text-[#555] hover:text-[#888]'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        <button onClick={load} disabled={loading}
          className="ml-auto text-[#555] hover:text-[#888] transition disabled:opacity-40">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">

        {error && (
          <div className="flex items-center gap-2 text-red-400 bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Insight summary cards */}
        {!loading && !error && (bestDay || topDish) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topDish && (
              <div className="bg-[#222] border border-[#D4AF37]/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Award size={14} className="text-[#D4AF37]" />
                  <span className="text-[#555] text-xs uppercase tracking-wide">Piatto più venduto</span>
                </div>
                <p className="text-[#F5F5DC] font-bold text-base leading-tight">{topDish.name}</p>
                <p className="text-[#888] text-xs mt-1">{topDish.total_quantity} porzioni — {formatPrice(topDish.total_revenue)}</p>
              </div>
            )}
            {bestDay && (
              <div className="bg-[#222] border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={14} className="text-red-400" />
                  <span className="text-[#555] text-xs uppercase tracking-wide">Giorno più affollato</span>
                </div>
                <p className="text-[#F5F5DC] font-bold text-base">{bestDay.label}</p>
                <p className="text-[#888] text-xs mt-1">~{bestDay.avg_orders_per_day} ordini/giorno — servono più camerieri</p>
              </div>
            )}
            {quietDay && quietDay.dow !== bestDay?.dow && (
              <div className="bg-[#222] border border-emerald-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays size={14} className="text-emerald-400" />
                  <span className="text-[#555] text-xs uppercase tracking-wide">Giorno più tranquillo</span>
                </div>
                <p className="text-[#F5F5DC] font-bold text-base">{quietDay.label}</p>
                <p className="text-[#888] text-xs mt-1">~{quietDay.avg_orders_per_day} ordini/giorno — turni ridotti</p>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <RefreshCw size={20} className="animate-spin text-[#555]" />
          </div>
        ) : (
          <>
            {/* Top dishes */}
            <div className="bg-[#222] rounded-xl border border-[#3A3A3A] p-5">
              <div className="flex items-center gap-2 mb-5">
                <Award size={15} className="text-[#D4AF37]" />
                <h3 className="text-[#F5F5DC] font-semibold text-sm">Piatti più venduti</h3>
                <span className="text-[#555] text-xs ml-1">ultimi {period.days} giorni</span>
              </div>
              <TopItemsChart items={topItems} />
            </div>

            {/* Busiest days */}
            <div className="bg-[#222] rounded-xl border border-[#3A3A3A] p-5">
              <div className="flex items-center gap-2 mb-5">
                <CalendarDays size={15} className="text-[#D4AF37]" />
                <h3 className="text-[#F5F5DC] font-semibold text-sm">Affollamento per giorno</h3>
                <span className="text-[#555] text-xs ml-1">ultime {period.weeks} settimane</span>
              </div>
              <WeekdayChart data={weekday} />
            </div>
          </>
        )}

      </div>
    </div>
  )
}
