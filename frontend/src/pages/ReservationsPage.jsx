import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, CalendarDays, Plus, ChevronLeft, ChevronRight,
  X, Check, RefreshCw, Phone, Users, Clock, Pencil,
  UserCheck, UserX, AlertCircle,
} from 'lucide-react'
import { reservationsAPI, tablesAPI, customersAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

// ─── Helpers ────────────────────────────────────────────────

function dateStr(d) {
  return d.toISOString().slice(0, 10)
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function fmtDate(str) {
  return new Date(str + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtTime(t) {
  return t?.slice(0, 5) ?? ''
}

const STATUS_CFG = {
  confirmed: { label: 'Confermata', color: 'text-blue-400',    bg: 'bg-blue-900/20',    border: 'border-blue-500/30' },
  seated:    { label: 'Al tavolo',  color: 'text-emerald-400', bg: 'bg-emerald-900/20', border: 'border-emerald-500/30' },
  cancelled: { label: 'Cancellata', color: 'text-[#555]',      bg: 'bg-[#2A2A2A]',      border: 'border-[#3A3A3A]' },
  no_show:   { label: 'No show',    color: 'text-red-400',     bg: 'bg-red-900/20',     border: 'border-red-500/30' },
}

// ─── Reservation Form Modal ──────────────────────────────────

function ReservationForm({ initial, tables, onClose, onSaved }) {
  const { toast } = useToast()
  const isEdit = !!initial
  const today  = dateStr(new Date())

  const [form, setForm] = useState({
    customer_name:  initial?.customer_name  ?? '',
    customer_phone: initial?.customer_phone ?? '',
    table_id:       initial?.table_id       ?? '',
    party_size:     initial?.party_size     ?? 2,
    reserved_date:  initial?.reserved_date?.slice(0, 10) ?? today,
    reserved_time:  fmtTime(initial?.reserved_time) || '20:00',
    notes:          initial?.notes          ?? '',
  })
  const [customerSuggestions, setCustomerSuggestions] = useState([])
  const [saving, setSaving] = useState(false)
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Autocomplete customer name
  const searchCustomers = async (q) => {
    if (q.length < 2) { setCustomerSuggestions([]); return }
    try {
      const res = await customersAPI.list(q)
      setCustomerSuggestions(res.data.slice(0, 5))
    } catch { setCustomerSuggestions([]) }
  }

  const selectCustomer = (c) => {
    up('customer_name', c.name)
    up('customer_phone', c.phone || form.customer_phone)
    setCustomerSuggestions([])
  }

  const submit = async () => {
    if (!form.customer_name.trim()) { toast({ type: 'warning', title: 'Nome cliente obbligatorio' }); return }
    if (!form.reserved_date)        { toast({ type: 'warning', title: 'Data obbligatoria' }); return }
    if (!form.reserved_time)        { toast({ type: 'warning', title: 'Orario obbligatorio' }); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        table_id:   form.table_id   || null,
        party_size: parseInt(form.party_size),
      }
      if (isEdit) {
        await reservationsAPI.update(initial.id, payload)
        toast({ type: 'success', title: 'Prenotazione aggiornata' })
      } else {
        await reservationsAPI.create(payload)
        toast({ type: 'success', title: `Prenotazione per ${form.customer_name} creata` })
      }
      onSaved()
    } catch (err) {
      toast({ type: 'error', title: err.response?.data?.error ?? 'Errore salvataggio' })
    } finally { setSaving(false) }
  }

  const freeTables = tables.filter(t => t.status === 'free' || t.status === 'reserved' || t.id === initial?.table_id)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="bg-[#222] border border-[#3A3A3A] rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3A3A3A] sticky top-0 bg-[#222]">
          <h3 className="text-[#F5F5DC] font-semibold">{isEdit ? 'Modifica prenotazione' : 'Nuova prenotazione'}</h3>
          <button onClick={onClose} className="text-[#555] hover:text-[#888]"><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Customer name with autocomplete */}
          <div className="flex flex-col gap-1.5 relative">
            <label className="text-[#888] text-xs">Cliente *</label>
            <input
              value={form.customer_name}
              onChange={e => { up('customer_name', e.target.value); searchCustomers(e.target.value) }}
              placeholder="Nome cliente (digita per cercare)"
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]"
            />
            {customerSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg overflow-hidden z-10 shadow-xl">
                {customerSuggestions.map(c => (
                  <button key={c.id} onClick={() => selectCustomer(c)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[#3A3A3A] transition flex items-center justify-between">
                    <span className="text-[#F5F5DC]">{c.name}</span>
                    {c.phone && <span className="text-[#555] text-xs">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Phone */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#888] text-xs flex items-center gap-1"><Phone size={11} /> Telefono</label>
            <input value={form.customer_phone} onChange={e => up('customer_phone', e.target.value)}
              placeholder="+39 …"
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]" />
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[#888] text-xs flex items-center gap-1"><CalendarDays size={11} /> Data *</label>
              <input type="date" value={form.reserved_date} onChange={e => up('reserved_date', e.target.value)}
                min={today}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[#888] text-xs flex items-center gap-1"><Clock size={11} /> Ora *</label>
              <input type="time" value={form.reserved_time} onChange={e => up('reserved_time', e.target.value)}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm" />
            </div>
          </div>

          {/* Coperti + Tavolo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[#888] text-xs flex items-center gap-1"><Users size={11} /> Coperti</label>
              <input type="number" min={1} max={30} value={form.party_size}
                onChange={e => up('party_size', e.target.value)}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[#888] text-xs">Tavolo (opzionale)</label>
              <select value={form.table_id} onChange={e => up('table_id', e.target.value)}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm">
                <option value="">— Da assegnare —</option>
                {freeTables.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.table_number} ({t.seats} posti)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#888] text-xs">Note</label>
            <textarea value={form.notes} onChange={e => up('notes', e.target.value)}
              rows={2} placeholder="Allergie, occasioni speciali, richieste…"
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555] resize-none" />
          </div>

          <button onClick={submit} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-[#c9a42e] transition mt-1">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <><Check size={14} /> {isEdit ? 'Salva modifiche' : 'Crea prenotazione'}</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Reservation Card ────────────────────────────────────────

function ResCard({ r, onEdit, onStatus }) {
  const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.confirmed
  const isActive = r.status === 'confirmed'
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#F5F5DC] font-semibold">{r.customer_name}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-[#888] text-xs flex items-center gap-1">
              <Clock size={10} /> {fmtTime(r.reserved_time)}
            </span>
            <span className="text-[#888] text-xs flex items-center gap-1">
              <Users size={10} /> {r.party_size} coperti
            </span>
            {r.table_number && (
              <span className="text-[#D4AF37] text-xs font-semibold">
                Tavolo {r.table_number}
              </span>
            )}
            {r.customer_phone && (
              <a href={`tel:${r.customer_phone}`} className="text-[#888] text-xs flex items-center gap-1 hover:text-[#D4AF37]">
                <Phone size={10} /> {r.customer_phone}
              </a>
            )}
          </div>
          {r.notes && (
            <p className="text-amber-300 text-xs mt-1 italic truncate">⚠ {r.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isActive && (
            <>
              <button onClick={() => onStatus(r.id, 'seated')}
                title="Segna al tavolo"
                className="p-1.5 rounded-lg text-[#555] hover:text-emerald-400 hover:bg-[#2A2A2A] transition">
                <UserCheck size={15} />
              </button>
              <button onClick={() => onStatus(r.id, 'no_show')}
                title="No show"
                className="p-1.5 rounded-lg text-[#555] hover:text-red-400 hover:bg-[#2A2A2A] transition">
                <UserX size={15} />
              </button>
            </>
          )}
          <button onClick={() => onEdit(r)}
            className="p-1.5 rounded-lg text-[#555] hover:text-[#D4AF37] hover:bg-[#2A2A2A] transition">
            <Pencil size={14} />
          </button>
          {isActive && (
            <button onClick={() => onStatus(r.id, 'cancelled')}
              title="Cancella"
              className="p-1.5 rounded-lg text-[#555] hover:text-red-400 hover:bg-[#2A2A2A] transition">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────

export default function ReservationsPage() {
  const navigate  = useNavigate()
  const { toast } = useToast()
  const [currentDate, setCurrentDate]   = useState(new Date())
  const [reservations, setReservations] = useState([])
  const [tables, setTables]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [editing, setEditing]           = useState(null)  // 'new' | reservation obj

  const load = useCallback(async (d = currentDate) => {
    setLoading(true)
    try {
      const [rRes, tRes] = await Promise.all([
        reservationsAPI.list(dateStr(d)),
        tablesAPI.list(),
      ])
      setReservations(rRes.data)
      setTables(tRes.data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento' })
    } finally { setLoading(false) }
  }, []) // eslint-disable-line

  useEffect(() => { load(currentDate) }, [currentDate]) // eslint-disable-line

  const handleStatus = async (id, status) => {
    try {
      await reservationsAPI.update(id, { status })
      setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r))
      const labels = { seated: 'Al tavolo', cancelled: 'Cancellata', no_show: 'No show' }
      toast({ type: status === 'seated' ? 'success' : 'warning', title: labels[status] })
    } catch {
      toast({ type: 'error', title: 'Errore aggiornamento' })
    }
  }

  const changeDate = (n) => {
    const d = addDays(currentDate, n)
    setCurrentDate(d)
  }

  const active    = reservations.filter(r => r.status === 'confirmed')
  const seated    = reservations.filter(r => r.status === 'seated')
  const cancelled = reservations.filter(r => r.status === 'cancelled' || r.status === 'no_show')
  const isToday   = dateStr(currentDate) === dateStr(new Date())

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/tables')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <CalendarDays size={18} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Prenotazioni</span>

        {/* Date navigator */}
        <div className="flex items-center gap-2 ml-2">
          <button onClick={() => changeDate(-1)} className="text-[#555] hover:text-[#888] transition p-1">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setCurrentDate(new Date())}
            className={`text-sm font-medium transition ${isToday ? 'text-[#D4AF37]' : 'text-[#F5F5DC] hover:text-[#D4AF37]'}`}>
            {isToday ? 'Oggi' : currentDate.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
          </button>
          <button onClick={() => changeDate(1)} className="text-[#555] hover:text-[#888] transition p-1">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs ml-2">
          <span className="text-blue-400">{active.length} conferm.</span>
          <span className="text-emerald-400">{seated.length} al tavolo</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => load(currentDate)} disabled={loading}
            className="text-[#555] hover:text-[#888] transition disabled:opacity-40">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:bg-[#c9a42e] transition">
            <Plus size={13} /> Nuova
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <p className="text-[#555] text-xs mb-4 capitalize">{fmtDate(dateStr(currentDate))}</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw size={18} className="animate-spin text-[#555]" />
          </div>
        ) : reservations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <CalendarDays size={40} className="text-[#333]" />
            <p className="text-[#555] text-sm">Nessuna prenotazione per questo giorno</p>
            <button onClick={() => setEditing('new')}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-sm font-semibold hover:bg-[#c9a42e] transition mt-2">
              <Plus size={14} /> Aggiungi prenotazione
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {active.length > 0 && (
              <section>
                <h3 className="text-[#555] text-xs uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
                  <AlertCircle size={11} /> Confermate ({active.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {active.map(r => (
                    <ResCard key={r.id} r={r} onEdit={setEditing} onStatus={handleStatus} />
                  ))}
                </div>
              </section>
            )}
            {seated.length > 0 && (
              <section>
                <h3 className="text-[#555] text-xs uppercase tracking-wider font-medium mb-3">
                  Al tavolo ({seated.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {seated.map(r => (
                    <ResCard key={r.id} r={r} onEdit={setEditing} onStatus={handleStatus} />
                  ))}
                </div>
              </section>
            )}
            {cancelled.length > 0 && (
              <section>
                <h3 className="text-[#555] text-xs uppercase tracking-wider font-medium mb-3">
                  Cancellate / No show ({cancelled.length})
                </h3>
                <div className="flex flex-col gap-2 opacity-60">
                  {cancelled.map(r => (
                    <ResCard key={r.id} r={r} onEdit={setEditing} onStatus={handleStatus} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <ReservationForm
            initial={editing === 'new' ? null : editing}
            tables={tables}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(currentDate) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
