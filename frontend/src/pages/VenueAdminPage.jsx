import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, LayoutGrid, Plus, Pencil, Trash2, RefreshCw, Check, X,
  ChevronDown, ChevronUp, Users,
} from 'lucide-react'
import { zonesAPI, tablesAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { Card, Badge, Button } from '../components/v2'

const STATUS_TONE = {
  free:     'ok',
  occupied: 'gold',
  reserved: 'sea',
  dirty:    'warn',
  parked:   'park',
}

const inputCls = 'bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm outline-none transition'

// ─── Table Row ───────────────────────────────────────────────────────────────
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
    <div className={`border-b border-[var(--color-border-soft)] last:border-0 ${
      table.status === 'occupied' ? 'bg-[var(--color-gold-soft)]/40' : ''
    }`}>
      {!editing ? (
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="serif text-[var(--color-text)] font-bold text-lg w-8 text-center tnum">{table.table_number}</span>
          <div className="flex items-center gap-1 text-[var(--color-text-2)] text-xs tnum">
            <Users size={11} /> {table.seats} posti
          </div>
          <Badge tone={STATUS_TONE[table.status] || 'neutral'} size="sm">{table.status}</Badge>
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 text-[var(--color-text-3)] hover:text-[var(--color-gold)] transition rounded-lg hover:bg-[var(--color-gold-soft)]"
              aria-label="Modifica"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(table.id, table.table_number, table.status)}
              className="p-1.5 text-[var(--color-text-3)] hover:text-[var(--color-err)] transition rounded-lg hover:bg-[var(--color-err-soft)]"
              aria-label="Elimina"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 flex flex-col gap-2 bg-[var(--color-surface-2)]">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold">Numero</label>
              <input type="number" value={num} onChange={e => setNum(e.target.value)} className={`${inputCls} w-24 tnum`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold">Posti</label>
              <input type="number" value={seats} onChange={e => setSeats(e.target.value)} className={`${inputCls} w-24 tnum`} />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
              <label className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold">Zona</label>
              <select value={zoneId} onChange={e => setZoneId(e.target.value)} className={inputCls}>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" fullWidth onClick={() => setEditing(false)}>Annulla</Button>
            <Button size="sm" fullWidth loading={saving} leftIcon={<Check size={11} />} onClick={handleSave}>Salva</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Zone Card ───────────────────────────────────────────────────────────────
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
    <Card padding="none" className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-[var(--color-surface-2)]">
        {editingName ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingName(false) }}
              className={`${inputCls} flex-1 border-[var(--color-gold-ring)]`}
            />
            <button onClick={handleRename} className="text-[var(--color-ok)] hover:text-[var(--color-ok)]/80 p-1">
              <Check size={16} />
            </button>
            <button onClick={() => { setName(zone.name); setEditingName(false) }} className="text-[var(--color-text-3)] hover:text-[var(--color-text)] p-1">
              <X size={16} />
            </button>
          </div>
        ) : (
          <button onClick={() => setExpanded(p => !p)} className="flex-1 flex items-center gap-2 text-left">
            {expanded ? <ChevronUp size={14} className="text-[var(--color-text-3)]" /> : <ChevronDown size={14} className="text-[var(--color-text-3)]" />}
            <span className="serif text-[var(--color-text)] font-bold text-base tracking-tight">{zone.name}</span>
            <span className="text-[var(--color-text-3)] text-xs tnum">
              {zoneTables.length} tavoli · {zoneTables.filter(t => t.status === 'occupied').length} occupati
            </span>
          </button>
        )}
        {!editingName && (
          <>
            <button onClick={() => setEditingName(true)} className="text-[var(--color-text-3)] hover:text-[var(--color-gold)] transition p-1">
              <Pencil size={14} />
            </button>
            <button onClick={handleDeleteZone} className="text-[var(--color-text-3)] hover:text-[var(--color-err)] transition p-1">
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      {/* Tables */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[var(--color-border-soft)]"
          >
            {zoneTables.map(t => (
              <TableRow key={t.id} table={t} zones={allZones} onEdit={handleEditTable} onDelete={handleDeleteTable} />
            ))}

            {addingTable ? (
              <div className="px-4 py-3 bg-[var(--color-surface-2)] border-t border-[var(--color-border-soft)] flex items-end gap-2 flex-wrap">
                <div className="flex flex-col gap-1">
                  <label className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold">Numero</label>
                  <input
                    type="number"
                    value={newNum}
                    onChange={e => setNewNum(e.target.value)}
                    autoFocus
                    placeholder="es. 12"
                    className={`${inputCls} w-20 tnum`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold">Posti</label>
                  <input
                    type="number"
                    value={newSeats}
                    onChange={e => setNewSeats(e.target.value)}
                    className={`${inputCls} w-16 tnum`}
                  />
                </div>
                <Button size="sm" loading={saving} leftIcon={<Check size={11} />} onClick={handleAddTable}>
                  Aggiungi
                </Button>
                <button onClick={() => setAddingTable(false)} className="text-[var(--color-text-3)] hover:text-[var(--color-text)] p-2">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingTable(true)}
                className="w-full flex items-center justify-center gap-1.5 py-3 text-[var(--color-text-3)] hover:text-[var(--color-gold)] text-xs font-semibold transition border-t border-[var(--color-border-soft)]"
              >
                <Plus size={12} /> Aggiungi tavolo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
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
  }, []) // eslint-disable-line

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
    <div className="min-h-screen flex flex-col">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <LayoutGrid size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Zone e tavoli
        </h1>
        <Badge tone="neutral" size="sm">{tables.length} tavoli totali</Badge>

        <Button
          size="sm"
          leftIcon={addingZone ? <X size={13} /> : <Plus size={13} />}
          onClick={() => setAddingZone(p => !p)}
          className="ml-auto"
        >
          {addingZone ? 'Chiudi' : 'Nuova zona'}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-3 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento zone…</span>
          </div>
        ) : (
          <>
            <AnimatePresence>
              {addingZone && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <Card padding="md" className="flex items-center gap-3">
                    <input
                      value={newZoneName}
                      onChange={e => setNewZoneName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateZone(); if (e.key === 'Escape') setAddingZone(false) }}
                      placeholder="Nome zona (es. Terrazza, Sala interna…)"
                      autoFocus
                      className={`${inputCls} flex-1`}
                    />
                    <Button loading={savingZone} leftIcon={<Check size={13} />} onClick={handleCreateZone}>
                      Crea
                    </Button>
                    <button onClick={() => setAddingZone(false)} className="text-[var(--color-text-3)] hover:text-[var(--color-text)] p-2">
                      <X size={16} />
                    </button>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {zones.length === 0 && !addingZone && (
              <div className="flex flex-col items-center gap-3 py-20 text-[var(--color-text-3)]">
                <LayoutGrid size={48} className="text-[var(--color-text-3)]/40" />
                <p className="serif text-[var(--color-text-2)] text-base font-bold">Nessuna zona ancora</p>
                <button onClick={() => setAddingZone(true)} className="text-[var(--color-gold)] text-sm hover:underline font-semibold">
                  Crea la prima zona
                </button>
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
