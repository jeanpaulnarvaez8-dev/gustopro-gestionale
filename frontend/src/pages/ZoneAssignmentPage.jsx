import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, MapPin, UserPlus, X, Copy, RefreshCw, Trash2 } from 'lucide-react'
import { assignmentsAPI, usersAPI, zonesAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

export default function ZoneAssignmentPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [assignments, setAssignments] = useState([])
  const [zones, setZones] = useState([])
  const [waiters, setWaiters] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(null) // zone_id o null
  const [selectedWaiter, setSelectedWaiter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [aRes, zRes, uRes] = await Promise.all([
        assignmentsAPI.list(),
        zonesAPI.list(),
        usersAPI.list(),
      ])
      setAssignments(aRes.data)
      setZones(zRes.data)
      setWaiters(uRes.data.filter(u => u.role === 'waiter' && u.is_active))
    } catch {
      toast({ type: 'error', title: 'Errore caricamento' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const assignedIds = new Set(assignments.map(a => `${a.user_id}-${a.zone_id}`))
  const availableWaiters = (zoneId) =>
    waiters.filter(w => !assignedIds.has(`${w.id}-${zoneId}`))

  async function handleAssign(zoneId) {
    if (!selectedWaiter) return
    try {
      await assignmentsAPI.create({ user_id: selectedWaiter, zone_id: zoneId })
      toast({ type: 'success', title: 'Cameriere assegnato' })
      setShowAdd(null)
      setSelectedWaiter('')
      load()
    } catch {
      toast({ type: 'error', title: 'Errore assegnazione' })
    }
  }

  async function handleRemove(id) {
    try {
      await assignmentsAPI.remove(id)
      toast({ type: 'success', title: 'Assegnazione rimossa' })
      load()
    } catch {
      toast({ type: 'error', title: 'Errore rimozione' })
    }
  }

  async function handleCopyYesterday() {
    try {
      const { data } = await assignmentsAPI.copyYesterday()
      toast({ type: 'success', title: `${data.copied} assegnazioni copiate da ieri` })
      load()
    } catch {
      toast({ type: 'error', title: 'Errore copia' })
    }
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/tables')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <MapPin size={18} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Assegnazione Zone</span>
        <span className="text-[#555] text-xs">Oggi</span>
        <button onClick={handleCopyYesterday}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#2A2A2A] border border-[#3A3A3A] text-[#888] rounded-lg text-xs font-medium hover:text-[#F5F5DC] transition">
          <Copy size={13} /> Copia da ieri
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw size={18} className="animate-spin text-[#555]" />
          </div>
        ) : (
          <div className="grid gap-4">
            {zones.map(zone => {
              const zoneAssignments = assignments.filter(a => a.zone_id === zone.id)
              return (
                <div key={zone.id} className="bg-[#222] border border-[#3A3A3A] rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-[#2E2E2E]">
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-[#D4AF37]" />
                      <span className="text-[#F5F5DC] font-semibold text-sm">{zone.name}</span>
                      <span className="text-[#555] text-xs">({zoneAssignments.length} assegnati)</span>
                    </div>
                    <button onClick={() => { setShowAdd(zone.id); setSelectedWaiter('') }}
                      className="flex items-center gap-1 px-2.5 py-1 bg-[#D4AF37]/10 text-[#D4AF37] rounded-lg text-xs font-medium hover:bg-[#D4AF37]/20 transition">
                      <UserPlus size={12} /> Aggiungi
                    </button>
                  </div>

                  <div className="divide-y divide-[#2A2A2A]">
                    {zoneAssignments.length === 0 ? (
                      <p className="text-[#555] text-xs text-center py-6">Nessun cameriere assegnato</p>
                    ) : (
                      zoneAssignments.map(a => (
                        <div key={a.id} className="flex items-center justify-between px-5 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-900/30 border border-blue-500/30 flex items-center justify-center text-blue-400 text-xs font-bold">
                              {a.user_name?.charAt(0)}
                            </div>
                            <div>
                              <span className="text-[#F5F5DC] text-sm font-medium">{a.user_name}</span>
                              {a.sub_role && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-medium bg-cyan-900/20 text-cyan-400 border border-cyan-500/30">
                                  {a.sub_role}
                                </span>
                              )}
                            </div>
                          </div>
                          <button onClick={() => handleRemove(a.id)}
                            className="p-1.5 rounded-lg text-[#555] hover:text-red-400 hover:bg-[#2A2A2A] transition">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add waiter inline */}
                  <AnimatePresence>
                    {showAdd === zone.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-[#3A3A3A]">
                        <div className="px-5 py-3 flex items-center gap-3 bg-[#1E1E1E]">
                          <select value={selectedWaiter} onChange={e => setSelectedWaiter(e.target.value)}
                            className="flex-1 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm">
                            <option value="">Seleziona cameriere...</option>
                            {availableWaiters(zone.id).map(w => (
                              <option key={w.id} value={w.id}>
                                {w.name}{w.sub_role ? ` (${w.sub_role})` : ''}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => handleAssign(zone.id)}
                            disabled={!selectedWaiter}
                            className="px-3 py-2 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-[#c9a42e] transition">
                            Assegna
                          </button>
                          <button onClick={() => setShowAdd(null)} className="text-[#555] hover:text-[#888]">
                            <X size={16} />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
