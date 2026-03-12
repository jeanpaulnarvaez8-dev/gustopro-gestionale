import { useState } from 'react'
import { Delete } from 'lucide-react'
import { motion } from 'framer-motion'

export default function PinPad({ onSubmit, loading, error, maxLength = 4 }) {
  const [pin, setPin] = useState('')

  const handleKey = (digit) => {
    if (pin.length < maxLength) {
      const next = pin + digit
      setPin(next)
      if (next.length === maxLength) {
        onSubmit(next)
        setPin('')
      }
    }
  }

  const handleDelete = () => setPin(p => p.slice(0, -1))

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="flex flex-col items-center gap-6">
      {/* PIN dots */}
      <div className="flex gap-3">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              i < pin.length
                ? 'bg-[#D4AF37] border-[#D4AF37]'
                : 'border-[#3A3A3A] bg-transparent'
            }`}
          />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-red-400 text-sm"
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
