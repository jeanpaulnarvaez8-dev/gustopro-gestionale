import { createContext, useCallback, useContext, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

let _id = 0

const ICONS = {
  success: CheckCircle2,
  error:   XCircle,
  warning: AlertTriangle,
  info:    Info,
}

const COLORS = {
  success: 'border-emerald-500/40 bg-emerald-900/20 text-emerald-400',
  error:   'border-red-500/40    bg-red-900/20    text-red-400',
  warning: 'border-amber-500/40  bg-amber-900/20  text-amber-400',
  info:    'border-blue-500/40   bg-blue-900/20   text-blue-400',
}

function ToastItem({ id, type, title, message, onDismiss }) {
  const Icon = ICONS[type] ?? Info
  const color = COLORS[type] ?? COLORS.info

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0,  scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={`flex items-start gap-3 w-80 border rounded-xl p-3.5 shadow-xl backdrop-blur-sm ${color}`}
    >
      <Icon size={16} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold text-sm leading-snug">{title}</p>}
        {message && <p className="text-xs opacity-80 mt-0.5 leading-snug">{message}</p>}
      </div>
      <button onClick={() => onDismiss(id)}
        className="shrink-0 opacity-50 hover:opacity-100 transition">
        <X size={13} />
      </button>
    </motion.div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback(({ type = 'info', title, message, duration = 4000 }) => {
    const id = ++_id
    setToasts(prev => [...prev, { id, type, title, message }])
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}

      {/* Toast container — bottom right */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem {...t} onDismiss={dismiss} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
