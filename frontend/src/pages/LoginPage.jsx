import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import PinPad from '../components/ui/PinPad'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handlePin(pin) {
    setLoading(true)
    setError('')
    try {
      const user = await login(pin)
      // Redirect by role
      if (user.role === 'kitchen') {
        navigate('/kds', { replace: true })
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
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col items-center justify-center px-4">
      {/* Logo / Brand */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-10 text-center"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-[#8B0000] flex items-center justify-center">
            <span className="text-[#D4AF37] font-bold text-lg">G</span>
          </div>
          <h1 className="text-3xl font-bold text-[#F5F5DC] tracking-wide">
            Gusto<span className="text-[#D4AF37]">Pro</span>
          </h1>
        </div>
        <p className="text-[#888] text-sm">Inserisci il tuo PIN per accedere</p>
      </motion.div>

      {/* PIN Pad Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-3xl p-8 shadow-2xl"
      >
        <PinPad
          onSubmit={handlePin}
          loading={loading}
          error={error}
          maxLength={4}
        />
      </motion.div>

      {/* Loading indicator */}
      {loading && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 text-[#888] text-sm animate-pulse"
        >
          Accesso in corso...
        </motion.p>
      )}

      <p className="mt-8 text-[#555] text-xs">
        GustoPro Gestionale v1.0
      </p>
    </div>
  )
}
