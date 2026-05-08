import { useState, useEffect } from 'react'
import { Delete } from 'lucide-react'
import { motion } from 'framer-motion'

/**
 * PinPad — keypad numerico per autenticazione (tokens Riva Beach).
 * Logica funzionale identica alla v1: digit/⌫/auto-submit @ maxLength.
 */
export default function PinPad({ onSubmit, loading, error, maxLength = 4 }) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)

  // Shake dots when a new error arrives
  useEffect(() => {
    if (!error) return
    setShake(true)
    const t = setTimeout(() => setShake(false), 500)
    return () => clearTimeout(t)
  }, [error])

  const handleKey = (digit) => {
    if (loading) return
    if (pin.length < maxLength) {
      const next = pin + digit
      setPin(next)
      if (next.length === maxLength) {
        onSubmit(next)
        setPin('')
      }
    }
  }

  const handleDelete = () => { if (!loading) setPin(p => p.slice(0, -1)) }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="flex flex-col items-center gap-6">
      {/* PIN dots con shake animation on error */}
      <motion.div
        className="flex gap-3"
        animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.45, ease: 'easeInOut' }}
      >
        {Array.from({ length: maxLength }).map((_, i) => {
          const filled = i < pin.length
          let dotClass = 'border-[var(--color-border-strong)] bg-transparent'
          if (loading) {
            dotClass = 'bg-[var(--color-gold)]/40 border-[var(--color-gold)]/40 animate-pulse'
          } else if (filled) {
            dotClass = 'bg-[var(--color-gold)] border-[var(--color-gold)]'
          } else if (error) {
            dotClass = 'border-[var(--color-err)]/60 bg-transparent'
          }
          return (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${dotClass}`}
            />
          )
        })}
      </motion.div>

      {/* Error message */}
      {error && (
        <motion.p
          key={error}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[var(--color-err)] text-sm text-center font-medium"
        >
          {error}
        </motion.p>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k, i) => {
          if (k === '') return <div key={`empty-${i}`} />
          if (k === '⌫') {
            return (
              <motion.button
                key="del"
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={handleDelete}
                disabled={loading}
                aria-label="Cancella"
                className="w-16 h-16 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] flex items-center justify-center text-[var(--color-gold)] hover:bg-[rgba(255,255,255,0.04)] hover:border-[var(--color-gold-ring)] active:bg-[rgba(255,255,255,0.08)] transition disabled:opacity-40"
              >
                <Delete size={20} />
              </motion.button>
            )
          }
          return (
            <motion.button
              key={`digit-${k}`}
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => handleKey(k)}
              disabled={loading}
              aria-label={`Cifra ${k}`}
              className="w-16 h-16 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-2xl font-semibold text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] hover:border-[var(--color-gold-ring)] active:bg-[rgba(255,255,255,0.08)] transition disabled:opacity-40 tnum"
            >
              {k}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
