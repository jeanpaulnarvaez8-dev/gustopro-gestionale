import { useState, useEffect, useCallback } from 'react'
import {
  Shield, LogOut, Plus, RefreshCw, AlertTriangle, CheckCircle2,
  Building2, Power, KeyRound, ArrowRight,
} from 'lucide-react'
import { superadminAPI } from '../lib/api'
import {
  Button, Card, Input, Modal, Badge, StatusDot, useToast,
} from '../components/v2'

const SAK_RX = /^[a-f0-9]{32,128}$/i

// ─── SAK Gate (login con API key) ────────────────────────────
function SakGate({ onAuth }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!SAK_RX.test(key.trim())) {
      setError('Formato non valido — atteso esadecimale 32-128 caratteri')
      return
    }
    setLoading(true)
    setError(null)
    superadminAPI.setKey(key.trim())
    try {
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
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <form
        onSubmit={submit}
        className="w-full max-w-md"
        style={{ animation: 'slide-up 320ms ease-out' }}
      >
        <Card variant="elevated" padding="lg" className="border-[var(--color-gold-ring)]">
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #D4AF37, #9c7e1f)' }}
            >
              <Shield size={22} className="text-[#13181C]" />
            </div>
            <div>
              <h1 className="serif text-2xl font-bold text-[var(--color-text)] tracking-tight">
                Admin <span className="text-[var(--color-gold)]">SaaS</span>
              </h1>
              <p className="text-[var(--color-text-3)] text-xs">
                Onboarding tenant · gestione ristoranti
              </p>
            </div>
          </div>

          <Input
            label="SUPERADMIN_API_KEY"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Incolla la chiave esadecimale"
            error={error}
            leftIcon={<KeyRound size={16} />}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            inputClassName="font-mono"
          />

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={loading}
            disabled={!key.trim()}
            rightIcon={!loading && <ArrowRight size={16} />}
            className="mt-4"
          >
            {loading ? 'Verifica…' : 'Entra'}
          </Button>

          <p className="text-[var(--color-text-3)] text-[11px] leading-relaxed mt-4">
            La chiave resta in <code className="text-[var(--color-text-2)] font-mono">sessionStorage</code> e
            si cancella alla chiusura della scheda. Mai inviata in chiaro: trasmessa solo via
            header HTTPS al backend.
          </p>
        </Card>
      </form>
    </div>
  )
}

