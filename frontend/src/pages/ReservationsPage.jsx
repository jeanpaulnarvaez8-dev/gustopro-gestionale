import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, CalendarDays, Plus, ChevronLeft, ChevronRight,
  X, Check, RefreshCw, Phone, Users, Clock, Pencil,
  UserCheck, UserX, AlertCircle,
} from 'lucide-react'
import { reservationsAPI, tablesAPI, customersAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { Badge, Button, Modal } from '../components/v2'

// ─── Helpers ────────────────────────────────────────────────────────────────
function dateStr(d)         { return d.toISOString().slice(0, 10) }
function addDays(d, n)      { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function fmtDate(str)       { return new Date(str + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) }
function fmtTime(t)         { return t?.slice(0, 5) ?? '' }

// Tone tokens per stati prenotazione
const STATUS_CFG = {
  confirmed: { label: 'Confermata', tone: 'sea',     bg: 'bg-[var(--color-sea-soft)]',     border: 'border-[var(--color-sea)]/30',     color: 'text-[var(--color-sea)]'    },
  seated:    { label: 'Al tavolo',  tone: 'ok',      bg: 'bg-[var(--color-ok-soft)]',      border: 'border-[var(--color-ok)]/30',      color: 'text-[var(--color-ok)]'     },
  cancelled: { label: 'Cancellata', tone: 'neutral', bg: 'bg-[var(--color-surface-2)]',    border: 'border-[var(--color-border-strong)]', color: 'text-[var(--color-text-3)]' },
  no_show:   { label: 'No show',    tone: 'err',     bg: 'bg-[var(--color-err-soft)]',     border: 'border-[var(--color-err)]/30',     color: 'text-[var(--color-err)]'    },
}

// ─── Reservation Form (Modal v2) ─────────────────────────────────────────────
function ReservationForm({ initial, tables, onClose, onSaved }) {
  const { toast } = useToast()
  const isEdit = !!initial
  const today = dateStr(new Date())

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
        table_id: form.table_id || null,
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

  // Stile input riusabile (sintetizzo classes nel JSX direttamente)
  const inputCls = 'bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-3 py-2.5 text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-3)] outline-none transition'
  const labelCls = 'text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider flex items-center gap-1'

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={isEdit ? 'Modifica prenotazione' : 'Nuova prenotazione'}
      footer={
        <Button
          fullWidth
          size="lg"
          loading={saving}
          leftIcon={<Check size={16} />}
          onClick={submit}
        >
          {isEdit ? 'Salva modifiche' : 'Crea prenotazione'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Customer name with autocomplete */}
        <div className="flex flex-col gap-1.5 relative">
          <label className={labelCls}>Cliente *</label>
          <input
            value={form.customer_name}
            onChange={e => { up('customer_name', e.target.value); searchCustomers(e.target.value) }}
            placeholder="Nome cliente (digita per cercare)"
            className={inputCls}
          />
          {customerSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-lg overflow-hidden z-10 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
              {customerSuggestions.map(c => (
                <button
                  key={c.id}
                  onClick={() => selectCustomer(c)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.04)] transition flex items-center justify-between"
                >
                  <span className="text-[var(--color-text)]">{c.name}</span>
                  {c.phone && <span className="text-[var(--color-text-3)] text-xs tnum">{c.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}><Phone size={11} /> Telefono</label>
          <input
            value={form.customer_phone}
            onChange={e => up('customer_phone', e.target.value)}
            placeholder="+39 …"
            className={`${inputCls} tnum`}
          />
        </div>

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}><CalendarDays size={11} /> Data *</label>
            <input
              type="date"
              value={form.reserved_date}
              onChange={e => up('reserved_date', e.target.value)}
              min={today}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}><Clock size={11} /> Ora *</label>
            <input
              type="time"
              value={form.reserved_time}
              onChange={e => up('reserved_time', e.target.value)}
              className={`${inputCls} tnum`}
            />
          </div>
        </div>

        {/* Coperti + Tavolo */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}><Users size={11} /> Coperti</label>
            <input
              type="number"
              min={1}
              max={30}
              value={form.party_size}
              onChange={e => up('party_size', e.target.value)}
              className={`${inputCls} tnum`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Tavolo (opzionale)</label>
            <select
              value={form.table_id}
              onChange={e => up('table_id', e.target.value)}
              className={inputCls}
            >
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
          <label className={labelCls}>Note</label>
          <textarea
            value={form.notes}
            onChange={e => up('notes', e.target.value)}
            rows={2}
            placeholder="Allergie, occasioni speciali, richieste…"
            className={`${inputCls} resize-none`}
          />
        </div>
      </div>
    </Modal>
  )
}

// ─── Reservation Card ────────────────────────────────────────────────────────
function ResCard({ r, onEdit, onStatus }) {
  const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.confirmed
  const isActive = r.status === 'confirmed'

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[var(--color-text)] font-bold text-base">{r.customer_name}</span>
            <Badge tone={cfg.tone} size="sm">{cfg.label}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-[var(--color-text-2)] text-xs flex items-center gap-1 tnum font-semibold">
              <Clock size={11} /> {fmtTime(r.reserved_time)}
            </span>
            <span className="text-[var(--color-text-2)] text-xs flex items-center gap-1">
              <Users size={11} /> <span className="tnum">{r.party_size}</span> coperti
            </span>
            {r.table_number && (
              <span className="text-[var(--color-gold)] text-xs font-bold tnum">
                Tavolo {r.table_number}
              </span>
            )}
            {r.customer_phone && (
              <a
                href={`tel:${r.customer_phone}`}
                className="text-[var(--color-text-2)] text-xs flex items-center gap-1 hover:text-[var(--color-gold)] transition tnum"
              >
                <Phone size={11} /> {r.customer_phone}
              </a>
            )}
          </div>
          {r.notes && (
            <p className="text-[var(--color-warn)] text-xs mt-1.5 italic truncate font-semibold">
              ⚠ {r.notes}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isActive && (
            <>
              <button
                onClick={() => onStatus(r.id, 'seated')}
                title="Segna al tavolo"
                className="p-1.5 rounded-lg text-[var(--color-text-3)] hover:text-[var(--color-ok)] hover:bg-[var(--color-ok-soft)] transition"
              >
                <UserCheck size={15} />
              </button>
              <button
                onClick={() => onStatus(r.id, 'no_show')}
                title="No show"
                className="p-1.5 rounded-lg text-[var(--color-text-3)] hover:text-[var(--color-err)] hover:bg-[var(--color-err-soft)] transition"
              >
                <UserX size={15} />
              </button>
            </>
          )}
          <button
            onClick={() => onEdit(r)}
            title="Modifica"
            className="p-1.5 rounded-lg text-[var(--color-text-3)] hover:text-[var(--color-gold)] hover:bg-[var(--color-gold-soft)] transition"
          >
            <Pencil size={14} />
          </button>
          {isActive && (
            <button
              onClick={() => onStatus(r.id, 'cancelled')}
              title="Cancella"
              className="p-1.5 rounded-lg text-[var(--color-text-3)] hover:text-[var(--color-err)] hover:bg-[var(--color-err-soft)] transition"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ReservationsPage() {
  const navigate  = useNavigate()
  const { toast } = useToast()
  const [currentDate, setCurrentDate]   = useState(new Date())
  const [reservations, setReservations] = useState([])
  const [tables, setTables]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [editing, setEditing]           = useState(null)

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
    <div className="min-h-screen flex flex-col">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-20">
        <button
          onClick={() => navigate('/tables')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <CalendarDays size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Prenotazioni
        </h1>

        {/* Date navigator */}
        <div className="flex items-center gap-1 ml-1 bg-[var(--color-surface-2)] rounded-lg border border-[var(--color-border-strong)] overflow-hidden">
          <button
            onClick={() => changeDate(-1)}
            className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] transition p-2"
            aria-label="Giorno precedente"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className={`text-sm font-semibold transition px-3 ${
              isToday ? 'text-[var(--color-gold)]' : 'text-[var(--color-text)] hover:text-[var(--color-gold)]'
            }`}
          >
            {isToday
              ? 'Oggi'
              : currentDate.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
            }
          </button>
          <button
            onClick={() => changeDate(1)}
            className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] transition p-2"
            aria-label="Giorno successivo"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Stats live */}
        <div className="flex items-center gap-2 text-xs ml-2">
          <Badge tone="sea" size="sm">{active.length} conferm.</Badge>
          <Badge tone="ok" size="sm">{seated.length} al tavolo</Badge>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => load(currentDate)}
            disabled={loading}
            className="text-[var(--color-text-2)] hover:text-[var(--color-gold)] transition disabled:opacity-40 p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)]"
            aria-label="Aggiorna"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <Button size="sm" leftIcon={<Plus size={13} />} onClick={() => setEditing('new')}>
            Nuova
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 max-w-3xl mx-auto w-full">
        <p className="text-[var(--color-text-3)] text-xs mb-4 capitalize tnum">{fmtDate(dateStr(currentDate))}</p>

        {loading ? (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento prenotazioni…</span>
          </div>
        ) : reservations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <CalendarDays size={48} className="text-[var(--color-text-3)]/40" />
            <p className="serif text-[var(--color-text-2)] text-base font-semibold">
              Nessuna prenotazione per questo giorno
            </p>
            <Button leftIcon={<Plus size={14} />} onClick={() => setEditing('new')}>
              Aggiungi prenotazione
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {active.length > 0 && (
              <section>
                <h3 className="text-[var(--color-text-2)] text-xs uppercase tracking-wider font-semibold mb-3 flex items-center gap-1.5">
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
                <h3 className="text-[var(--color-text-2)] text-xs uppercase tracking-wider font-semibold mb-3">
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
                <h3 className="text-[var(--color-text-2)] text-xs uppercase tracking-wider font-semibold mb-3">
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

