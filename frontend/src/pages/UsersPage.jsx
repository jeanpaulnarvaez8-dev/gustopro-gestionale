import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, Users, Plus, Pencil, UserX, UserCheck, Check, RefreshCw, KeyRound } from 'lucide-react'
import { usersAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { Card, Badge, Button, Modal } from '../components/v2'

const ROLES = [
  { id: 'admin',   label: 'Admin',     tone: 'err'   },
  { id: 'manager', label: 'Manager',   tone: 'warn'  },
  { id: 'waiter',  label: 'Cameriere', tone: 'sea'   },
  { id: 'cashier', label: 'Cassiere',  tone: 'park'  },
  { id: 'kitchen', label: 'Cucina',    tone: 'ok'    },
]

const SUB_ROLES = [
  { id: '',              label: 'Nessuno' },
  { id: 'accompagnatore',label: 'Accompagnatore' },
  { id: 'bevandista',    label: 'Bevandista' },
  { id: 'comi',          label: 'Comì' },
]

const TONE_BTN = {
  err:  'border-[var(--color-err)]/40   text-[var(--color-err)]  bg-[var(--color-err-soft)]',
  warn: 'border-[var(--color-warn)]/40  text-[var(--color-warn)] bg-[var(--color-warn-soft)]',
  sea:  'border-[var(--color-sea)]/40   text-[var(--color-sea)]  bg-[var(--color-sea-soft)]',
  park: 'border-[var(--color-park)]/40  text-[var(--color-park)] bg-[var(--color-park-soft)]',
  ok:   'border-[var(--color-ok)]/40    text-[var(--color-ok)]   bg-[var(--color-ok-soft)]',
}

function UserForm({ initial, onClose, onSaved }) {
  const { toast } = useToast()
  const isEdit = !!initial
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    role: initial?.role ?? 'waiter',
    sub_role: initial?.sub_role ?? '',
    pin: '',
    pinConfirm: '',
  })
  const [saving, setSaving] = useState(false)

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) { toast({ type: 'warning', title: 'Nome obbligatorio' }); return }
    if (!isEdit && !form.pin) { toast({ type: 'warning', title: 'PIN obbligatorio per nuovo utente' }); return }
    if (form.pin && !/^\d{4,6}$/.test(form.pin)) { toast({ type: 'warning', title: 'PIN deve essere 4-6 cifre' }); return }
    if (form.pin && form.pin !== form.pinConfirm) { toast({ type: 'warning', title: 'I PIN non coincidono' }); return }

    setSaving(true)
    try {
      const payload = { name: form.name, role: form.role, sub_role: form.sub_role || null }
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

  const inputCls = 'bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-3 py-2.5 text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-3)] outline-none transition tnum'
  const labelCls = 'text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider flex items-center gap-1'

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isEdit ? `Modifica ${initial.name}` : 'Nuovo utente'}
      footer={
        <Button
          fullWidth
          size="lg"
          loading={saving}
          leftIcon={<Check size={16} />}
          onClick={submit}
        >
          {isEdit ? 'Salva modifiche' : 'Crea utente'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Nome *</label>
          <input
            value={form.name}
            onChange={e => update('name', e.target.value)}
            placeholder="Nome completo"
            className={inputCls.replace(' tnum', '')}
          />
        </div>

        {/* Role */}
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Ruolo *</label>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => update('role', r.id)}
                className={`py-2 rounded-lg border text-xs font-semibold transition ${
                  form.role === r.id
                    ? TONE_BTN[r.tone]
                    : 'border-[var(--color-border-strong)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-role (solo per camerieri) */}
        {form.role === 'waiter' && (
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Sotto-ruolo</label>
            <div className="grid grid-cols-2 gap-2">
              {SUB_ROLES.map(sr => (
                <button
                  key={sr.id}
                  type="button"
                  onClick={() => update('sub_role', sr.id)}
                  className={`py-1.5 rounded-lg border text-xs font-semibold transition ${
                    form.sub_role === sr.id
                      ? 'text-[var(--color-info)] bg-[var(--color-info-soft)] border-[var(--color-info)]/40'
                      : 'border-[var(--color-border-strong)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]'
                  }`}
                >
                  {sr.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PIN */}
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>
            <KeyRound size={11} />
            {isEdit ? 'Nuovo PIN (lascia vuoto per non cambiare)' : 'PIN * (4-6 cifre)'}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="password"
              inputMode="numeric"
              value={form.pin}
              onChange={e => update('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••"
              className={inputCls}
            />
            <input
              type="password"
              inputMode="numeric"
              value={form.pinConfirm}
              onChange={e => update('pinConfirm', e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Conferma"
              className={inputCls}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function UsersPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
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
          Gestione staff
        </h1>

        <div className="ml-auto flex items-center gap-3">
          {/* Filter */}
          <div className="flex rounded-lg overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-surface-2)]">
            {[['all','Tutti'],['active','Attivi'],['inactive','Inattivi']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  filter === val
                    ? 'bg-[var(--color-gold-soft)] text-[var(--color-gold)]'
                    : 'text-[var(--color-text-2)] hover:text-[var(--color-text)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" leftIcon={<Plus size={13} />} onClick={() => setEditing('new')}>
            Nuovo utente
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 max-w-[1200px] mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento staff…</span>
          </div>
        ) : (
          <Card padding="none" className="overflow-hidden">
            {filtered.length === 0 ? (
              <p className="text-[var(--color-text-3)] text-sm text-center py-12">Nessun utente</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] bg-[var(--color-surface-2)]">
                      <th className="text-left px-5 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Nome</th>
                      <th className="text-left px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Ruolo</th>
                      <th className="text-center px-4 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Stato</th>
                      <th className="text-right px-5 py-3 text-[var(--color-text-3)] text-[10px] font-semibold uppercase tracking-wider">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u, i) => {
                      const r = ROLES.find(x => x.id === u.role)
                      return (
                        <tr
                          key={u.id}
                          className={`border-b border-[var(--color-border-soft)] last:border-0 ${
                            i % 2 === 0 ? '' : 'bg-[var(--color-surface-2)]/50'
                          } ${!u.is_active ? 'opacity-50' : ''} hover:bg-[rgba(212,175,55,0.04)] transition`}
                        >
                          <td className="px-5 py-3">
                            <span className="text-[var(--color-text)] font-semibold">{u.name}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {r
                                ? <Badge tone={r.tone} size="sm">{r.label}</Badge>
                                : <span className="text-[var(--color-text-3)] text-xs">{u.role}</span>
                              }
                              {u.sub_role && (
                                <Badge tone="info" size="sm">{u.sub_role}</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                              u.is_active ? 'bg-[var(--color-ok)]' : 'bg-[var(--color-text-3)]'
                            }`} />
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setEditing(u)}
                                title="Modifica"
                                className="p-1.5 rounded-lg text-[var(--color-text-3)] hover:text-[var(--color-gold)] hover:bg-[var(--color-gold-soft)] transition"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => toggleActive(u)}
                                title={u.is_active ? 'Disattiva' : 'Riattiva'}
                                className={`p-1.5 rounded-lg transition ${
                                  u.is_active
                                    ? 'text-[var(--color-text-3)] hover:text-[var(--color-err)] hover:bg-[var(--color-err-soft)]'
                                    : 'text-[var(--color-text-3)] hover:text-[var(--color-ok)] hover:bg-[var(--color-ok-soft)]'
                                }`}
                              >
                                {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
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
