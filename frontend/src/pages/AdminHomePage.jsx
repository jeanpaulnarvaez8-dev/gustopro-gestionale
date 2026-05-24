import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign, Users, AlertTriangle, UtensilsCrossed, ChefHat, MapPin,
  UserCog, BookOpen, TrendingUp, RefreshCw, Clock, Check, Trophy,
  Package, BarChart3, CalendarDays, Building, Wine, QrCode, ShieldAlert, Lock,
} from 'lucide-react'
import { adminAPI, assignmentsAPI, usersAPI, zonesAPI, serviceAPI } from '../lib/api'
import { useSocket } from '../context/SocketContext'
import { getSocket } from '../lib/socket'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Card, Badge, Button } from '../components/v2'
import DayStatusBadge from '../components/DayStatusBadge'

const TONE_TEXT = {
  gold: 'text-[var(--color-gold)]',
  ok:   'text-[var(--color-ok)]',
  err:  'text-[var(--color-err)]',
  sea:  'text-[var(--color-sea)]',
  warn: 'text-[var(--color-warn)]',
  park: 'text-[var(--color-park)]',
}

function KpiCard({ icon: Icon, label, value, sub, tone = 'gold' }) {
  return (
    <Card padding="md" className="flex items-center gap-3">
      <div className={`w-11 h-11 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-border-strong)] flex items-center justify-center ${TONE_TEXT[tone]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className={`serif text-xl font-bold tnum leading-none ${TONE_TEXT[tone]}`}>{value}</p>
        <p className="text-[var(--color-text-2)] text-[10px] uppercase tracking-wider font-semibold mt-1">{label}</p>
        {sub && <p className="text-[var(--color-text-3)] text-[10px] mt-0.5 tnum">{sub}</p>}
      </div>
    </Card>
  )
}

function QuickButton({ icon: Icon, label, onClick, badge, tone = 'gold' }) {
  return (
    <button
      onClick={onClick}
      className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-xl p-4 flex flex-col items-center gap-2 hover:border-[var(--color-gold-ring)] hover:bg-[var(--color-gold-soft)] transition relative active:scale-95 min-h-[88px]"
    >
      <Icon size={22} className={TONE_TEXT[tone]} />
      <span className="text-[var(--color-text)] text-xs font-semibold">{label}</span>
      {badge > 0 && (
        <span className="absolute top-2 right-2 min-w-[20px] h-5 bg-[var(--color-err)] rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1.5 tnum animate-[pulse-err_1.6s_ease-in-out_infinite]">
          {badge}
        </span>
      )}
    </button>
  )
}

function NavButton({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg text-xs text-[var(--color-text-2)] hover:text-[var(--color-gold)] hover:border-[var(--color-gold-ring)] flex items-center gap-1.5 transition shrink-0"
    >
      <Icon size={13} /> {label}
    </button>
  )
}

export default function AdminHomePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const { serviceAlerts } = useSocket()
  const [stats, setStats] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [waiters, setWaiters] = useState([])
  const [zones, setZones] = useState([])
  const [readyItems, setReadyItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [statsRes, assignRes, usersRes, zonesRes, readyRes] = await Promise.all([
        adminAPI.stats(),
        assignmentsAPI.list().catch(() => ({ data: [] })),
        usersAPI.list(),
        zonesAPI.list(),
        serviceAPI.readyItems().catch(() => ({ data: [] })),
      ])
      setStats(statsRes.data)
      setAssignments(assignRes.data)
      setWaiters(usersRes.data.filter(u => u.role === 'waiter' && u.is_active))
      setZones(zonesRes.data)
      setReadyItems(readyRes.data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])
  // Auto refresh ogni 30s (fallback se socket disconnesso o eventi persi)
  useEffect(() => { const i = setInterval(load, 30000); return () => clearInterval(i) }, [load])

  // Real-time: ricarica stats quando arrivano eventi rilevanti dal socket.
  // Senza questo, la dashboard si aggiorna solo via polling (max 30s di lag).
  // Eventi che impattano KPI: tavoli, ordini, pagamenti, piatti pronti, alert.
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const refresh = () => load()
    const events = [
      'table-status-changed',  // cambio stato tavolo (occupied/free/dirty)
      'new-order',             // nuovo ordine → tavolo occupato + scontrino
      'order-settled',         // pagamento concluso → incasso + scontrino medio
      'item-ready-notify',     // piatto pronto → readyItems
      'item-served',           // piatto servito → readyItems
      'service-alert',         // alert servizio in ritardo
      'service-escalation',    // escalation manager
    ]
    events.forEach(ev => socket.on(ev, refresh))
    return () => events.forEach(ev => socket.off(ev, refresh))
  }, [load])

  const assignedWaiterIds = new Set(assignments.map(a => a.user_id))
  const unassignedWaiters = waiters.filter(w => !assignedWaiterIds.has(w.id))

  // Assegnazione rapida
  const [quickAssign, setQuickAssign] = useState({ waiter: '', zone: '' })
  const handleQuickAssign = async () => {
    if (!quickAssign.waiter || !quickAssign.zone) return
    try {
      await assignmentsAPI.create({ user_id: quickAssign.waiter, zone_id: quickAssign.zone })
      toast({ type: 'success', title: 'Cameriere assegnato' })
      setQuickAssign({ waiter: '', zone: '' })
      load()
    } catch { toast({ type: 'error', title: 'Errore assegnazione' }) }
  }

  if (loading) return (
    <div className="h-[100dvh] flex items-center justify-center gap-2 text-[var(--color-text-2)]">
      <RefreshCw size={20} className="animate-spin text-[var(--color-gold)]" />
      <span className="text-sm">Caricamento dashboard…</span>
    </div>
  )

  const formatPrice = v => `€${parseFloat(v || 0).toFixed(0)}`
  const alertCount = serviceAlerts?.length || 0

  const selectCls = 'flex-1 bg-[var(--color-surface)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-2 py-1.5 text-[var(--color-text)] text-xs outline-none transition'

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-3 sm:px-4 py-2.5 flex items-center gap-3 shrink-0 sticky top-0 z-20">
        <div
          className="w-9 h-9 rounded-[8px] flex items-center justify-center font-extrabold text-[#13181C] text-[12px] shrink-0"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #9c7e1f)' }}
        >
          GP
        </div>
        <div className="flex flex-col leading-tight">
          <span className="serif text-[15px] font-bold text-[var(--color-text)] tracking-tight">GustoPro</span>
          <span className="text-[10px] text-[var(--color-gold)] flex items-center gap-1 font-medium">
            <Building size={10} />Riva Beach
          </span>
        </div>
        <span className="hidden sm:block text-[var(--color-text-3)] text-xs ml-2 truncate">
          {user?.name} · <span className="text-[var(--color-gold)] uppercase tracking-wider">{user?.role}</span>
        </span>

        {/* Badge stato giornata (apri/chiudi) */}
        <DayStatusBadge userRole={user?.role} />

        <nav className="ml-auto flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <NavButton icon={ChefHat} label="KDS" onClick={() => navigate('/kds')} />
          <NavButton icon={MapPin} label="Zone" onClick={() => navigate('/assignments')} />
          <NavButton icon={UserCog} label="Staff" onClick={() => navigate('/users')} />
          <NavButton icon={BookOpen} label="Menu" onClick={() => navigate('/menu-admin')} />
        </nav>
      </header>

      {/* ─── Content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 min-h-0 max-w-[1400px] mx-auto w-full">

        {/* ─── KPI Cards ───────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            icon={DollarSign}
            label="Incasso oggi"
            value={formatPrice(stats?.revenue_today)}
            sub={`Ieri: ${formatPrice(stats?.revenue_yesterday)}`}
            tone="gold"
          />
          <KpiCard
            icon={Users}
            label="Tavoli occupati"
            value={`${stats?.open_tables || 0}/${stats?.total_tables || 0}`}
            tone="ok"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Alert attivi"
            value={alertCount}
            tone={alertCount > 0 ? 'err' : 'ok'}
          />
          <KpiCard
            icon={TrendingUp}
            label="Scontrino medio"
            value={formatPrice(stats?.avg_ticket)}
            tone="sea"
          />
        </div>

        {/* ─── Quick actions ───────────────────────────────── */}
        <div>
          <h2 className="text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider mb-2">Azioni rapide</h2>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            <QuickButton icon={UtensilsCrossed} label="Tavoli"       onClick={() => navigate('/tables')} />
            <QuickButton icon={BookOpen}        label="Menu / Piatti" onClick={() => navigate('/menu-admin')} tone="gold" />
            <QuickButton icon={ChefHat}         label="KDS"          onClick={() => navigate('/kds')}          badge={readyItems.length} />
            <QuickButton icon={Wine}            label="Bar"          onClick={() => navigate('/bar')} tone="gold" />
            <QuickButton icon={MapPin}          label="Zone"         onClick={() => navigate('/assignments')} tone="sea" />
            <QuickButton icon={Trophy}          label="Performance"  onClick={() => navigate('/performance')}  tone="park" />
            <QuickButton icon={CalendarDays}    label="Prenotazioni" onClick={() => navigate('/reservations')} tone="sea" />
            <QuickButton icon={Package}         label="Inventario"   onClick={() => navigate('/inventory')} />
            <QuickButton icon={BarChart3}       label="Analisi"      onClick={() => navigate('/analytics')}    tone="park" />
            <QuickButton icon={UserCog}         label="Staff"        onClick={() => navigate('/users')} />
            <QuickButton icon={QrCode}          label="QR Tavoli"    onClick={() => navigate('/qr-codes')} tone="sea" />
            <QuickButton icon={QrCode}          label="QR Menu"      onClick={() => navigate('/menu-qr')} tone="gold" />
            <QuickButton icon={ShieldAlert}     label="Audit"        onClick={() => navigate('/audit-report')} tone="warn" />
            <QuickButton icon={Lock}            label="Chiusura cassa" onClick={() => navigate('/day-close')} tone="err" />
          </div>
        </div>

        {/* ─── Due colonne: Staff + Alert ───────────────────── */}
        <div className="grid md:grid-cols-2 gap-4">

          {/* Staff in servizio + assegnazione rapida */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border-soft)] flex items-center justify-between">
              <span className="serif text-[var(--color-text)] font-bold text-base flex items-center gap-2 tracking-tight">
                <Users size={15} className="text-[var(--color-gold)]" /> Staff in servizio
              </span>
              <Badge tone="neutral" size="sm">{assignments.length} assegnati</Badge>
            </div>

            <div className="divide-y divide-[var(--color-border-soft)] max-h-48 overflow-y-auto">
              {assignments.length === 0 ? (
                <p className="text-[var(--color-text-3)] text-xs text-center py-6">
                  Nessun cameriere assegnato oggi
                </p>
              ) : (
                assignments.map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-sea-soft)] border border-[var(--color-sea)]/30 flex items-center justify-center text-[var(--color-sea)] text-xs font-bold tnum">
                      {a.user_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[var(--color-text)] text-sm font-semibold">{a.user_name}</span>
                      {a.sub_role && (
                        <span className="ml-1.5 text-[var(--color-info)] text-[10px] font-medium">({a.sub_role})</span>
                      )}
                    </div>
                    <span className="text-[var(--color-text-2)] text-xs font-medium">{a.zone_name}</span>
                  </div>
                ))
              )}
            </div>

            {/* Assegnazione rapida */}
            {unassignedWaiters.length > 0 && (
              <div className="border-t border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-2 bg-[var(--color-surface-2)]">
                <select
                  value={quickAssign.waiter}
                  onChange={e => setQuickAssign(p => ({ ...p, waiter: e.target.value }))}
                  className={selectCls}
                >
                  <option value="">Cameriere…</option>
                  {unassignedWaiters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <select
                  value={quickAssign.zone}
                  onChange={e => setQuickAssign(p => ({ ...p, zone: e.target.value }))}
                  className={selectCls}
                >
                  <option value="">Zona…</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
                <Button
                  size="sm"
                  disabled={!quickAssign.waiter || !quickAssign.zone}
                  onClick={handleQuickAssign}
                >
                  Assegna
                </Button>
              </div>
            )}
          </Card>

          {/* Alert attivi + piatti pronti */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border-soft)] flex items-center justify-between">
              <span className="serif text-[var(--color-text)] font-bold text-base flex items-center gap-2 tracking-tight">
                <AlertTriangle size={15} className={alertCount > 0 ? 'text-[var(--color-err)]' : 'text-[var(--color-ok)]'} />
                {alertCount > 0 ? `${alertCount} alert attivi` : 'Nessun alert'}
              </span>
              <Badge tone="ok" size="sm">{readyItems.length} pronti</Badge>
            </div>
            <div className="divide-y divide-[var(--color-border-soft)] max-h-64 overflow-y-auto">
              {serviceAlerts?.length > 0 ? (
                serviceAlerts.map(a => (
                  <div key={a.alertId} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-err-soft)] border border-[var(--color-err)]/30 flex items-center justify-center text-[var(--color-err)] text-xs font-bold tnum">
                      {a.tableNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[var(--color-text)] text-sm">
                        <span className="text-[var(--color-gold)] tnum">{a.quantity}×</span> {a.itemName}
                      </span>
                      <p className="text-[var(--color-err)] text-[10px] flex items-center gap-1 font-semibold tnum">
                        <Clock size={10} /> {a.elapsedMinutes}min in attesa
                      </p>
                    </div>
                  </div>
                ))
              ) : readyItems.length > 0 ? (
                readyItems.map(item => (
                  <div key={item.item_id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-ok-soft)] border border-[var(--color-ok)]/30 flex items-center justify-center text-[var(--color-ok)] text-xs font-bold tnum">
                      {item.table_number}
                    </div>
                    <div className="flex-1">
                      <span className="text-[var(--color-text)] text-sm">
                        <span className="text-[var(--color-gold)] tnum">{item.quantity}×</span> {item.item_name}
                      </span>
                      <p className="text-[var(--color-ok)] text-[10px] font-semibold">Pronto per il servizio</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center py-8 text-[var(--color-text-3)]">
                  <Check size={32} className="mb-2 text-[var(--color-ok)]/40" />
                  <p className="text-xs">Tutto in ordine</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
