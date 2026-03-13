import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, LayoutGrid, Plus, Pencil, Trash2, RefreshCw, Check, X,
  ChevronDown, ChevronUp, Users,
} from 'lucide-react'
import { zonesAPI, tablesAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

// ─── Table Row ───────────────────────────────────────────────
function TableRow({ table, zones, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [num, setNum]         = useState(table.table_number)
  const [seats, setSeats]     = useState(table.seats)
  const [zoneId, setZoneId]   = useState(table.zone_id)
  const [saving, setSaving]   = useState(false)
  const { toast } = useToast()

  const handleSave = async () => {
    setSaving(true)
    try {
      await onEdit(table.id, { table_number: parseInt(num), seats: parseInt(seats), zone_id: zoneId })
      setEditing(false)
    } catch { toast({ type: 'error', title: 'Errore salvataggio' }) }
    finally { setSaving(false) }
  }

  return (
    <div className={`border-b border-[#2A2A2A] last:border-0 ${table.status === 'occupied' ? 'bg-red-900/5' : ''}`}>
      {!editing ? (
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="text-[#F5F5DC] font-bold text-lg w-8 text-center">{table.table_number}</span>
          <div className="flex items-center gap-1 text-[#888] text-xs">
            <Users size={11} /> {table.seats} posti
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ml-1 ${
            table.status === 'occupied' ? 'bg-red-900/30 text-red-400' :
            table.status === 'reserved' ? 'bg-blue-900/30 text-blue-400' :
            table.status === 'dirty' ? 'bg-yellow-900/30 text-yellow-400' :
            'bg-emerald-900/30 text-emerald-400'
          }`}>{table.status}</span>
          <div className="ml-auto flex gap-1">
            <button onClick={() => setEditing(true)} className="p-1.5 text-[#444] hover:text-[#D4AF37] transition rounded-lg hover:bg-[#2A2A2A]">
              <Pencil size={13} />
            </button>
            <button onClick={() => onDelete(table.id, table.table_number, table.status)}
              className="p-1.5 text-[#444] hover:text-red-400 transition rounded-lg hover:bg-[#2A2A2A]">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 flex flex-col gap-2 bg-[#1E1E1E]">
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[#555] text-[10px]">Numero</label>
              <input type="number" value={num} onChange={e => setNum(e.target.value)}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition w-24" />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[#555] text-[10px]">Posti</label>
              <input type="number" value={seats} onChange={e => setSeats(e.target.value)}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition w-24" />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[#555] text-[10px]">Zona</label>
              <select value={zoneId} onChange={e => setZoneId(e.target.value)}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition">
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 py-1.5 rounded-lg border border-[#3A3A3A] text-[#555] text-xs hover:text-[#888] transition">Annulla</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-1.5 rounded-lg bg-[#D4AF37] text-[#1A1A1A] font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-40 hover:bg-[#c9a42e] transition">
              {saving ? <RefreshCw size={11} className="animate-spin" /> : <><Check size={11} /> Salva</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Zone Card ───────────────────────────────────────────────
function ZoneCard({ zone, allZones, allTables, onRefresh }) {
  const { toast } = useToast()
  const [expanded, setExpanded]   = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [name, setName]           = useState(zone.name)
  const [addingTable, setAddingTable] = useState(false)
  const [newNum, setNewNum]       = useState('')
  const [newSeats, setNewSeats]   = useState('4')
  const [saving, setSaving]       = useState(false)

  const zoneTables = allTables.filter(t => t.zone_id === zone.id)

  const handleRename = async () => {
    if (!name.trim()) return
    try {
      await zonesAPI.update(zone.id, { name: name.trim() })
      setEditingName(false)
      onRefresh()
      toast({ type: 'success', title: 'Zona rinominata' })
    } catch { toast({ type: 'error', title: 'Errore' }) }
  }

  const handleDeleteZone = async () => {
    if (zoneTables.length > 0) {
      toast({ type: 'warning', title: `Sposta i ${zoneTables.length} tavoli prima di eliminare la zona` })
      return
    }
    if (!window.confirm(`Eliminare la zona "${zone.name}"?`)) return
    try {
      await zonesAPI.remove(zone.id)
      onRefresh()
      toast({ type: 'success', title: 'Zona eliminata' })
    } catch (err) {
      toast({ type: 'error', title: err.response?.data?.error ?? 'Errore eliminazione' })
    }
  }

  const handleAddTable = async () => {
    if (!newNum) { toast({ type: 'warning', title: 'Numero tavolo obbligatorio' }); return }
    setSaving(true)
    try {
      await tablesAPI.create({ zone_id: zone.id, table_number: parseInt(newNum), seats: parseInt(newSeats) })
      setNewNum(''); setNewSeats('4'); setAddingTable(false)
      onRefresh()
      toast({ type: 'success', title: `Tavolo ${newNum} aggiunto` })
    } catch { toast({ type: 'error', title: 'Errore — numero tavolo già in uso?' }) }
    finally { setSaving(false) }
  }

  const handleEditTable = async (id, data) => {
    await tablesAPI.update(id, data)
    onRefresh()
    toast({ type: 'success', title: 'Tavolo aggiornato' })
  }

  const handleDeleteTable = async (id, num, status) => {
    if (status === 'occupied') { toast({ type: 'warning', title: 'Impossibile eliminare un tavolo occupato' }); return }
    if (!window.confirm(`Eliminare il tavolo ${num}?`)) return
    try {
      await tablesAPI.remove(id)
      onRefresh()
      toast({ type: 'success', title: `Tavolo ${num} eliminato` })
    } catch (err) {
      toast({ type: 'error', title: err.response?.data?.error ?? 'Errore eliminazione' })
    }
  }

  return (
    <div className="bg-[#222] border border-[#3A3A3A] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5">
        {editingName ? (
          <div className="flex-1 flex items-center gap-2">
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingName(false) }}
              className="flex-1 bg-[#2A2A2A] border border-[#D4AF37]/50 rounded-lg px-3 py-1 text-[#F5F5DC] text-sm outline-none" />
            <button onClick={handleRename} className="text-emerald-400 hover:text-emerald-300"><Check size={15} /></button>
            <button onClick={() => { setName(zone.name); setEditingName(false) }} className="text-[#444] hover:text-[#888]"><X size={15} /></button>
          </div>
        ) : (
          <button onClick={() => setExpanded(p => !p)} className="flex-1 flex items-center gap-2 text-left">
            {expanded ? <ChevronUp size={14} className="text-[#555]" /> : <ChevronDown size={14} className="text-[#555]" />}
            <span className="text-[#F5F5DC] font-semibold">{zone.name}</span>
            <span className="text-[#555] text-xs">{zoneTables.length} tavoli · {zoneTables.filter(t => t.status === 'occupied').length} occupati</span>
          </button>
        )}
        {!editingName && (
          <>
            <button onClick={() => setEditingName(true)} className="text-[#444] hover:text-[#D4AF37] transition">
              <Pencil size={14} />
            </button>
            <button onClick={handleDeleteZone} className="text-[#444] hover:text-red-400 transition">
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      {/* Tables */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[#2A2A2A]">
            {zoneTables.map(t => (
              <TableRow key={t.id} table={t} zones={allZones} onEdit={handleEditTable} onDelete={handleDeleteTable} />
            ))}

            {addingTable ? (
              <div className="px-4 py-3 bg-[#1E1E1E] border-t border-[#2A2A2A] flex items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[#555] text-[10px]">Numero</label>
                  <input type="number" value={newNum} onChange={e => setNewNum(e.target.value)} autoFocus placeholder="es. 12"
                    className="w-20 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[#555] text-[10px]">Posti</label>
                  <input type="number" value={newSeats} onChange={e => setNewSeats(e.target.value)}
                    className="w-16 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
                </div>
                <button onClick={handleAddTable} disabled={saving}
                  className="py-1.5 px-3 rounded-lg bg-[#D4AF37] text-[#1A1A1A] font-bold text-xs flex items-center gap-1 disabled:opacity-40 hover:bg-[#c9a42e] transition">
                  {saving ? <RefreshCw size={11} className="animate-spin" /> : <><Check size={11} /> Aggiungi</>}
                </button>
                <button onClick={() => setAddingTable(false)} className="py-1.5 px-2 text-[#444] hover:text-[#888]"><X size={14} /></button>
              </div>
            ) : (
              <button onClick={() => setAddingTable(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[#555] hover:text-[#D4AF37] text-xs transition border-t border-[#2A2A2A]">
                <Plus size={12} /> Aggiungi tavolo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────
export default function VenueAdminPage() {
  const navigate  = useNavigate()
  const { toast } = useToast()
  const [zones, setZones]     = useState([])
  const [tables, setTables]   = useState([])
  const [loading, setLoading] = useState(true)
  const [newZoneName, setNewZoneName] = useState('')
  const [addingZone, setAddingZone]   = useState(false)
  const [savingZone, setSavingZone]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [zr, tr] = await Promise.all([zonesAPI.list(), tablesAPI.list()])
      setZones(zr.data)
      setTables(tr.data)
    } catch { toast({ type: 'error', title: 'Errore caricamento' }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreateZone = async () => {
    if (!newZoneName.trim()) return
    setSavingZone(true)
    try {
      await zonesAPI.create({ name: newZoneName.trim() })
      setNewZoneName(''); setAddingZone(false)
      load()
      toast({ type: 'success', title: 'Zona creata' })
    } catch { toast({ type: 'error', title: 'Errore' }) }
    finally { setSavingZone(false) }
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <LayoutGrid size={17} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Zone e Tavoli</span>
        <span className="text-[#555] text-xs">{tables.length} tavoli totali</span>
        <button onClick={() => setAddingZone(p => !p)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:bg-[#c9a42e] transition">
          {addingZone ? <X size={13} /> : <Plus size={13} />} {addingZone ? 'Chiudi' : 'Nuova zona'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw size={18} className="animate-spin text-[#555]" /></div>
        ) : (
          <>
            <AnimatePresence>
              {addingZone && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="bg-[#222] border border-[#3A3A3A] rounded-2xl p-4 flex items-center gap-3">
                  <input value={newZoneName} onChange={e => setNewZoneName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateZone(); if (e.key === 'Escape') setAddingZone(false) }}
                    placeholder="Nome zona (es. Terrazza, Sala interna…)" autoFocus
                    className="flex-1 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
                  <button onClick={handleCreateZone} disabled={savingZone}
                    className="px-4 py-2 bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm rounded-lg flex items-center gap-1.5 disabled:opacity-40 hover:bg-[#c9a42e] transition">
                    {savingZone ? <RefreshCw size={13} className="animate-spin" /> : <><Check size={13} /> Crea</>}
                  </button>
                  <button onClick={() => setAddingZone(false)} className="text-[#444] hover:text-[#888]"><X size={16} /></button>
                </motion.div>
              )}
            </AnimatePresence>

            {zones.length === 0 && !addingZone && (
              <div className="flex flex-col items-center gap-3 py-20">
                <LayoutGrid size={40} className="text-[#333]" />
                <p className="text-[#555] text-sm">Nessuna zona ancora</p>
                <button onClick={() => setAddingZone(true)} className="text-[#D4AF37] text-sm hover:underline">Crea la prima zona</button>
              </div>
            )}

            {zones.map(zone => (
              <ZoneCard key={zone.id} zone={zone} allZones={zones} allTables={tables} onRefresh={load} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
