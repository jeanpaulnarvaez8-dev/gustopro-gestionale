import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Users, Plus, Search, Pencil, Trash2, X, Check, RefreshCw, Phone, Mail, CalendarDays, Star } from 'lucide-react'
import { customersAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

// ─── Form Modal ─────────────────────────────────────────────

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="bg-[#222] border border-[#3A3A3A] rounded-2xl w-full max-w-sm">

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3A3A3A]">
          <h3 className="text-[#F5F5DC] font-semibold">{isEdit ? `Modifica ${initial.name}` : 'Nuovo cliente'}</h3>
          <button onClick={onClose} className="text-[#555] hover:text-[#888]"><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {[
            { key: 'name',  label: 'Nome *',   placeholder: 'Nome e cognome', icon: null },
            { key: 'phone', label: 'Telefono', placeholder: '+39 …',          icon: Phone },
            { key: 'email', label: 'Email',    placeholder: 'email@…',        icon: Mail  },
          ].map(({ key, label, placeholder, icon: Icon }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label className="text-[#888] text-xs flex items-center gap-1">
                {Icon && <Icon size={11} />} {label}
              </label>
              <input value={form[key]} onChange={e => up(key, e.target.value)}
                placeholder={placeholder}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]" />
            </div>
          ))}

          <div className="flex flex-col gap-1.5">
            <label className="text-[#888] text-xs">Note</label>
            <textarea value={form.notes} onChange={e => up('notes', e.target.value)}
              rows={2} placeholder="Allergie, preferenze…"
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555] resize-none" />
          </div>

          <button onClick={submit} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-[#c9a42e] transition mt-1">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <><Check size={14} /> {isEdit ? 'Salva modifiche' : 'Aggiungi cliente'}</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Page ───────────────────────────────────────────────────

export default function CustomersPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState(null)   // customer obj or 'new'
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
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/tables')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <Users size={18} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Clienti Abituali</span>

        <div className="ml-auto flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555]" />
            <input value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Cerca nome, tel, email…"
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg pl-8 pr-3 py-1.5 text-[#F5F5DC] text-xs placeholder-[#555] w-52" />
          </div>
          <button onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:bg-[#c9a42e] transition">
            <Plus size={13} /> Nuovo cliente
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw size={18} className="animate-spin text-[#555]" />
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <Users size={40} className="text-[#333]" />
            <p className="text-[#555] text-sm">{search ? 'Nessun risultato' : 'Nessun cliente ancora'}</p>
          </div>
        ) : (
          <div className="bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2E2E2E]">
                  <th className="text-left px-5 py-3 text-[#555] text-xs font-medium">Nome</th>
                  <th className="text-left px-4 py-3 text-[#555] text-xs font-medium">Telefono</th>
                  <th className="text-left px-4 py-3 text-[#555] text-xs font-medium">Email</th>
                  <th className="text-center px-4 py-3 text-[#555] text-xs font-medium">Visite</th>
                  <th className="text-left px-4 py-3 text-[#555] text-xs font-medium">Ultima visita</th>
                  <th className="text-right px-5 py-3 text-[#555] text-xs font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.id}
                    className={`border-b border-[#2A2A2A] last:border-0 ${i % 2 === 0 ? '' : 'bg-[#1E1E1E]'}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[#F5F5DC] font-medium">{c.name}</span>
                        {c.visit_count >= 5 && <Star size={11} className="text-[#D4AF37]" fill="#D4AF37" />}
                      </div>
                      {c.notes && <p className="text-[#555] text-[10px] mt-0.5 truncate max-w-[160px]">{c.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {c.phone
                        ? <a href={`tel:${c.phone}`} className="text-[#888] text-xs hover:text-[#D4AF37] flex items-center gap-1">
                            <Phone size={10} /> {c.phone}
                          </a>
                        : <span className="text-[#333] text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {c.email
                        ? <a href={`mailto:${c.email}`} className="text-[#888] text-xs hover:text-[#D4AF37] flex items-center gap-1">
                            <Mail size={10} /> {c.email}
                          </a>
                        : <span className="text-[#333] text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-bold ${c.visit_count >= 5 ? 'text-[#D4AF37]' : 'text-[#888]'}`}>
                        {c.visit_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.last_visit
                        ? <span className="text-[#888] text-xs flex items-center gap-1">
                            <CalendarDays size={10} />
                            {new Date(c.last_visit).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                          </span>
                        : <span className="text-[#333] text-xs">—</span>
                      }
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(c)}
                          className="p-1.5 rounded-lg text-[#555] hover:text-[#D4AF37] hover:bg-[#2A2A2A] transition">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(c)}
                          className="p-1.5 rounded-lg text-[#555] hover:text-red-400 hover:bg-[#2A2A2A] transition">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
