import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, LogOut, Plus, X, RefreshCw, AlertTriangle, CheckCircle2, Building2, Power } from 'lucide-react'
import { superadminAPI } from '../lib/api'

const SAK_RX = /^[a-f0-9]{32,128}$/i

// ─── Login (inserimento SAK) ────────────────────────────────
function SakGate({ onAuth }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!SAK_RX.test(key.trim())) {
      setError('Formato non valido — atteso esadecimale 32-128 caratteri')
      return
    }
    setLoading(true)
    superadminAPI.setKey(key.trim())
    try {
      // Test con una chiamata: lista tenants
      await superadminAPI.listTenants()
      onAuth()
    } catch (err) {
      superadminAPI.clearKey()
      setError(err.response?.status === 401 ? 'Chiave errata' : 'Errore di rete')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        onSubmit={submit}
        className="w-full max-w-md bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-8 space-y-5">
        <div className="flex items-center gap-3">
          <Shield size={28} className="text-[#D4AF37]" />
          <div>
            <h1 className="text-[#F5F5DC] font-bold text-xl">GustoPro — Admin SaaS</h1>
            <p className="text-[#888] text-xs">Onboarding tenant / gestione ristoranti</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[#888] text-xs font-medium">SUPERADMIN_API_KEY</label>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)}
            autoFocus autoComplete="off"
            placeholder="Incolla la chiave esadecimale"
            className="w-full bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2.5 text-[#F5F5DC] text-sm font-mono placeholder-[#555] focus:border-[#D4AF37] outline-none" />
          {error && (
            <div className="text-red-400 text-xs flex items-center gap-1">
              <AlertTriangle size={12} /> {error}
            </div>
          )}
        </div>

        <button type="submit" disabled={loading || !key.trim()}
          className="w-full py-2.5 bg-[#D4AF37] text-[#1A1A1A] font-bold rounded-lg hover:bg-[#C19E2A] transition disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? 'Verifica…' : 'Entra'}
        </button>

        <p className="text-[#555] text-[10px] leading-relaxed">
          La chiave resta in <code className="text-[#888]">sessionStorage</code> e si cancella alla chiusura
          della scheda. Mai inviata in chiaro: trasmessa solo via header HTTPS al backend.
        </p>
      </motion.form>
    </div>
  )
}

