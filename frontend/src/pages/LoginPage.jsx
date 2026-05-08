import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Building, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import PinPad from '../components/ui/PinPad'
import { Card, Badge, useToast } from '../components/v2'

/**
 * LoginPage — Riva Beach v2.
 * - Branding: logo gradient gold + nome GustoPro in serif
 * - Card v2 con border gold-soft sul body bg mediterraneo
 * - Tagline: tenant + status online/offline
 * - PinPad invariato funzionalmente, solo allineato ai tokens
 */
export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

  async function handlePin(pin) {
    setLoading(true)
    setError('')
    try {
      const user = await login(pin)
      toast.success(`Benvenuto, ${user.full_name || user.username}`)
      // Redirect by role
      if (user.role === 'kitchen') {
        navigate('/kds', { replace: true })
      } else if (['admin', 'manager'].includes(user.role)) {
        navigate('/admin-home', { replace: true })
      } else {
        navigate('/tables', { replace: true })
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Errore di connessione'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
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
          >
            GP
          </div>
          <h1 className="serif text-4xl sm:text-5xl font-bold tracking-tight text-[var(--color-text)] leading-none">
            Gusto<span className="text-[var(--color-gold)]">Pro</span>
          </h1>
        </div>
        <div className="flex items-center justify-center gap-2 text-[var(--color-text-2)]">
          <Building size={14} className="text-[var(--color-gold)]" />
          <span className="text-sm font-medium">Riva Beach Salento</span>
        </div>
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
      <div className="mt-10 flex flex-col items-center gap-3">
        <Badge tone={isOnline ? 'ok' : 'gold'} size="sm" leftIcon={
          isOnline
            ? <Wifi size={11} />
            : <WifiOff size={11} />
        }>
          {isOnline ? 'Online' : 'Offline · sync in coda'}
        </Badge>
        <p className="text-[var(--color-text-3)] text-xs tnum">
          GustoPro Gestionale v1.0 · 2026
        </p>
      </div>
    </div>
  )
}
