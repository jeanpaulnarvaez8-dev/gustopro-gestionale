import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  DollarSign, Users, AlertTriangle, UtensilsCrossed, ChefHat, MapPin,
  UserCog, BookOpen, TrendingUp, RefreshCw, Clock, Check, Trophy,
  Package, BarChart3, CalendarDays,
} from 'lucide-react'
import { adminAPI, assignmentsAPI, usersAPI, zonesAPI, serviceAPI } from '../lib/api'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

function KpiCard({ icon: Icon, label, value, sub, color = 'text-[#D4AF37]' }) {
  return (
    <div className="bg-[#222] border border-[#333] rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg bg-[#1A1A1A] flex items-center justify-center ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        <p className="text-[#888] text-[10px]">{label}</p>
        {sub && <p className="text-[#555] text-[9px]">{sub}</p>}
      </div>
    </div>
  )
}

function QuickButton({ icon: Icon, label, onClick, badge, color = 'text-[#D4AF37]' }) {
  return (
    <button onClick={onClick}
      className="bg-[#222] border border-[#333] rounded-xl p-4 flex flex-col items-center gap-2 hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/5 transition relative active:scale-95">
      <Icon size={22} className={color} />
      <span className="text-[#F5F5DC] text-xs font-medium">{label}</span>
      {badge > 0 && (
        <span className="absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
          {badge}
        </span>
      )}
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
  // Auto refresh ogni 30s
  useEffect(() => { const i = setInterval(load, 30000); return () => clearInterval(i) }, [load])

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
    <div className="h-[100dvh] bg-[#1A1A1A] flex items-center justify-center">
      <RefreshCw size={20} className="animate-spin text-[#555]" />
    </div>
  )

  const formatPrice = v => `€${parseFloat(v || 0).toFixed(0)}`
  const alertCount = serviceAlerts?.length || 0

  return (
    <div className="h-[100dvh] bg-[#1A1A1A] flex flex-col overflow-hidden">
      {/* Header compatto */}
      <header className="bg-[#222] border-b border-[#333] px-4 py-2.5 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-full bg-[#8B0000] flex items-center justify-center">
          <span className="text-[#D4AF37] font-bold text-sm">G</span>
        </div>
        <span className="text-[#F5F5DC] font-bold">GustoPro</span>
        <span className="text-[#555] text-xs">{user?.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => navigate('/kds')} className="px-3 py-1.5 bg-[#2A2A2A] border border-[#333] rounded-lg text-xs text-[#888] hover:text-[#D4AF37] flex items-center gap-1.5 transition">
            <ChefHat size={13} /> KDS
          </button>
          <button onClick={() => navigate('/assignments')} className="px-3 py-1.5 bg-[#2A2A2A] border border-[#333] rounded-lg text-xs text-[#888] hover:text-[#D4AF37] flex items-center gap-1.5 transition">
            <MapPin size={13} /> Zone
          </button>
          <button onClick={() => navigate('/users')} className="px-3 py-1.5 bg-[#2A2A2A] border border-[#333] rounded-lg text-xs text-[#888] hover:text-[#D4AF37] flex items-center gap-1.5 transition">
            <UserCog size={13} /> Staff
          </button>
          <button onClick={() => navigate('/menu-admin')} className="px-3 py-1.5 bg-[#2A2A2A] border border-[#333] rounded-lg text-xs text-[#888] hover:text-[#D4AF37] flex items-center gap-1.5 transition">
            <BookOpen size={13} /> Menu
          </button>
        </div>
      </header>

      {/* Content scrollabile */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={DollarSign} label="Incasso oggi" value={formatPrice(stats?.revenue_today)} sub={`Ieri: ${formatPrice(stats?.revenue_yesterday)}`} />
          <KpiCard icon={Users} label="Tavoli occupati" value={`${stats?.open_tables || 0}/${stats?.total_tables || 0}`} color="text-emerald-400" />
          <KpiCard icon={AlertTriangle} label="Alert attivi" value={alertCount} color={alertCount > 0 ? 'text-red-400' : 'text-emerald-400'} />
          <KpiCard icon={TrendingUp} label="Scontrino medio" value={formatPrice(stats?.avg_ticket)} color="text-blue-400" />
        </div>

        {/* Azioni rapide */}
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          <QuickButton icon={UtensilsCrossed} label="Tavoli" onClick={() => navigate('/tables')} />
          <QuickButton icon={ChefHat} label="KDS" onClick={() => navigate('/kds')} badge={readyItems.length} />
          <QuickButton icon={MapPin} label="Zone" onClick={() => navigate('/assignments')} />
          <QuickButton icon={Trophy} label="Performance" onClick={() => navigate('/performance')} />
          <QuickButton icon={CalendarDays} label="Prenotazioni" onClick={() => navigate('/reservations')} />
          <QuickButton icon={Package} label="Inventario" onClick={() => navigate('/inventory')} />
          <QuickButton icon={BarChart3} label="Analisi" onClick={() => navigate('/analytics')} />
          <QuickButton icon={UserCog} label="Staff" onClick={() => navigate('/users')} />
        </div>

        {/* Due colonne: Staff in servizio + Alert */}
        <div className="grid md:grid-cols-2 gap-4">

          {/* Staff in servizio + assegnazione rapida */}
          <div className="bg-[#222] border border-[#333] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2A2A2A] flex items-center justify-between">
              <span className="text-[#F5F5DC] font-semibold text-sm flex items-center gap-2">
                <Users size={14} className="text-[#D4AF37]" /> Staff in servizio
              </span>
              <span className="text-[#555] text-xs">{assignments.length} assegnati</span>
            </div>

            {/* Lista assegnazioni attuali */}
            <div className="divide-y divide-[#2A2A2A] max-h-48 overflow-y-auto">
              {assignments.length === 0 ? (
                <p className="text-[#555] text-xs text-center py-6">Nessun cameriere assegnato oggi</p>
              ) : (
                assignments.map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-900/30 border border-blue-500/30 flex items-center justify-center text-blue-400 text-xs font-bold">
                      {a.user_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[#F5F5DC] text-sm font-medium">{a.user_name}</span>
                      {a.sub_role && <span className="ml-1.5 text-cyan-400 text-[9px]">({a.sub_role})</span>}
                    </div>
                    <span className="text-[#888] text-xs">{a.zone_name}</span>
                  </div>
                ))
              )}
            </div>

            {/* Assegnazione rapida */}
            {unassignedWaiters.length > 0 && (
              <div className="border-t border-[#333] px-4 py-3 flex items-center gap-2 bg-[#1E1E1E]">
                <select value={quickAssign.waiter} onChange={e => setQuickAssign(p => ({ ...p, waiter: e.target.value }))}
                  className="flex-1 bg-[#2A2A2A] border border-[#333] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-xs">
                  <option value="">Cameriere...</option>
                  {unassignedWaiters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <select value={quickAssign.zone} onChange={e => setQuickAssign(p => ({ ...p, zone: e.target.value }))}
                  className="flex-1 bg-[#2A2A2A] border border-[#333] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-xs">
                  <option value="">Zona...</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
                <button onClick={handleQuickAssign} disabled={!quickAssign.waiter || !quickAssign.zone}
                  className="px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-bold disabled:opacity-30">
                  Assegna
                </button>
              </div>
            )}
          </div>

          {/* Alert attivi + piatti in attesa */}
          <div className="bg-[#222] border border-[#333] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2A2A2A] flex items-center justify-between">
              <span className="text-[#F5F5DC] font-semibold text-sm flex items-center gap-2">
                <AlertTriangle size={14} className={alertCount > 0 ? 'text-red-400' : 'text-emerald-400'} />
                {alertCount > 0 ? `${alertCount} Alert attivi` : 'Nessun alert'}
              </span>
              <span className="text-[#555] text-xs">{readyItems.length} piatti pronti</span>
            </div>
            <div className="divide-y divide-[#2A2A2A] max-h-64 overflow-y-auto">
              {serviceAlerts?.length > 0 ? (
                serviceAlerts.map(a => (
                  <div key={a.alertId} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center text-red-400 text-xs font-bold">
                      {a.tableNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[#F5F5DC] text-sm">{a.quantity}× {a.itemName}</span>
                      <p className="text-red-400 text-[10px] flex items-center gap-1">
                        <Clock size={9} /> {a.elapsedMinutes}min in attesa
                      </p>
                    </div>
                  </div>
                ))
              ) : readyItems.length > 0 ? (
                readyItems.map(item => (
                  <div key={item.item_id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-900/30 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xs font-bold">
                      {item.table_number}
                    </div>
                    <div className="flex-1">
                      <span className="text-[#F5F5DC] text-sm">{item.quantity}× {item.item_name}</span>
                      <p className="text-emerald-400 text-[10px]">Pronto per il servizio</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center py-8 text-[#555]">
                  <Check size={24} className="mb-2 text-emerald-500/30" />
                  <p className="text-xs">Tutto in ordine</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
