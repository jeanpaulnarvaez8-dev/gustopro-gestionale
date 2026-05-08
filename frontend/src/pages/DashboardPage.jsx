import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, TrendingUp, TrendingDown, RefreshCw, Users, Receipt,
  TableProperties, BarChart3, Package, AlertTriangle, Trash2, LineChart,
  BookOpen, UtensilsCrossed, LayoutGrid, FileText,
} from 'lucide-react'
import { adminAPI, billingAPI, inventoryAPI } from '../lib/api'
import { formatPrice, formatTime } from '../lib/utils'
import { Card, Badge } from '../components/v2'

// ─── Hourly bar chart (SVG inline, riva style) ───────────────────────────────
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
                fill={d.revenue > 0 ? '#D4AF37' : 'rgba(232,219,180,0.06)'}
                rx="0.5"
              />
            </g>
          )
        })}
      </svg>
      <div className="flex justify-between text-[var(--color-text-3)] text-[10px] tnum px-0.5 mt-1">
        {[10, 12, 14, 16, 18, 20, 22, 24].map(h => (
          <span key={h}>{h}:00</span>
        ))}
      </div>
    </div>
  )
}

// ─── KPI card v2 (usa Card primitive + token color names) ────────────────────
function KpiCard({ icon: Icon, label, value, sub, trend, tone = 'gold' }) {
  const TONES = {
    gold: 'text-[var(--color-gold)]',
    sea:  'text-[var(--color-sea)]',
    pine: 'text-[var(--color-pine)]',
    sand: 'text-[var(--color-sand)]',
    terracotta: 'text-[var(--color-terracotta)]',
    ok:   'text-[var(--color-ok)]',
    err:  'text-[var(--color-err)]',
    warn: 'text-[var(--color-warn)]',
    park: 'text-[var(--color-park)]',
    info: 'text-[var(--color-info)]',
    text: 'text-[var(--color-text-2)]',
  }
  return (
    <Card padding="md" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold">
          {label}
        </span>
        <Icon size={15} className="text-[var(--color-text-3)]" />
      </div>
      <span className={`text-[26px] font-bold tnum leading-none ${TONES[tone] || TONES.gold}`}>
        {value}
      </span>
      {sub != null && (
        <div className="flex items-center gap-1 text-xs">
          {trend === 'up'   && <TrendingUp   size={12} className="text-[var(--color-ok)]" />}
          {trend === 'down' && <TrendingDown size={12} className="text-[var(--color-err)]" />}
          <span className={
            trend === 'up' ? 'text-[var(--color-ok)] font-semibold' :
            trend === 'down' ? 'text-[var(--color-err)] font-semibold' :
            'text-[var(--color-text-3)]'
          }>
            {sub}
          </span>
        </div>
      )}
    </Card>
  )
}

