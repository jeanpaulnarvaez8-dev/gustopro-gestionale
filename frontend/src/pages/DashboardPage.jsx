import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, Users, Receipt, TableProperties, BarChart3, Package, AlertTriangle, Trash2, LineChart } from 'lucide-react'
import { adminAPI, billingAPI, inventoryAPI } from '../lib/api'
import { formatPrice, formatTime } from '../lib/utils'

// Simple inline SVG bar chart
function HourlyChart({ data }) {
  if (!data?.length) return null
  const maxVal = Math.max(...data.map(d => d.revenue), 1)
  const H = 80
  const barW = 100 / 24

  // Show only hours 10–24 (service hours)
  const visible = data.filter(d => d.hour >= 10)

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox="0 0 100 90" preserveAspectRatio="none" className="w-full" style={{ height: 90 }}>
        {visible.map(d => {
          const h = (d.revenue / maxVal) * H
          const x = (d.hour / 24) * 100
          return (
            <g key={d.hour}>
              <rect
                x={x + 0.3}
                y={H - h}
                width={barW - 0.6}
                height={h}
                fill={d.revenue > 0 ? '#D4AF37' : '#2A2A2A'}
                rx="0.5"
              />
            </g>
          )
        })}
      </svg>
      <div className="flex justify-between text-[#555] text-xs px-0.5 mt-1">
        {[10, 12, 14, 16, 18, 20, 22, 24].map(h => (
          <span key={h}>{h}:00</span>
        ))}
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, trend, color = 'text-[#D4AF37]' }) {
  return (
    <div className="bg-[#222] rounded-xl border border-[#3A3A3A] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[#555] text-xs uppercase tracking-wide">{label}</span>
        <Icon size={15} className="text-[#3A3A3A]" />
      </div>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      {sub != null && (
        <div className="flex items-center gap-1 text-xs">
          {trend === 'up'   && <TrendingUp   size={12} className="text-emerald-400" />}
          {trend === 'down' && <TrendingDown  size={12} className="text-red-400" />}
          <span className={trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-[#555]'}>
            {sub}
          </span>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [hourly, setHourly] = useState([])
  const [receipts, setReceipts] = useState([])
  const [invKpis, setInvKpis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, hRes, rRes, invRes] = await Promise.all([
        adminAPI.stats(),
        adminAPI.hourly(),
        billingAPI.receipts(),
        inventoryAPI.kpis(),
      ])
      setStats(sRes.data)
      setHourly(hRes.data)
      setReceipts(rRes.data.slice(0, 20))
      setInvKpis(invRes.data)
      setLastRefresh(new Date())
    } catch {
      // keep existing data
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Revenue trend vs yesterday
  const revDiff = stats ? stats.revenue_today - stats.revenue_yesterday : 0
  const revTrend = revDiff > 0 ? 'up' : revDiff < 0 ? 'down' : null
  const revSub = stats
    ? `${revDiff >= 0 ? '+' : ''}${formatPrice(revDiff)} vs ieri`
    : null

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">

      {/* Header */}
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/tables')}
          className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <BarChart3 size={18} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Dashboard</span>
        <span className="text-[#555] text-xs ml-1">
          {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => navigate('/analytics')}
            className="flex items-center gap-1.5 text-[#555] hover:text-[#D4AF37] transition text-xs">
            <LineChart size={13} /> Analytics
          </button>
          {lastRefresh && (
            <span className="text-[#555] text-xs">
              Aggiornato {formatTime(lastRefresh.toISOString())}
            </span>
          )}
          <button onClick={loadAll} disabled={loading}
            className="text-[#555] hover:text-[#888] transition disabled:opacity-40">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            icon={TrendingUp}
            label="Incasso oggi"
            value={stats ? formatPrice(stats.revenue_today) : '—'}
            sub={revSub}
            trend={revTrend}
          />
          <KpiCard
            icon={TrendingUp}
            label="Ieri"
            value={stats ? formatPrice(stats.revenue_yesterday) : '—'}
            color="text-[#888]"
          />
          <KpiCard
            icon={Receipt}
            label="Scontrino medio"
            value={stats ? formatPrice(stats.avg_ticket_today) : '—'}
            color="text-blue-400"
          />
          <KpiCard
            icon={Users}
            label="Coperti oggi"
            value={stats?.covers_today ?? '—'}
            color="text-purple-400"
          />
          <KpiCard
            icon={TableProperties}
            label="Tavoli aperti"
            value={stats?.tables_open ?? '—'}
            color={stats?.tables_open > 0 ? 'text-amber-400' : 'text-emerald-400'}
          />
        </div>

        {/* Inventory KPIs */}
        {invKpis && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[#888] text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Package size={12} /> Inventario
              </h3>
              <button onClick={() => navigate('/inventory')}
                className="text-[#D4AF37] text-xs hover:underline">Dettagli →</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                icon={AlertTriangle}
                label="Discrepanza media"
                value={`${parseFloat(invKpis.avg_discrepancy_pct).toFixed(1)}%`}
                color={invKpis.avg_discrepancy_pct > 5 ? 'text-red-400' : 'text-emerald-400'}
              />
              <KpiCard
                icon={TrendingDown}
                label="Perdite settimana"
                value={formatPrice(invKpis.loss_week)}
                color="text-amber-400"
              />
              <KpiCard
                icon={Trash2}
                label="Scarti oggi"
                value={formatPrice(invKpis.spoilage_today)}
                color="text-orange-400"
              />
              <KpiCard
                icon={Trash2}
                label="Scarti settimana"
                value={formatPrice(invKpis.spoilage_week)}
                color="text-red-400"
              />
            </div>
          </div>
        )}

        {/* Hourly chart */}
        <div className="bg-[#222] rounded-xl border border-[#3A3A3A] p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[#F5F5DC] text-sm font-semibold">Incasso orario — oggi</h3>
            <span className="text-[#555] text-xs">10:00 → 24:00</span>
          </div>
          {hourly.length > 0
            ? <HourlyChart data={hourly} />
            : <p className="text-[#555] text-xs text-center py-8">Nessun dato per oggi</p>
          }
        </div>

        {/* Recent receipts */}
        <div className="bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#3A3A3A] flex items-center justify-between">
            <h3 className="text-[#F5F5DC] text-sm font-semibold">Ultimi scontrini</h3>
            <span className="text-[#555] text-xs">{receipts.length} record</span>
          </div>

          {receipts.length === 0 ? (
            <p className="text-[#555] text-xs text-center py-8">Nessuno scontrino ancora</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2E2E2E]">
                    <th className="text-left px-4 py-2 text-[#555] text-xs font-medium">Ora</th>
                    <th className="text-left px-4 py-2 text-[#555] text-xs font-medium">Tavolo</th>
                    <th className="text-left px-4 py-2 text-[#555] text-xs font-medium">Cassiere</th>
                    <th className="text-right px-4 py-2 text-[#555] text-xs font-medium">Importo</th>
                    <th className="text-center px-4 py-2 text-[#555] text-xs font-medium">Split</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r, i) => (
                    <tr key={r.id}
                      className={`border-b border-[#2A2A2A] last:border-0 ${i % 2 === 0 ? '' : 'bg-[#1E1E1E]'}`}>
                      <td className="px-4 py-2.5 text-[#888] text-xs">{formatTime(r.created_at)}</td>
                      <td className="px-4 py-2.5 text-[#F5F5DC] font-medium">{r.table_number}</td>
                      <td className="px-4 py-2.5 text-[#888] text-xs">{r.issued_by_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-[#D4AF37] font-semibold text-right">
                        {formatPrice(r.total_amount)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {r.is_split
                          ? <span className="text-purple-400 text-xs">{r.split_index}/{r.split_total}</span>
                          : <span className="text-[#3A3A3A] text-xs">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
