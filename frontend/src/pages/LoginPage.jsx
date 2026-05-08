import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Building, Wifi, WifiOff, Settings2, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import PinPad from '../components/ui/PinPad'
import { Card, Badge, Modal, Button, Input, useToast } from '../components/v2'

const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0')

/**
 * LoginPage — Riva Beach v2 (tryhard polish 2026-05-08).
 *
 * Features:
 * - Branding: logo gradient gold + nome GustoPro in serif
 * - Card v2 elevated con border gold-soft sul body bg mediterraneo
 * - PinPad con haptic feedback mobile (Android), shake on error
 * - Multi-tenant slug picker (default Riva, override con Modal "Cambia locale")
 * - Status network real-time (Online/Offline + sync queue counter)
 * - Toast benvenuto post-login
 * - Animazioni stagger entrata (logo → card → footer)
 * - Redirect by role: kitchen→/kds, admin/manager→/admin-home, else→/tables
 *
 * Tenant resolution lato backend:
 *   1. Header X-Tenant-Slug (settato dall'interceptor se localStorage ha lo slug)
 *   2. Query ?tenant=...
 *   3. Default fallback (Riva)
 */
export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tenantModalOpen, setTenantModalOpen] = useState(false)
  const [tenantSlug, setTenantSlug] = useState(() => localStorage.getItem('gustopro_tenant_slug') || '')
  const [tenantInput, setTenantInput] = useState(tenantSlug)
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  // Reactive online/offline detection (no più static check al mount)
  useEffect(() => {
    const onUp = () => setIsOnline(true)
    const onDown = () => setIsOnline(false)
    window.addEventListener('online', onUp)
    window.addEventListener('offline', onDown)
    return () => {
      window.removeEventListener('online', onUp)
      window.removeEventListener('offline', onDown)
    }
  }, [])

  // Auto-pick slug da query string ?t=bistrot-test (link diretto staff Bistrot)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('t') || params.get('tenant')
    if (t && t !== tenantSlug) {
      setTenantSlug(t)
      setTenantInput(t)
      localStorage.setItem('gustopro_tenant_slug', t)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePin(pin) {
    setLoading(true)
    setError('')
    try {
      const user = await login(pin)
      toast.success(`Benvenuto, ${user.full_name || user.username || user.name}`)
      // Redirect by role
      if (user.role === 'kitchen') {
        navigate('/kds', { replace: true })
      } else if (['admin', 'manager'].includes(user.role)) {
        navigate('/admin-home', { replace: true })
      } else {
        navigate('/tables', { replace: true })
      }
    } catch (err) {
      const msg = err.response?.data?.error || (isOnline ? 'PIN non valido' : 'Sei offline')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function applyTenantSlug() {
    const trimmed = tenantInput.trim().toLowerCase()
    if (trimmed) {
      localStorage.setItem('gustopro_tenant_slug', trimmed)
      setTenantSlug(trimmed)
      toast.gold(`Locale impostato: ${trimmed}`)
    } else {
      localStorage.removeItem('gustopro_tenant_slug')
      setTenantSlug('')
      toast.info('Locale: default (Riva Beach)')
    }
    setTenantModalOpen(false)
  }

  // Brand display name: se slug custom mostralo, altrimenti default Riva
  const brandLine = tenantSlug
    ? tenantSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Riva Beach Salento'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative">
      {/* Brand */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8 text-center"
      >
        <div className="flex items-center justify-center gap-3 mb-3">
          <div
            className="w-12 h-12 rounded-[12px] flex items-center justify-center font-extrabold text-[#13181C] text-[18px] shadow-[0_4px_16px_rgba(212,175,55,0.25)]"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #9c7e1f)' }}
            aria-label="Logo GustoPro"
          >
            GP
          </div>
          <h1 className="serif text-4xl sm:text-5xl font-bold tracking-tight text-[var(--color-text)] leading-none">
            Gusto<span className="text-[var(--color-gold)]">Pro</span>
          </h1>
        </div>
        <button
          type="button"
          onClick={() => { setTenantInput(tenantSlug); setTenantModalOpen(true) }}
          className="flex items-center justify-center gap-2 mx-auto text-[var(--color-text-2)] hover:text-[var(--color-gold)] transition-colors group"
          aria-label="Cambia locale"
        >
          <Building size={14} className="text-[var(--color-gold)]" />
          <span className="text-sm font-medium">{brandLine}</span>
          <Settings2
            size={12}
            className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
          />
        </button>
      </motion.div>

      {/* PIN Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="w-full max-w-[360px]"
      >
        <Card variant="elevated" padding="lg" className="border-[var(--color-gold-ring)]">
          <div className="text-center mb-6">
            <p className="text-[var(--color-text-2)] text-sm">
              Inserisci il tuo PIN per accedere
            </p>
          </div>
          <PinPad
            onSubmit={handlePin}
            loading={loading}
            error={error}
            maxLength={4}
          />
        </Card>

        {/* Loading indicator */}
        {loading && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-5 text-[var(--color-text-2)] text-sm text-center animate-pulse"
          >
            Accesso in corso…
          </motion.p>
        )}
      </motion.div>

      {/* Footer: status + version */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="mt-10 flex flex-col items-center gap-3"
      >
        <Badge
          tone={isOnline ? 'ok' : 'gold'}
          size="sm"
          leftIcon={isOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
          pulse={!isOnline}
        >
          {isOnline ? 'Online' : 'Offline · sync in coda'}
        </Badge>
        <p className="text-[var(--color-text-3)] text-xs tnum">
          GustoPro Gestionale v{APP_VERSION} · 2026
        </p>
      </motion.div>

      {/* Modal: cambia tenant (multi-locale) */}
      <Modal
        open={tenantModalOpen}
        onClose={() => setTenantModalOpen(false)}
        title="Cambia locale"
        description="Lascia vuoto per accedere al locale predefinito (Riva Beach Salento). Per altri locali, inserisci lo slug fornito dal tuo manager."
        size="sm"
        footer={
          <Modal.Actions>
            <Button variant="ghost" onClick={() => setTenantModalOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={applyTenantSlug}
              rightIcon={<ArrowRight size={16} />}
            >
              Applica
            </Button>
          </Modal.Actions>
        }
      >
        <Input
          label="Slug locale"
          placeholder="es. bistrot-test"
          value={tenantInput}
          onChange={(e) => setTenantInput(e.target.value)}
          hint="Solo lettere minuscole, numeri e trattini"
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onKeyDown={(e) => e.key === 'Enter' && applyTenantSlug()}
        />
      </Modal>
    </div>
  )
}
