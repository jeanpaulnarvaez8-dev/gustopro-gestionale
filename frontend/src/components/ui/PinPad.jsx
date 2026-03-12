import { useState, useEffect } from 'react'
import { Delete } from 'lucide-react'
import { motion } from 'framer-motion'

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
      {/* PIN dots with shake animation on error */}
      <motion.div
        className="flex gap-3"
        animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.45, ease: 'easeInOut' }}
      >
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              loading
                ? 'bg-[#D4AF37]/40 border-[#D4AF37]/40 animate-pulse'
                : i < pin.length
                  ? 'bg-[#D4AF37] border-[#D4AF37]'
                  : error
                    ? 'border-red-500/60 bg-transparent'
                    : 'border-[#3A3A3A] bg-transparent'
            }`}
          />
        ))}
      </motion.div>

      {/* Error message */}
      {error && (
        <motion.p
          key={error}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-red-400 text-sm text-center"
        >
          {error}
        </motion.p>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k, i) => {
          if (k === '') return <div key={i} />
          if (k === '⌫') {
            return (
              <motion.button
                key="del"
                whileTap={{ scale: 0.92 }}
                onClick={handleDelete}
                disabled={loading}
                className="w-16 h-16 rounded-2xl bg-[#2A2A2A] border border-[#3A3A3A] flex items-center justify-center text-[#D4AF37] hover:bg-[#3A3A3A] active:bg-[#4A4A4A] transition disabled:opacity-40"
              >
                <Delete size={20} />
              </motion.button>
            )
          }
          return (
            <motion.button
              key={k}
              whileTap={{ scale: 0.92 }}
              onClick={() => handleKey(k)}
              disabled={loading}
              className="w-16 h-16 rounded-2xl bg-[#2A2A2A] border border-[#3A3A3A] text-2xl font-semibold text-[#F5F5DC] hover:bg-[#3A3A3A] hover:border-[#D4AF37] active:bg-[#4A4A4A] transition disabled:opacity-40"
            >
              {k}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
