import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, MapPin, UserPlus, X, Copy, RefreshCw, Trash2 } from 'lucide-react'
import { assignmentsAPI, usersAPI, zonesAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { Card, Badge, Button } from '../components/v2'

export default function ZoneAssignmentPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [assignments, setAssignments] = useState([])
  const [zones, setZones] = useState([])
  const [waiters, setWaiters] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(null)
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
    <div className="min-h-screen flex flex-col">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => navigate('/tables')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <MapPin size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Assegnazione zone
        </h1>
        <Badge tone="neutral" size="sm">Oggi</Badge>

        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Copy size={13} />}
          onClick={handleCopyYesterday}
          className="ml-auto"
        >
          Copia da ieri
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento zone…</span>
          </div>
        ) : (
          <div className="grid gap-4">
            {zones.map(zone => {
              const zoneAssignments = assignments.filter(a => a.zone_id === zone.id)
              return (
                <Card key={zone.id} padding="none" className="overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border-soft)] bg-[var(--color-surface-2)]">
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-[var(--color-gold)]" />
                      <span className="serif text-[var(--color-text)] font-bold text-base tracking-tight">{zone.name}</span>
                      <Badge tone="neutral" size="sm">{zoneAssignments.length} assegnati</Badge>
                    </div>
                    <button
                      onClick={() => { setShowAdd(zone.id); setSelectedWaiter('') }}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--color-gold-soft)] text-[var(--color-gold)] rounded-lg text-xs font-semibold hover:bg-[var(--color-gold)]/20 transition border border-[var(--color-gold-ring)]"
                    >
                      <UserPlus size={12} /> Aggiungi
                    </button>
                  </div>

                  <div className="divide-y divide-[var(--color-border-soft)]">
                    {zoneAssignments.length === 0 ? (
                      <p className="text-[var(--color-text-3)] text-sm text-center py-6">
                        Nessun cameriere assegnato
                      </p>
                    ) : (
                      zoneAssignments.map(a => (
                        <div key={a.id} className="flex items-center justify-between px-5 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[var(--color-sea-soft)] border border-[var(--color-sea)]/30 flex items-center justify-center text-[var(--color-sea)] text-sm font-bold tnum">
                              {a.user_name?.charAt(0)}
                            </div>
                            <div>
                              <span className="text-[var(--color-text)] text-sm font-semibold">{a.user_name}</span>
                              {a.sub_role && (
                                <Badge tone="info" size="sm" className="ml-2">{a.sub_role}</Badge>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemove(a.id)}
                            title="Rimuovi"
                            className="p-1.5 rounded-lg text-[var(--color-text-3)] hover:text-[var(--color-err)] hover:bg-[var(--color-err-soft)] transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add waiter inline */}
                  <AnimatePresence>
                    {showAdd === zone.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-[var(--color-border-soft)]"
                      >
                        <div className="px-5 py-3 flex items-center gap-2 bg-[var(--color-surface-2)]">
                          <select
                            value={selectedWaiter}
                            onChange={e => setSelectedWaiter(e.target.value)}
                            className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm outline-none transition"
                          >
                            <option value="">Seleziona cameriere…</option>
                            {availableWaiters(zone.id).map(w => (
                              <option key={w.id} value={w.id}>
                                {w.name}{w.sub_role ? ` (${w.sub_role})` : ''}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            disabled={!selectedWaiter}
                            onClick={() => handleAssign(zone.id)}
                          >
                            Assegna
                          </Button>
                          <button
                            onClick={() => setShowAdd(null)}
                            className="text-[var(--color-text-3)] hover:text-[var(--color-text)] p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition"
                            aria-label="Annulla"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
