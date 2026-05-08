import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, Users, Plus, Search, Pencil, Trash2, Check, RefreshCw, Phone, Mail, CalendarDays, Star } from 'lucide-react'
import { customersAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { Card, Button, Modal } from '../components/v2'

// ─── Form (Modal v2) ────────────────────────────────────────────────────────
function CustomerForm({ initial, onClose, onSaved }) {
  const { toast } = useToast()
  const isEdit = !!initial
  const [form, setForm] = useState({
    name:  initial?.name  ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    notes: initial?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) { toast({ type: 'warning', title: 'Nome obbligatorio' }); return }
    setSaving(true)
    try {
      if (isEdit) {
        await customersAPI.update(initial.id, form)
        toast({ type: 'success', title: `${form.name} aggiornato` })
      } else {
        await customersAPI.create(form)
        toast({ type: 'success', title: `${form.name} aggiunto` })
      }
      onSaved()
    } catch (err) {
      toast({ type: 'error', title: err.response?.data?.error ?? 'Errore salvataggio' })
    } finally { setSaving(false) }
  }

  const inputCls = 'bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-3 py-2.5 text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-3)] outline-none transition'
  const labelCls = 'text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider flex items-center gap-1'

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isEdit ? `Modifica ${initial.name}` : 'Nuovo cliente'}
      footer={
        <Button
          fullWidth
          size="lg"
          loading={saving}
          leftIcon={<Check size={16} />}
          onClick={submit}
        >
          {isEdit ? 'Salva modifiche' : 'Aggiungi cliente'}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {[
          { key: 'name',  label: 'Nome *',   placeholder: 'Nome e cognome', icon: null   },
          { key: 'phone', label: 'Telefono', placeholder: '+39 …',          icon: Phone  },
          { key: 'email', label: 'Email',    placeholder: 'email@…',        icon: Mail   },
        ].map(({ key, label, placeholder, icon: Icon }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label className={labelCls}>
              {Icon && <Icon size={11} />} {label}
            </label>
            <input
              value={form[key]}
              onChange={e => up(key, e.target.value)}
              placeholder={placeholder}
              className={key !== 'name' ? `${inputCls} tnum` : inputCls}
            />
          </div>
        ))}

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Note</label>
          <textarea
            value={form.notes}
            onChange={e => up('notes', e.target.value)}
            rows={2}
            placeholder="Allergie, preferenze…"
            className={`${inputCls} resize-none`}
          />
        </div>
      </div>
    </Modal>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState(null)
  const searchTimer = useRef(null)

  const load = useCallback((q = '') => {
    setLoading(true)
    customersAPI.list(q).then(r => setCustomers(r.data)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSearch = (val) => {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(val), 350)
  }

  const handleDelete = async (c) => {
    if (!window.confirm(`Eliminare ${c.name}?`)) return
    try {
      await customersAPI.remove(c.id)
      toast({ type: 'success', title: `${c.name} eliminato` })
      load(search)
    } catch {
      toast({ type: 'error', title: 'Errore eliminazione' })
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
        <Users size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Clienti abituali
        </h1>

        <div className="ml-auto flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)] pointer-events-none" />
            <input
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Cerca nome, tel, email…"
              className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg pl-8 pr-3 py-2 text-[var(--color-text)] text-xs placeholder:text-[var(--color-text-3)] w-52 outline-none transition"
            />
          </div>
          <Button size="sm" leftIcon={<Plus size={13} />} onClick={() => setEditing('new')}>
            Nuovo cliente
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 max-w-[1400px] mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento clienti…</span>
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-[var(--color-text-3)]">
            <Users size={48} className="text-[var(--color-text-3)]/40" />
            <p className="serif text-[var(--color-text-2)] text-base font-bold">
              {search ? 'Nessun risultato' : 'Nessun cliente ancora'}
            </p>
            {!search && (
              <Button leftIcon={<Plus size={14} />} onClick={() => setEditing('new')}>
                Aggiungi primo cliente
              </Button>
            )}
          </div>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-soft)] bg-[var(--color-surface-2)]">
                    <th className="text-left px-5 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Nome</th>
                    <th className="text-left px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Telefono</th>
                    <th className="text-left px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Email</th>
                    <th className="text-center px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Visite</th>
                    <th className="text-left px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Ultima visita</th>
                    <th className="text-right px-5 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c, i) => (
                    <tr
                      key={c.id}
                      className={`border-b border-[var(--color-border-soft)] last:border-0 ${
                        i % 2 === 0 ? '' : 'bg-[var(--color-surface-2)]/50'
                      } hover:bg-[rgba(212,175,55,0.04)] transition`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--color-text)] font-semibold">{c.name}</span>
                          {c.visit_count >= 5 && (
                            <Star size={11} className="text-[var(--color-gold)]" fill="currentColor" />
                          )}
                        </div>
                        {c.notes && (
                          <p className="text-[var(--color-text-3)] text-[10px] mt-0.5 truncate max-w-[200px]">
                            {c.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.phone
                          ? <a href={`tel:${c.phone}`} className="text-[var(--color-text-2)] text-xs hover:text-[var(--color-gold)] flex items-center gap-1 tnum transition">
                              <Phone size={11} /> {c.phone}
                            </a>
                          : <span className="text-[var(--color-text-3)] text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {c.email
                          ? <a href={`mailto:${c.email}`} className="text-[var(--color-text-2)] text-xs hover:text-[var(--color-gold)] flex items-center gap-1 transition">
                              <Mail size={11} /> {c.email}
                            </a>
                          : <span className="text-[var(--color-text-3)] text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-bold tnum ${
                          c.visit_count >= 5 ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-2)]'
                        }`}>
                          {c.visit_count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.last_visit
                          ? <span className="text-[var(--color-text-2)] text-xs flex items-center gap-1 tnum">
                              <CalendarDays size={11} />
                              {new Date(c.last_visit).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                            </span>
                          : <span className="text-[var(--color-text-3)] text-xs">—</span>
                        }
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditing(c)}
                            title="Modifica"
                            className="p-1.5 rounded-lg text-[var(--color-text-3)] hover:text-[var(--color-gold)] hover:bg-[var(--color-gold-soft)] transition"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            title="Elimina"
                            className="p-1.5 rounded-lg text-[var(--color-text-3)] hover:text-[var(--color-err)] hover:bg-[var(--color-err-soft)] transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <CustomerForm
            initial={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(search) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