// ─── Header nav button (riutilizza pattern TableMap) ─────────────────────────
function NavButton({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-[var(--color-text-2)] hover:text-[var(--color-gold)] hover:bg-[rgba(255,255,255,0.04)] transition text-xs px-2 py-1.5 rounded-lg shrink-0"
    >
      <Icon size={13} /> {label}
    </button>
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
    <div className="min-h-screen flex flex-col">

      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => navigate('/tables')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-[var(--color-gold)]" />
          <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">Dashboard</h1>
        </div>
        <span className="text-[var(--color-text-3)] text-xs hidden sm:block">
          {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>

        <nav className="ml-auto flex items-center gap-0.5 overflow-x-auto scrollbar-none">
          <NavButton icon={LineChart}        label="Analytics"    onClick={() => navigate('/analytics')} />
          <NavButton icon={BookOpen}         label="Menù Fissi"   onClick={() => navigate('/combos')} />
          <NavButton icon={UtensilsCrossed}  label="Menu"         onClick={() => navigate('/menu-admin')} />
          <NavButton icon={LayoutGrid}       label="Zone"         onClick={() => navigate('/venue')} />
          <NavButton icon={FileText}         label="Fiscale"      onClick={() => navigate('/tax-report')} />
        </nav>

        {lastRefresh && (
          <span className="hidden lg:block text-[var(--color-text-3)] text-[11px] tnum">
            agg. {formatTime(lastRefresh.toISOString())}
          </span>
        )}
        <button
          onClick={loadAll}
          disabled={loading}
          className="text-[var(--color-text-2)] hover:text-[var(--color-gold)] transition disabled:opacity-40 p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)]"
          aria-label="Aggiorna"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6 max-w-[1400px] mx-auto w-full">

        {/* ─── KPI principali ───────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp size={12} /> Servizio
            </h2>
            <Badge tone="gold" size="sm">live</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard
              icon={TrendingUp}
              label="Incasso oggi"
              value={stats ? formatPrice(stats.revenue_today) : '—'}
              sub={revSub}
              trend={revTrend}
              tone="gold"
            />
            <KpiCard
              icon={TrendingUp}
              label="Ieri"
              value={stats ? formatPrice(stats.revenue_yesterday) : '—'}
              tone="text"
            />
            <KpiCard
              icon={Receipt}
              label="Scontrino medio"
              value={stats ? formatPrice(stats.avg_ticket_today) : '—'}
              tone="sea"
            />
            <KpiCard
              icon={Users}
              label="Coperti oggi"
              value={stats?.covers_today ?? '—'}
              tone="park"
            />
            <KpiCard
              icon={TableProperties}
              label="Tavoli aperti"
              value={stats?.tables_open ?? '—'}
              tone={stats?.tables_open > 0 ? 'warn' : 'ok'}
            />
          </div>
        </section>

        {/* ─── Inventory KPIs ───────────────────────────────────── */}
        {invKpis && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Package size={12} /> Inventario
              </h2>
              <button
                onClick={() => navigate('/inventory')}
                className="text-[var(--color-gold)] text-xs hover:underline font-medium"
              >
                Dettagli →
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                icon={AlertTriangle}
                label="Discrepanza media"
                value={`${parseFloat(invKpis.avg_discrepancy_pct).toFixed(1)}%`}
                tone={invKpis.avg_discrepancy_pct > 5 ? 'err' : 'ok'}
              />
              <KpiCard
                icon={TrendingDown}
                label="Perdite settimana"
                value={formatPrice(invKpis.loss_week)}
                tone="warn"
              />
              <KpiCard
                icon={Trash2}
                label="Scarti oggi"
                value={formatPrice(invKpis.spoilage_today)}
                tone="terracotta"
              />
              <KpiCard
                icon={Trash2}
                label="Scarti settimana"
                value={formatPrice(invKpis.spoilage_week)}
                tone="err"
              />
            </div>
          </section>
        )}

        {/* ─── Hourly chart ─────────────────────────────────────── */}
        <Card padding="md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="serif text-[var(--color-text)] text-base font-bold tracking-tight">
              Incasso orario — oggi
            </h3>
            <span className="text-[var(--color-text-3)] text-xs tnum">10:00 → 24:00</span>
          </div>
          {hourly.length > 0
            ? <HourlyChart data={hourly} />
            : <p className="text-[var(--color-text-3)] text-xs text-center py-10">Nessun dato per oggi</p>
          }
        </Card>

        {/* ─── Recent receipts ──────────────────────────────────── */}
        <Card padding="none" className="overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border-soft)] flex items-center justify-between">
            <h3 className="serif text-[var(--color-text)] text-base font-bold tracking-tight">
              Ultimi scontrini
            </h3>
            <Badge tone="neutral" size="sm">{receipts.length} record</Badge>
          </div>

          {receipts.length === 0 ? (
            <p className="text-[var(--color-text-3)] text-xs text-center py-10">
              Nessuno scontrino ancora
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-soft)]">
                    <th className="text-left px-4 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Ora</th>
                    <th className="text-left px-4 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Tavolo</th>
                    <th className="text-left px-4 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Cassiere</th>
                    <th className="text-right px-4 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Importo</th>
                    <th className="text-center px-4 py-2.5 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Split</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r, i) => (
                    <tr
                      key={r.id}
                      className={`border-b border-[var(--color-border-soft)] last:border-0 ${
                        i % 2 === 0 ? '' : 'bg-[var(--color-surface-2)]/50'
                      } hover:bg-[rgba(212,175,55,0.04)] transition`}
                    >
                      <td className="px-4 py-2.5 text-[var(--color-text-2)] text-xs tnum">
                        {formatTime(r.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-text)] font-semibold tnum">
                        {r.table_number}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-text-2)] text-xs">
                        {r.issued_by_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-gold)] font-bold text-right tnum">
                        {formatPrice(r.total_amount)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {r.is_split
                          ? <Badge tone="park" size="sm">{r.split_index}/{r.split_total}</Badge>
                          : <span className="text-[var(--color-text-3)] text-xs">—</span>
                        }
                      </td>
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
