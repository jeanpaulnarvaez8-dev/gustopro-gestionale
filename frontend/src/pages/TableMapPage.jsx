import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut, LayoutDashboard, ChefHat, Wifi, WifiOff, Users, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { tablesAPI, zonesAPI } from '../lib/api'

const STATUS_CONFIG = {
  free:     { label: 'Libero',    color: 'bg-emerald-900/30 border-emerald-500/40 hover:border-emerald-400', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  occupied: { label: 'Occupato',  color: 'bg-red-900/30     border-red-500/40     hover:border-red-400',     dot: 'bg-red-400',     text: 'text-red-400' },
  reserved: { label: 'Riservato', color: 'bg-blue-900/30    border-blue-500/40    hover:border-blue-400',    dot: 'bg-blue-400',    text: 'text-blue-400' },
  cleaning: { label: 'Pulizia',   color: 'bg-yellow-900/30  border-yellow-500/40  hover:border-yellow-400',  dot: 'bg-yellow-400',  text: 'text-yellow-400' },
}

export default function TableMapPage() {
  const { user, logout } = useAuth()
  const { socket, isConnected } = useSocket()
  const navigate = useNavigate()

  const [zones, setZones] = useState([])
  const [tables, setTables] = useState([])
  const [activeZone, setActiveZone] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  // Aggiornamenti live via Socket.io
  useEffect(() => {
    if (!socket) return
    const handler = ({ tableId, status }) => {
      setTables(prev => prev.map(t => t.id === tableId ? { ...t, status } : t))
    }
    socket.on('table-status-changed', handler)
    return () => socket.off('table-status-changed', handler)
  }, [socket])

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
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#8B0000] flex items-center justify-center">
            <span className="text-[#D4AF37] font-bold text-sm">G</span>
          </div>
          <span className="text-[#F5F5DC] font-semibold">GustoPro</span>
          <div className={`flex items-center gap-1 text-xs ${isConnected ? 'text-emerald-400' : 'text-[#888]'}`}>
            {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{isConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {['kitchen', 'admin', 'manager'].includes(user?.role) && (
            <button onClick={() => navigate('/kds')}
              className="flex items-center gap-2 text-[#888] hover:text-[#D4AF37] transition text-sm">
              <ChefHat size={16} /> KDS
            </button>
          )}
          {['admin', 'manager'].includes(user?.role) && (
            <button onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-[#888] hover:text-[#D4AF37] transition text-sm">
              <LayoutDashboard size={16} /> Dashboard
            </button>
          )}
          <span className="text-[#888] text-sm">
            {user?.name} · <span className="text-[#D4AF37]">{user?.role}</span>
          </span>
          <button onClick={logout}
            className="flex items-center gap-2 text-[#888] hover:text-red-400 transition text-sm">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Zone Tabs */}
      <div className="bg-[#222] border-b border-[#3A3A3A] px-6 flex items-center">
        {zones.map(zone => (
          <button
            key={zone.id}
            onClick={() => setActiveZone(zone.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
              activeZone === zone.id
                ? 'border-[#D4AF37] text-[#D4AF37]'
                : 'border-transparent text-[#888] hover:text-[#F5F5DC]'
            }`}
          >
            {zone.name}
          </button>
        ))}
        <button onClick={loadData} className="ml-auto text-[#555] hover:text-[#888] p-3 transition">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Stats bar */}
      {!loading && !error && (
        <div className="px-6 py-2 flex items-center gap-5 text-xs border-b border-[#3A3A3A] bg-[#1E1E1E]">
          <span className="text-[#555]">{activeZoneName}</span>
          <span className="text-emerald-400">{stats.free} liberi</span>
          <span className="text-red-400">{stats.occupied} occupati</span>
          <span className="text-[#555]">{stats.total} tavoli</span>
        </div>
      )}

      {/* Contenuto principale */}
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
            <button onClick={loadData} className="text-[#D4AF37] text-sm hover:underline">
              Riprova
            </button>
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
            {filteredTables.map(table => {
              const cfg = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.free
              return (
                <motion.button
                  key={table.id}
                  onClick={() => {
                    const isCashier = ['cashier', 'admin', 'manager'].includes(user?.role)
                    if (isCashier && table.status === 'occupied' && table.active_order_id) {
                      navigate(`/checkout/${table.active_order_id}`)
                    } else {
                      navigate(`/order/${table.id}`)
                    }
                  }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={`relative rounded-xl border-2 p-5 flex flex-col items-center gap-3 transition ${cfg.color}`}
                >
                  <span className={`absolute top-3 right-3 w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className="text-[#F5F5DC] text-2xl font-bold">{table.table_number}</span>
                  <div className="flex items-center gap-1 text-[#888] text-xs">
                    <Users size={11} />
                    <span>{table.seats} posti</span>
                  </div>
                  <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
                </motion.button>
              )
            })}
          </motion.div>
        )}
      </div>
    </div>
  )
}