// ─── Modal nuovo tenant ─────────────────────────────────────
function CreateTenantModal({ open, onClose, onCreated }) {
  const toast = useToast()
  const [form, setForm] = useState(initialForm())
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null)

  function initialForm() {
    return { slug: '', name: '', piva: '', address: '', adminName: '', adminPin: '' }
  }

  // Reset state quando il modal si chiude
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setForm(initialForm())
        setError(null)
        setSaving(false)
        setCreated(null)
      }, 250)
      return () => clearTimeout(t)
    }
  }, [open])

  async function submit(e) {
    e?.preventDefault()
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
      toast.success(`Tenant "${data.tenant.slug}" creato`)
      onCreated?.()
    } catch (err) {
      setError(err.response?.data?.error || 'Errore creazione tenant')
    } finally {
      setSaving(false)
    }
  }

  // Stato 1: tenant appena creato → mostra summary read-only
  if (created) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Tenant creato"
        size="md"
        hideClose={false}
        footer={
          <Modal.Actions>
            <Button onClick={onClose} fullWidth>Chiudi</Button>
          </Modal.Actions>
        }
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-full flex items-center justify-center bg-[var(--color-ok-soft)] border border-[var(--color-ok)]/40 flex-shrink-0">
            <CheckCircle2 size={22} className="text-[var(--color-ok)]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--color-text)]">{created.tenant.name}</p>
            <p className="text-xs text-[var(--color-text-3)]">slug · {created.tenant.slug}</p>
          </div>
        </div>

        <Card variant="outline" padding="md" className="font-mono text-xs space-y-1.5">
          <KeyValue label="id" value={created.tenant.id} mono />
          <KeyValue label="slug" value={created.tenant.slug} mono />
          <KeyValue label="admin" value={created.admin.name} />
        </Card>

        <p className="text-[var(--color-text-2)] text-sm leading-relaxed mt-4">
          L'admin può loggarsi su <code className="text-[var(--color-gold)]">gestione.gustopro.it</code> col
          PIN scelto, settando l'header <code className="text-[var(--color-gold)] font-mono text-xs">X-Tenant-Slug: {created.tenant.slug}</code> oppure
          aprendo <code className="text-[var(--color-gold)]">/?t={created.tenant.slug}</code>.
        </p>
      </Modal>
    )
  }

  // Stato 0: form di creazione
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Building2 size={20} className="text-[var(--color-gold)]" />
          Nuovo Ristorante
        </span>
      }
      size="md"
      footer={
        <Modal.Actions>
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button onClick={submit} loading={saving} leftIcon={<Plus size={16} />}>
            Crea tenant
          </Button>
        </Modal.Actions>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Input
          label="Slug (identificativo URL)"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
          placeholder="bistrot-roma"
          hint="Solo a-z, 0-9, trattini · 1-50 caratteri"
          autoCapitalize="none"
          autoComplete="off"
          required
        />
        <Input
          label="Nome ristorante"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Bistrot di Roma"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="P.IVA"
            value={form.piva}
            onChange={(e) => setForm({ ...form, piva: e.target.value })}
            placeholder="00000000000"
            inputMode="numeric"
          />
          <Input
            label="Indirizzo"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Via Test 1, Roma"
          />
        </div>
        <div className="border-t border-[var(--color-border-soft)] pt-3 mt-2">
          <p className="text-[var(--color-text-2)] text-xs font-semibold mb-2">
            Admin iniziale (creato dentro questo tenant)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nome admin"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              placeholder="Mario Rossi"
              required
            />
            <Input
              label="PIN (4-6 cifre)"
              value={form.adminPin}
              onChange={(e) => setForm({ ...form, adminPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              placeholder="0000"
              maxLength={6}
              inputMode="numeric"
              inputClassName="font-mono"
              required
            />
          </div>
        </div>

        {error && (
          <div className="text-[var(--color-err)] text-xs flex items-center gap-1.5 bg-[var(--color-err-soft)] border border-[var(--color-err)]/40 rounded-lg p-2.5">
            <AlertTriangle size={14} /> {error}
          </div>
        )}
      </form>
    </Modal>
  )
}

function KeyValue({ label, value, mono }) {
  return (
    <div className="flex gap-2">
      <span className="text-[var(--color-text-3)] min-w-[44px]">{label}:</span>
      <span className={`text-[var(--color-text)] break-all ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ─── Dashboard tenants ──────────────────────────────────────
function TenantsDashboard({ onLogout }) {
  const toast = useToast()
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
      const isUnauth = err.response?.status === 401
      setError(isUnauth ? 'Chiave non valida — riconnessione necessaria' : 'Errore caricamento')
      if (isUnauth) setTimeout(onLogout, 1500)
    } finally {
      setLoading(false)
    }
  }, [onLogout])

  useEffect(() => { load() }, [load])

  const toggleActive = async (t) => {
    try {
      await superadminAPI.updateTenant(t.id, { is_active: !t.is_active })
      toast.success(`Tenant "${t.slug}" ${!t.is_active ? 'riattivato' : 'disattivato'}`)
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore aggiornamento')
    }
  }

  const activeCount = tenants.filter(t => t.is_active).length

  return (
    <div className="min-h-screen text-[var(--color-text)]">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-6 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Shield size={20} className="text-[var(--color-gold)] flex-shrink-0" />
        <h1 className="serif font-bold text-lg sm:text-xl">
          GustoPro · <span className="text-[var(--color-gold)]">Admin SaaS</span>
        </h1>
        <Badge tone="neutral" size="sm" className="hidden sm:inline-flex">
          {tenants.length} tenant · {activeCount} attivi
        </Badge>
        <div className="ml-auto flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            aria-label="Ricarica"
            className="!p-2 !min-h-0"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setShowCreate(true)}
          >
            Nuovo tenant
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<LogOut size={14} />}
            onClick={onLogout}
          >
            Esci
          </Button>
        </div>
      </header>

      <div className="p-4 sm:p-6">
        {error && (
          <Card variant="outline" padding="md" className="mb-4 border-[var(--color-err)]/40 bg-[var(--color-err-soft)]">
            <div className="text-[var(--color-err)] text-sm flex items-center gap-2">
              <AlertTriangle size={16} /> {error}
            </div>
          </Card>
        )}

        {/* Mobile-first: card list. Desktop: table. */}
        <div className="sm:hidden space-y-2">
          {loading && tenants.length === 0 && (
            <div className="text-center py-8 text-[var(--color-text-3)] flex items-center justify-center gap-2">
              <StatusDot tone="gold" size="sm" pulse /> Caricamento…
            </div>
          )}
          {tenants.map(t => (
            <Card key={t.id} variant="default" padding="md">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-[var(--color-gold)] truncate">{t.slug}</span>
                    <Badge tone={t.is_active ? 'ok' : 'neutral'} size="sm">
                      {t.is_active ? 'Attivo' : 'Off'}
                    </Badge>
                  </div>
                  <p className="font-semibold text-[var(--color-text)] truncate">{t.name}</p>
                  <p className="text-xs text-[var(--color-text-3)] mt-0.5">
                    P.IVA: {t.fiscal_data?.piva || '—'} · creato {new Date(t.created_at).toLocaleDateString('it-IT')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={t.is_active ? 'secondary' : 'success'}
                  leftIcon={<Power size={12} />}
                  onClick={() => toggleActive(t)}
                  className="!min-h-0"
                >
                  {t.is_active ? 'Off' : 'On'}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <Card variant="default" padding="none" className="hidden sm:block overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-[var(--color-text-2)] text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Slug</th>
                <th className="text-left px-4 py-3 font-semibold">Nome</th>
                <th className="text-left px-4 py-3 font-semibold">P.IVA</th>
                <th className="text-left px-4 py-3 font-semibold">Stato</th>
                <th className="text-left px-4 py-3 font-semibold">Creato</th>
                <th className="text-right px-4 py-3 font-semibold">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading && tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-[var(--color-text-3)]">
                    <span className="inline-flex items-center gap-2">
                      <StatusDot tone="gold" size="sm" pulse /> Caricamento…
                    </span>
                  </td>
                </tr>
              )}
              {tenants.map(t => (
                <tr key={t.id} className="border-t border-[var(--color-border-soft)] hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-gold)]">{t.slug}</td>
                  <td className="px-4 py-3">{t.name}</td>
                  <td className="px-4 py-3 text-[var(--color-text-2)] text-xs font-mono">{t.fiscal_data?.piva || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={t.is_active ? 'ok' : 'neutral'} size="sm" leftIcon={<StatusDot tone={t.is_active ? 'ok' : 'neutral'} size="xs" />}>
                      {t.is_active ? 'attivo' : 'disattivo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-2)] text-xs">
                    {new Date(t.created_at).toLocaleDateString('it-IT')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant={t.is_active ? 'secondary' : 'success'}
                      leftIcon={<Power size={12} />}
                      onClick={() => toggleActive(t)}
                      className="!min-h-0"
                    >
                      {t.is_active ? 'Disattiva' : 'Riattiva'}
                    </Button>
                  </td>
                </tr>
              ))}
              {!loading && tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-[var(--color-text-3)]">
                    Nessun tenant. Clicca <b className="text-[var(--color-text)]">Nuovo tenant</b> per iniziare.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <CreateTenantModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={load}
      />
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
