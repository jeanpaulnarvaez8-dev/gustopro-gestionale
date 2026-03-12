import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Users, Plus, Pencil, UserX, UserCheck, X, Check, RefreshCw, KeyRound } from 'lucide-react'
import { usersAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

const ROLES = [
  { id: 'admin',   label: 'Admin',    color: 'text-red-400    bg-red-900/20    border-red-500/30' },
  { id: 'manager', label: 'Manager',  color: 'text-amber-400  bg-amber-900/20  border-amber-500/30' },
  { id: 'waiter',  label: 'Cameriere',color: 'text-blue-400   bg-blue-900/20   border-blue-500/30' },
  { id: 'cashier', label: 'Cassiere', color: 'text-purple-400 bg-purple-900/20 border-purple-500/30' },
  { id: 'kitchen', label: 'Cucina',   color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30' },
]

function roleBadge(role) {
  const r = ROLES.find(x => x.id === role)
  return r
    ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${r.color}`}>{r.label}</span>
    : <span className="text-[#555] text-xs">{role}</span>
}

function UserForm({ initial, onClose, onSaved }) {
  const { toast } = useToast()
  const isEdit = !!initial
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    role: initial?.role ?? 'waiter',
    pin: '',
    pinConfirm: '',
  })
  const [saving, setSaving] = useState(false)

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) { toast({ type: 'warning', title: 'Nome obbligatorio' }); return }
    if (!isEdit && !form.pin)  { toast({ type: 'warning', title: 'PIN obbligatorio per nuovo utente' }); return }
    if (form.pin && !/^\d{4,6}$/.test(form.pin)) { toast({ type: 'warning', title: 'PIN deve essere 4-6 cifre' }); return }
    if (form.pin && form.pin !== form.pinConfirm) { toast({ type: 'warning', title: 'I PIN non coincidono' }); return }

    setSaving(true)
    try {
      const payload = { name: form.name, role: form.role }
      if (form.pin) payload.pin = form.pin

      if (isEdit) {
        await usersAPI.update(initial.id, payload)
        toast({ type: 'success', title: `${form.name} aggiornato` })
      } else {
        await usersAPI.create(payload)
        toast({ type: 'success', title: `${form.name} creato` })
      }
      onSaved()
    } catch (err) {
      toast({ type: 'error', title: err.response?.data?.error ?? 'Errore salvataggio' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="bg-[#222] border border-[#3A3A3A] rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3A3A3A]">
          <h3 className="text-[#F5F5DC] font-semibold">
            {isEdit ? `Modifica ${initial.name}` : 'Nuovo utente'}
          </h3>
          <button onClick={onClose} className="text-[#555] hover:text-[#888]"><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#888] text-xs">Nome *</label>
            <input value={form.name} onChange={e => update('name', e.target.value)}
              placeholder="Nome completo"
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]" />
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#888] text-xs">Ruolo *</label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map(r => (
                <button key={r.id} onClick={() => update('role', r.id)}
                  className={`py-1.5 rounded-lg border text-xs font-medium transition ${
                    form.role === r.id ? r.color : 'border-[#3A3A3A] text-[#555] hover:text-[#888]'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* PIN */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#888] text-xs flex items-center gap-1">
              <KeyRound size={11} />
              {isEdit ? 'Nuovo PIN (lascia vuoto per non cambiare)' : 'PIN * (4-6 cifre)'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input type="password" inputMode="numeric"
                value={form.pin}
                onChange={e => update('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••"
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]" />
              <input type="password" inputMode="numeric"
                value={form.pinConfirm}
                onChange={e => update('pinConfirm', e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Conferma"
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]" />
            </div>
          </div>

          <button onClick={submit} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-[#c9a42e] transition mt-1">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <><Check size={14} /> {isEdit ? 'Salva modifiche' : 'Crea utente'}</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function UsersPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // user object or 'new'
  const [filter, setFilter] = useState('all')

  const load = useCallback(() => {
    setLoading(true)
    usersAPI.list().then(r => setUsers(r.data)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const toggleActive = async (user) => {
    try {
      await usersAPI.update(user.id, { is_active: !user.is_active })
      toast({
        type: user.is_active ? 'warning' : 'success',
        title: user.is_active ? `${user.name} disattivato` : `${user.name} riattivato`,
      })
      load()
    } catch {
      toast({ type: 'error', title: 'Errore aggiornamento' })
    }
  }

  const filtered = filter === 'all'
    ? users
    : filter === 'active'
      ? users.filter(u => u.is_active)
      : users.filter(u => !u.is_active)

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/tables')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <Users size={18} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Gestione Staff</span>
        <div className="ml-auto flex items-center gap-3">
          {/* Filter */}
          <div className="flex rounded-lg overflow-hidden border border-[#3A3A3A]">
            {[['all','Tutti'],['active','Attivi'],['inactive','Inattivi']].map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)}
                className={`px-3 py-1.5 text-xs transition ${
                  filter === val ? 'bg-[#3A3A3A] text-[#F5F5DC]' : 'text-[#555] hover:text-[#888]'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:bg-[#c9a42e] transition">
            <Plus size={13} /> Nuovo utente
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw size={18} className="animate-spin text-[#555]" />
          </div>
        ) : (
          <div className="bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
            {filtered.length === 0 ? (
              <p className="text-[#555] text-xs text-center py-12">Nessun utente</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2E2E2E]">
                    <th className="text-left px-5 py-3 text-[#555] text-xs font-medium">Nome</th>
                    <th className="text-left px-4 py-3 text-[#555] text-xs font-medium">Ruolo</th>
                    <th className="text-center px-4 py-3 text-[#555] text-xs font-medium">Stato</th>
                    <th className="text-right px-5 py-3 text-[#555] text-xs font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, i) => (
                    <tr key={u.id}
                      className={`border-b border-[#2A2A2A] last:border-0 ${i % 2 === 0 ? '' : 'bg-[#1E1E1E]'} ${!u.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3">
                        <span className="text-[#F5F5DC] font-medium">{u.name}</span>
                      </td>
                      <td className="px-4 py-3">{roleBadge(u.role)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block w-2 h-2 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-[#555]'}`} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setEditing(u)}
                            className="p-1.5 rounded-lg text-[#555] hover:text-[#D4AF37] hover:bg-[#2A2A2A] transition">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => toggleActive(u)}
                            className={`p-1.5 rounded-lg transition ${
                              u.is_active
                                ? 'text-[#555] hover:text-red-400 hover:bg-[#2A2A2A]'
                                : 'text-[#555] hover:text-emerald-400 hover:bg-[#2A2A2A]'
                            }`}>
                            {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <UserForm
            initial={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); load() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
