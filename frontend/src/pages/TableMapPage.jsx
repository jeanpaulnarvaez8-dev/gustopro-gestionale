import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut, LayoutDashboard, ChefHat, Wifi, WifiOff, Users, RefreshCw,
  Package, UserCog, CalendarDays, ShoppingBag, Pencil, X, Plus,
  CheckCircle2, FlaskConical, ClipboardList, MapPin, Trophy, UtensilsCrossed,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { tablesAPI, zonesAPI } from '../lib/api'

const STATUS_CONFIG = {
  free:     { label: 'Libero',    color: 'bg-emerald-900/30 border-emerald-500/40 hover:border-emerald-400', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  occupied: { label: 'Occupato',  color: 'bg-red-900/30     border-red-500/40     hover:border-red-400',     dot: 'bg-red-400',     text: 'text-red-400' },
  reserved: { label: 'Riservato', color: 'bg-blue-900/30    border-blue-500/40    hover:border-blue-400',    dot: 'bg-blue-400',    text: 'text-blue-400' },
  dirty:    { label: 'Pulizia',   color: 'bg-yellow-900/30  border-yellow-500/40  hover:border-yellow-400',  dot: 'bg-yellow-400',  text: 'text-yellow-400' },
  parked:   { label: 'In attesa', color: 'bg-purple-900/30  border-purple-500/40  hover:border-purple-400',  dot: 'bg-purple-400',  text: 'text-purple-400' },
}

// ── Add-table mini-form ──────────────────────────────────────────────────────
function AddTableCard({ zoneId, onAdded }) {
  const [number, setNumber] = useState('')
  const [seats, setSeats] = useState('2')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const n = parseInt(number)
    const s = parseInt(seats)
    if (!n || n < 1) return
    setSaving(true)
    try {
      const res = await tablesAPI.create({ zone_id: zoneId, table_number: n, seats: s || 2 })
      onAdded(res.data)
      setNumber('')
      setSeats('2')
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-[#3A3A3A] bg-[#1E1E1E] p-4 flex flex-col items-center gap-2">
      <Plus size={18} className="text-[#555]" />
      <input
        type="number"
        min="1"
        placeholder="N° tavolo"
        value={number}
        onChange={e => setNumber(e.target.value)}
        className="w-full text-center bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-sm text-[#F5F5DC] placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37]"
      />
      <input
        type="number"
        min="1"
        max="20"
        placeholder="Posti"
        value={seats}
        onChange={e => setSeats(e.target.value)}
        className="w-full text-center bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-sm text-[#F5F5DC] placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37]"
      />
      <button
        onClick={handleAdd}
        disabled={!number || saving}
        className="w-full bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] rounded-lg py-1.5 text-xs font-medium transition disabled:opacity-40"
      >
        {saving ? 'Aggiunta…' : 'Aggiungi'}
      </button>
    </div>
  )
}

// ── Individual table card ────────────────────────────────────────────────────
function TableCard({ table, editMode, canEdit, onNavigate, onDelete, onStatusChange }) {
  const [cleaning, setCleaning] = useState(false)
  const [showClean, setShowClean] = useState(false)

  const cfg = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.free

  async function handleLibera(e) {
    e.stopPropagation()
    setCleaning(true)
    try {
      await tablesAPI.setStatus(table.id, 'free')
      onStatusChange(table.id, 'free')
    } catch {
      // ignore
    } finally {
      setCleaning(false)
      setShowClean(false)
    }
  }

  function handleClick() {
    if (editMode) return
    if (table.status === 'dirty') {
      setShowClean(v => !v)
      return
    }
    setShowClean(false)
    onNavigate(table)
  }

  return (
    <motion.div
      key={table.id}
      whileHover={editMode ? undefined : { scale: 1.03 }}
      whileTap={editMode ? undefined : { scale: 0.97 }}
      className={`relative rounded-xl border-2 p-5 flex flex-col items-center gap-3 transition cursor-pointer ${cfg.color}`}
      onClick={handleClick}
    >
      {/* Status dot */}
      <span className={`absolute top-3 right-3 w-2 h-2 rounded-full ${cfg.dot}`} />

      {/* Edit-mode delete button */}
      {editMode && canEdit && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(table) }}
          className="absolute top-2 left-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-full p-0.5 transition"
        >
          <X size={12} />
        </button>
      )}

      <span className="text-[#F5F5DC] text-2xl font-bold">{table.table_number}</span>
      <div className="flex items-center gap-1 text-[#888] text-xs">
        <Users size={11} />
        <span>{table.seats} posti</span>
      </div>
      <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
      {table.status === 'dirty' && !editMode && (
        <span className="text-[10px] text-yellow-500/60 mt-[-6px]">tocca per liberare</span>
      )}

      {/* Dirty overlay */}
      <AnimatePresence>
        {showClean && table.status === 'dirty' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
            className="absolute inset-0 rounded-xl bg-[#1A1A1A]/90 flex flex-col items-center justify-center gap-2 p-3"
          >
            <button
              onClick={handleLibera}
              disabled={cleaning}
              className="flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50"
            >
              <CheckCircle2 size={13} />
              {cleaning ? 'Liberando…' : 'Libera tavolo'}
            </button>
            <button
              onClick={e => { e.stopPropagation(); setShowClean(false) }}
              className="text-[#555] hover:text-[#888] text-xs transition"
            >
              Annulla
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TableMapPage() {
  const { user, logout } = useAuth()
  const { socket, isConnected } = useSocket()
  const navigate = useNavigate()

  const [zones, setZones] = useState([])
  const [tables, setTables] = useState([])
  const [activeZone, setActiveZone] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const canEdit = ['admin', 'manager'].includes(user?.role)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [zonesRes, tablesRes] = await Promise.all([
        zonesAPI.list(),
        tablesAPI.list(),
      ])
      setZones(zonesRes.data)
      setTables(tablesRes.data)
      setActiveZone(prev => prev ?? zonesRes.data[0]?.id ?? null)
    } catch {
      setError('Errore caricamento tavoli')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Realtime updates
  useEffect(() => {
    if (!socket) return
    const handler = ({ tableId, status, active_order_id }) => {
      setTables(prev => prev.map(t => {
        if (t.id !== tableId) return t
        return {
          ...t,
          status,
          active_order_id: active_order_id !== undefined ? active_order_id : t.active_order_id,
        }
      }))
    }
    socket.on('table-status-changed', handler)
    return () => socket.off('table-status-changed', handler)
  }, [socket])

  // Exit edit mode when switching zone
  useEffect(() => { setEditMode(false) }, [activeZone])

  function handleStatusChange(tableId, newStatus) {
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: newStatus } : t))
  }

  function handleTableAdded(newTable) {
    setTables(prev => [...prev, { ...newTable, active_order_id: null }])
  }

  async function handleDeleteTable(table) {
    if (table.status === 'occupied') return
    setDeletingId(table.id)
    try {
      await tablesAPI.remove(table.id)
      setTables(prev => prev.filter(t => t.id !== table.id))
    } catch {
      // ignore
    } finally {
      setDeletingId(null)
    }
  }

  function handleNavigate(table) {
    const isCashier = ['cashier', 'admin', 'manager'].includes(user?.role)
    if (isCashier && table.status === 'occupied' && table.active_order_id) {
      navigate(`/checkout/${table.active_order_id}`)
    } else {
      navigate(`/order/${table.id}`)
    }
  }

  const filteredTables = tables.filter(t => t.zone_id === activeZone)
  const activeZoneName = zones.find(z => z.id === activeZone)?.name ?? ''
  const stats = {
    free:     filteredTables.filter(t => t.status === 'free').length,
    occupied: filteredTables.filter(t => t.status === 'occupied').length,
    total:    filteredTables.length,
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">

      {/* Header */}
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-full bg-[#8B0000] flex items-center justify-center">
            <span className="text-[#D4AF37] font-bold text-xs">G</span>
          </div>
          <span className="text-[#F5F5DC] font-semibold hidden sm:block">GustoPro <span className="text-[#D4AF37] text-xs font-normal">v1.0</span></span>
          <div className={`flex items-center gap-1 text-xs ${isConnected ? 'text-emerald-400' : 'text-[#888]'}`}>
            {isConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
            <span className="hidden sm:block">{isConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 scrollbar-none">
          {['kitchen', 'admin', 'manager'].includes(user?.role) && (
            <button onClick={() => navigate('/kds')}
              className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
              <ChefHat size={14} /> <span className="hidden md:block">KDS</span>
            </button>
          )}
          {['admin', 'manager'].includes(user?.role) && (
            <button onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
              <LayoutDashboard size={14} /> <span className="hidden md:block">Dashboard</span>
            </button>
          )}
          {['admin', 'manager'].includes(user?.role) && (
            <button onClick={() => navigate('/inventory')}
              className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
              <Package size={14} /> <span className="hidden md:block">Inventario</span>
            </button>
          )}
          {['admin', 'manager'].includes(user?.role) && (
            <button onClick={() => navigate('/ingredients')}
              className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
              <FlaskConical size={14} /> <span className="hidden md:block">Ingredienti</span>
            </button>
          )}
          {['admin', 'manager'].includes(user?.role) && (
            <button onClick={() => navigate('/stock-reconciliation')}
              className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
              <ClipboardList size={14} /> <span className="hidden md:block">Riconciliazione</span>
            </button>
          )}
          <button onClick={() => navigate('/asporto')}
            className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
            <ShoppingBag size={14} /> <span className="hidden md:block">Asporto</span>
          </button>
          <button onClick={() => navigate('/reservations')}
            className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
            <CalendarDays size={14} /> <span className="hidden md:block">Prenotazioni</span>
          </button>
          {['admin', 'manager'].includes(user?.role) && (
            <button onClick={() => navigate('/customers')}
              className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
              <Users size={14} /> <span className="hidden md:block">Clienti</span>
            </button>
          )}
          <button onClick={() => navigate('/my-tables')}
            className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
            <UtensilsCrossed size={14} /> <span className="hidden md:block">I Miei Piatti</span>
          </button>
          {['admin', 'manager'].includes(user?.role) && (
            <button onClick={() => navigate('/assignments')}
              className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
              <MapPin size={14} /> <span className="hidden md:block">Zone</span>
            </button>
          )}
          {['admin', 'manager'].includes(user?.role) && (
            <button onClick={() => navigate('/performance')}
              className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
              <Trophy size={14} /> <span className="hidden md:block">Performance</span>
            </button>
          )}
          {user?.role === 'admin' && (
            <button onClick={() => navigate('/users')}
              className="flex items-center gap-1.5 text-[#888] hover:text-[#D4AF37] transition text-xs px-2 py-1 rounded-lg hover:bg-[#3A3A3A] shrink-0">
              <UserCog size={14} /> <span className="hidden md:block">Staff</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[#888] text-xs hidden sm:block">
            {user?.name} · <span className="text-[#D4AF37]">{user?.role}</span>
          </span>
          <button onClick={logout} className="text-[#888] hover:text-red-400 transition p-1">
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Zone Tabs */}
      <div className="bg-[#222] border-b border-[#3A3A3A] flex items-center">
        {/* Scrollable zone tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0 px-4">
          {zones.map(zone => (
            <button
              key={zone.id}
              onClick={() => setActiveZone(zone.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition shrink-0 ${
                activeZone === zone.id
                  ? 'border-[#D4AF37] text-[#D4AF37]'
                  : 'border-transparent text-[#888] hover:text-[#F5F5DC]'
              }`}
            >
              {zone.name}
            </button>
          ))}
        </div>

        {/* Always-visible action buttons */}
        <div className="flex items-center gap-2 shrink-0 px-3 border-l border-[#3A3A3A]">
          {canEdit && (
            <button
              onClick={() => setEditMode(v => !v)}
              title={editMode ? 'Esci da modalità modifica' : 'Modifica tavoli'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                editMode
                  ? 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40'
                  : 'text-[#ccc] border-[#4A4A4A] hover:text-[#D4AF37] hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10'
              }`}
            >
              <Pencil size={13} />
              <span className="hidden sm:inline">{editMode ? 'Fine' : 'Modifica'}</span>
            </button>
          )}
          <button onClick={loadData} className="text-[#777] hover:text-[#aaa] p-1.5 rounded-lg hover:bg-[#2A2A2A] transition">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Edit mode banner */}
      <AnimatePresence>
        {editMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-[#D4AF37]/10 border-b border-[#D4AF37]/20 px-6 py-2 flex items-center gap-2 text-xs text-[#D4AF37]">
              <Pencil size={12} />
              <span>Modalità modifica — clicca X per eliminare un tavolo, usa il modulo + per aggiungerne uno nuovo</span>
              <button onClick={() => setEditMode(false)} className="ml-auto hover:text-white transition">
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats bar */}
      {!loading && !error && (
        <div className="px-6 py-2 flex items-center gap-5 text-xs border-b border-[#3A3A3A] bg-[#1E1E1E]">
          <span className="text-[#555]">{activeZoneName}</span>
          <span className="text-emerald-400">{stats.free} liberi</span>
          <span className="text-red-400">{stats.occupied} occupati</span>
          <span className="text-[#555]">{stats.total} tavoli</span>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 p-6">

        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-2 text-[#888] text-sm">
              <RefreshCw size={16} className="animate-spin" />
              Caricamento tavoli...
            </div>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={loadData} className="text-[#D4AF37] text-sm hover:underline">Riprova</button>
          </div>
        )}

        {!loading && !error && (
          <motion.div
            key={activeZone}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
          >
            {filteredTables.map(table => (
              <TableCard
                key={table.id}
                table={table}
                editMode={editMode}
                canEdit={canEdit}
                onNavigate={handleNavigate}
                onDelete={deletingId === table.id ? () => {} : handleDeleteTable}
                onStatusChange={handleStatusChange}
              />
            ))}

            {/* Add table card — only in edit mode */}
            {editMode && canEdit && (
              <AddTableCard zoneId={activeZone} onAdded={handleTableAdded} />
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
