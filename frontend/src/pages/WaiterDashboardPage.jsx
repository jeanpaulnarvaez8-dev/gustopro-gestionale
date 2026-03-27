import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock, Check, Timer, Wine, UtensilsCrossed, RefreshCw } from 'lucide-react'
import { serviceAPI, assignmentsAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useSocket } from '../context/SocketContext'

function elapsed(readyAt) {
  if (!readyAt) return 0
  return Math.floor((Date.now() - new Date(readyAt).getTime()) / 60000)
}

function elapsedColor(min, isBeverage) {
  const warn = isBeverage ? 3 : 15
  const danger = isBeverage ? 5 : 20
  if (min >= danger) return 'text-red-400 bg-red-900/20 border-red-500/30'
  if (min >= warn) return 'text-amber-400 bg-amber-900/20 border-amber-500/30'
  return 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30'
}

export default function WaiterDashboardPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { socket } = useSocket()
  const [readyItems, setReadyItems] = useState([])
  const [myZones, setMyZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    try {
      const [itemsRes, zonesRes] = await Promise.all([
        serviceAPI.readyItems(),
        assignmentsAPI.my(),
      ])
      setReadyItems(itemsRes.data)
      setMyZones(zonesRes.data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  // Aggiorna timer ogni 30s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  // Ricarica quando arrivano aggiornamenti socket
  useEffect(() => {
    if (!socket) return
    const refresh = () => load()
    socket.on('item-status-updated', refresh)
    socket.on('item-ready-notify', refresh)
    socket.on('item-served', refresh)
    return () => {
      socket.off('item-status-updated', refresh)
      socket.off('item-ready-notify', refresh)
      socket.off('item-served', refresh)
    }
  }, [socket, load])

  async function handleServed(itemId) {
    try {
      await serviceAPI.markServed(itemId)
      setReadyItems(prev => prev.filter(i => i.item_id !== itemId))
      toast({ type: 'success', title: 'Servito!' })
    } catch {
      toast({ type: 'error', title: 'Errore' })
    }
  }

  // Raggruppa per tavolo
  const byTable = {}
  for (const item of readyItems) {
    const key = item.table_number
    if (!byTable[key]) byTable[key] = { tableNumber: key, zoneName: item.zone_name, items: [] }
    byTable[key].items.push(item)
  }
  const tables = Object.values(byTable)

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/tables')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <UtensilsCrossed size={18} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">I Miei Piatti</span>
        {readyItems.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
            {readyItems.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 text-[#555] text-xs">
          {myZones.map(z => (
            <span key={z.zone_id} className="px-2 py-0.5 rounded bg-[#3A3A3A] text-[#888] text-[10px]">
              {z.zone_name}
            </span>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw size={18} className="animate-spin text-[#555]" />
          </div>
        ) : tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#555]">
            <Check size={40} className="mb-3 text-emerald-500/30" />
            <p className="text-sm font-medium">Nessun piatto in attesa</p>
            <p className="text-xs mt-1">Tutti serviti!</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {tables.map(table => (
              <motion.div key={table.tableNumber}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-[#222] border border-[#3A3A3A] rounded-xl overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2E2E2E]">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] flex items-center justify-center text-xs font-bold">
                      {table.tableNumber}
                    </span>
                    <span className="text-[#888] text-xs">{table.zoneName}</span>
                  </div>
                  <span className="text-[#555] text-[10px]">{table.items.length} piatt{table.items.length === 1 ? 'o' : 'i'}</span>
                </div>

                <div className="divide-y divide-[#2A2A2A]">
                  {table.items.map(item => {
                    const min = elapsed(item.ready_at)
                    const colorClass = elapsedColor(min, item.is_beverage)
                    return (
                      <div key={item.item_id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {item.is_beverage
                            ? <Wine size={14} className="text-purple-400 shrink-0" />
                            : <UtensilsCrossed size={14} className="text-[#D4AF37] shrink-0" />
                          }
                          <div className="min-w-0">
                            <p className="text-[#F5F5DC] text-sm font-medium truncate">
                              {item.quantity}× {item.item_name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 ${colorClass}`}>
                            <Timer size={10} /> {min}m
                          </span>
                          <button onClick={() => handleServed(item.item_id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1">
                            <Check size={12} /> Servito
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