// ─── Modal nuovo tenant ─────────────────────────────────────
function CreateTenantModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    slug: '',
    name: '',
    piva: '',
    address: '',
    adminName: '',
    adminPin: '',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(form.slug)) {
      setError('Slug non valido (a-z, 0-9, trattino, 1-50 char)')
      return
    }
    if (form.name.trim().length < 2) {
      setError('Nome ristorante troppo corto')
      return
    }
    if (!/^\d{4,6}$/.test(form.adminPin)) {
      setError('PIN admin: 4-6 cifre')
      return
    }
    setSaving(true)
    try {
      const { data } = await superadminAPI.createTenant({
        slug: form.slug,
        name: form.name.trim(),
        fiscal_data: { piva: form.piva, address: form.address },
        admin: { name: form.adminName.trim(), pin: form.adminPin },
      })
      setCreated(data)
      onCreated?.()
    } catch (err) {
      setError(err.response?.data?.error || 'Errore creazione tenant')
    } finally {
      setSaving(false)
    }
  }

  if (created) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="bg-[#1A1A1A] border border-emerald-700/40 rounded-2xl p-6 max-w-md w-full space-y-4">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 size={22} />
            <h2 className="font-bold text-lg">Tenant creato</h2>
          </div>
          <div className="bg-[#0a0a0a] border border-[#2A2A2A] rounded-lg p-3 space-y-1 text-xs font-mono">
            <div><span className="text-[#666]">slug:</span> <span className="text-[#F5F5DC]">{created.tenant.slug}</span></div>
            <div><span className="text-[#666]">id:</span> <span className="text-[#F5F5DC]">{created.tenant.id}</span></div>
            <div><span className="text-[#666]">admin:</span> <span className="text-[#F5F5DC]">{created.admin.name}</span></div>
          </div>
          <p className="text-[#888] text-xs">
            L'admin può loggarsi su <code className="text-[#D4AF37]">gestione.gustopro.it</code> col
            PIN scelto, settando l'header <code className="text-[#D4AF37]">X-Tenant-Slug: {created.tenant.slug}</code> oppure col subdominio dedicato (futuro).
          </p>
          <button onClick={onClose}
            className="w-full py-2 bg-[#D4AF37] text-[#1A1A1A] font-bold rounded-lg hover:bg-[#C19E2A] transition">
            Chiudi
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <motion.form initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onSubmit={submit}
        className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-6 max-w-md w-full space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[#F5F5DC] font-bold text-lg flex items-center gap-2">
            <Building2 size={18} className="text-[#D4AF37]" /> Nuovo Ristorante
          </h2>
          <button type="button" onClick={onClose} className="text-[#888] hover:text-[#F5F5DC]"><X size={18}/></button>
        </div>

        <div className="space-y-3 text-sm">
          <Field label="Slug (identificativo URL)" hint="es. bistrot-roma — solo a-z, 0-9, trattini">
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
              placeholder="bistrot-roma" className={inputCls} required />
          </Field>
          <Field label="Nome ristorante">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Bistrot di Roma" className={inputCls} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="P.IVA">
              <input value={form.piva} onChange={(e) => setForm({ ...form, piva: e.target.value })}
                placeholder="00000000000" className={inputCls} />
            </Field>
            <Field label="Indirizzo">
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Via Test 1, Roma" className={inputCls} />
            </Field>
          </div>
          <div className="border-t border-[#2A2A2A] pt-3 mt-2">
            <p className="text-[#888] text-xs font-semibold mb-2">Admin iniziale (creato dentro questo tenant)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome admin">
                <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                  placeholder="Mario Rossi" className={inputCls} required />
              </Field>
              <Field label="PIN (4-6 cifre)">
                <input value={form.adminPin} onChange={(e) => setForm({ ...form, adminPin: e.target.value })}
                  placeholder="0000" maxLength={6} inputMode="numeric"
                  className={inputCls + ' font-mono'} required />
              </Field>
            </div>
          </div>
        </div>

        {error && (
          <div className="text-red-400 text-xs flex items-center gap-1.5 bg-red-950/30 border border-red-900/40 rounded-lg p-2">
            <AlertTriangle size={12} /> {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 bg-[#2A2A2A] text-[#888] rounded-lg hover:text-[#F5F5DC] transition text-sm">
            Annulla
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 py-2 bg-[#D4AF37] text-[#1A1A1A] font-bold rounded-lg hover:bg-[#C19E2A] transition disabled:opacity-50 text-sm">
            {saving ? 'Creazione…' : 'Crea tenant'}
          </button>
        </div>
      </motion.form>
    </div>
  )
}

const inputCls = 'w-full bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2.5 py-1.5 text-[#F5F5DC] text-sm placeholder-[#555] focus:border-[#D4AF37] outline-none'

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1">
      <label className="text-[#888] text-[11px] font-medium">{label}</label>
      {children}
      {hint && <p className="text-[#555] text-[10px]">{hint}</p>}
    </div>
  )
}

// ─── Dashboard tenants ──────────────────────────────────────
function TenantsDashboard({ onLogout }) {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await superadminAPI.listTenants()
      setTenants(data)
    } catch (err) {
      setError(err.response?.status === 401 ? 'Chiave non valida — riconnessione necessaria' : 'Errore caricamento')
      if (err.response?.status === 401) {
        setTimeout(onLogout, 1500)
      }
    } finally {
      setLoading(false)
    }
  }, [onLogout])

  useEffect(() => { load() }, [load])

  const toggleActive = async (t) => {
    try {
      await superadminAPI.updateTenant(t.id, { is_active: !t.is_active })
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Errore aggiornamento')
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#F5F5DC]">
      <header className="bg-[#1A1A1A] border-b border-[#2A2A2A] px-6 py-3 flex items-center gap-4">
        <Shield size={20} className="text-[#D4AF37]" />
        <h1 className="font-bold text-lg">GustoPro · Admin SaaS</h1>
        <span className="text-[#555] text-xs">{tenants.length} tenant</span>
        <div className="ml-auto flex gap-2">
          <button onClick={load} className="p-2 text-[#888] hover:text-[#F5F5DC] transition" title="Ricarica">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] font-bold rounded-lg hover:bg-[#C19E2A] text-xs">
            <Plus size={14} /> Nuovo tenant
          </button>
          <button onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2A2A2A] text-[#888] hover:text-[#F5F5DC] rounded-lg text-xs">
            <LogOut size={14} /> Esci
          </button>
        </div>
      </header>

      <div className="p-6">
        {error && (
          <div className="mb-4 bg-red-950/30 border border-red-900/40 rounded-lg p-3 text-red-300 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#0f0f0f] text-[#888] text-xs">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Slug</th>
                <th className="text-left px-4 py-3 font-medium">Nome</th>
                <th className="text-left px-4 py-3 font-medium">P.IVA</th>
                <th className="text-left px-4 py-3 font-medium">Stato</th>
                <th className="text-left px-4 py-3 font-medium">Creato</th>
                <th className="text-right px-4 py-3 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading && tenants.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-[#555]">Caricamento…</td></tr>
              )}
              {tenants.map(t => (
                <tr key={t.id} className="border-t border-[#2A2A2A] hover:bg-[#1f1f1f]">
                  <td className="px-4 py-3 font-mono text-xs text-[#D4AF37]">{t.slug}</td>
                  <td className="px-4 py-3">{t.name}</td>
                  <td className="px-4 py-3 text-[#888] text-xs font-mono">{t.fiscal_data?.piva || '—'}</td>
                  <td className="px-4 py-3">
                    {t.is_active
                      ? <span className="text-emerald-400 text-xs font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> attivo</span>
                      : <span className="text-[#666] text-xs flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#666]" /> disattivo</span>}
                  </td>
                  <td className="px-4 py-3 text-[#888] text-xs">{new Date(t.created_at).toLocaleDateString('it-IT')}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => toggleActive(t)}
                      className={`text-xs px-2.5 py-1 rounded transition ${
                        t.is_active
                          ? 'text-amber-400 hover:bg-amber-950/40'
                          : 'text-emerald-400 hover:bg-emerald-950/40'
                      }`}>
                      <Power size={12} className="inline mr-1" />
                      {t.is_active ? 'Disattiva' : 'Riattiva'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateTenantModal onClose={() => setShowCreate(false)} onCreated={load} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Page entry ─────────────────────────────────────────────
export default function SuperadminPage() {
  const [authed, setAuthed] = useState(superadminAPI.hasKey())

  const logout = () => {
    superadminAPI.clearKey()
    setAuthed(false)
  }

  if (!authed) return <SakGate onAuth={() => setAuthed(true)} />
  return <TenantsDashboard onLogout={logout} />
}
