import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Wine } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { useToast } from '../context/ToastContext'
import { barAPI } from '../lib/api'
import { playNewOrderBeep, isSoundEnabled } from '../lib/kdsBeep'

/**
 * BarPersistentFAB — pillola flottante in alto a destra che mostra il
 * numero di cocktail/bevande "da fare" in tempo reale.
 *
 * Target user: waiter con sub_role 'bar' o 'bar/caffetteria' (Desirè).
 * Visibile anche se la bartender naviga su /tables, /order/X, etc.
 * Click → torna su /bar.
 *
 * Refresh:
 *  - Iniziale: fetch count al mount
 *  - Socket: ascolta new-order, new-bar-order, item-status-updated, item-served
 *  - Beep + animazione al new-bar-order quando count aumenta
 *
 * NON viene mostrata se gia' su /bar (ridondante).
 */
export default function BarPersistentFAB() {
  const { user } = useAuth()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const [count, setCount] = useState({ pending: 0, cooking: 0, ready: 0, total: 0 })
  const [pulse, setPulse] = useState(false)

  const isBar = user?.role === 'waiter' && (user?.sub_role === 'bar' || user?.sub_role === 'bar/caffetteria')
  const onBarPage = location.pathname.startsWith('/bar')

  const refresh = useCallback(async () => {
    try {
      const { data } = await barAPI.count()
      setCount(prev => {
        // Pulse animation se total aumenta
        if (data.total > prev.total && prev.total >= 0) {
          setPulse(true)
          setTimeout(() => setPulse(false), 1500)
        }
        return data
      })
    } catch { /* silent: token expired ecc */ }
  }, [])

  useEffect(() => {
    if (!isBar) return
    refresh()
  }, [isBar, refresh])

  // Socket: aggiorna count su eventi rilevanti
  useEffect(() => {
    if (!isBar || !socket) return
    const onNew = () => refresh()
    const onBarNew = (data) => {
      refresh()
      // Beep audio se attivato in localStorage (lib/kdsBeep)
      if (isSoundEnabled()) {
        try { playNewOrderBeep() } catch {}
      }
      toast({
        type: 'info',
        title: `🍷 Nuovo ordine bar — Tavolo ${data.tableNumber}`,
        message: `${data.itemCount} drink da preparare`,
        duration: 6000,
      })
    }
    const onUpdate = () => refresh()
    socket.on('new-order', onNew)
    socket.on('new-bar-order', onBarNew)
    socket.on('order-item-added', onNew)
    socket.on('item-status-updated', onUpdate)
    socket.on('item-served', onUpdate)
    return () => {
      socket.off('new-order', onNew)
      socket.off('new-bar-order', onBarNew)
      socket.off('order-item-added', onNew)
      socket.off('item-status-updated', onUpdate)
      socket.off('item-served', onUpdate)
    }
  }, [isBar, socket, refresh, toast])

  if (!isBar || onBarPage) return null
  if (count.total === 0) return null

  return (
    <button
      onClick={() => navigate('/bar')}
      className={`fixed top-3 right-3 z-[80] flex items-center gap-2 px-3 py-2 rounded-full
                  bg-[var(--color-gold)] text-[#13181C] font-bold text-sm shadow-2xl
                  hover:brightness-110 active:scale-95 transition-all
                  ${pulse ? 'animate-pulse ring-4 ring-[var(--color-gold)]/30' : ''}`}
      aria-label="Vai al bar"
      title={`${count.total} drink da preparare: ${count.pending} in attesa, ${count.cooking} in prep, ${count.ready} pronti`}
    >
      <Wine size={16} />
      <span className="tnum">{count.total}</span>
      {count.ready > 0 && (
        <span className="ml-1 inline-flex items-center gap-1 bg-[var(--color-ok)] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
          {count.ready} pronti
        </span>
      )}
    </button>
  )
}
