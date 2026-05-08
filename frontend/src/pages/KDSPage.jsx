import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Wifi, WifiOff, RefreshCw, ChefHat, CheckCircle2, Clock,
  LayoutDashboard, Package, LogOut,
} from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { kdsAPI, workflowAPI } from '../lib/api'
import { formatElapsed, elapsedMinutes } from '../lib/utils'
import { Card, Badge } from '../components/v2'

// ─── Status config (tokens Riva) ─────────────────────────────────────────────
// pending=warn (giallo), cooking=terracotta (arancio caldo), ready=ok (verde)
const ITEM_STATUS = {
  pending: {
    label: 'In attesa',
    bg: 'bg-[var(--color-warn-soft)]',
    border: 'border-[var(--color-warn)]/50',
    text: 'text-[var(--color-warn)]',
    next: 'cooking',
    nextLabel: 'Inizia',
    nextBtn: 'bg-[var(--color-terracotta)] hover:brightness-110 text-white',
  },
  cooking: {
    label: 'In preparazione',
    bg: 'bg-[var(--color-terracotta-soft)]',
    border: 'border-[var(--color-terracotta)]/50',
    text: 'text-[var(--color-terracotta)]',
    next: 'ready',
    nextLabel: 'Pronto',
    nextBtn: 'bg-[var(--color-ok)] hover:brightness-110 text-white',
  },
  ready: {
    label: 'Pronto',
    bg: 'bg-[var(--color-ok-soft)]',
    border: 'border-[var(--color-ok)]/50',
    text: 'text-[var(--color-ok)]',
    next: null,
    nextLabel: null,
    nextBtn: null,
  },
}

// Soglie tempo: <10 min ok, 10-20 warn, >20 err
function elapsedTone(minutes) {
  if (minutes < 10) return 'ok'
  if (minutes < 20) return 'warn'
  return 'err'
}

function ElapsedTick({ sentAt }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])
  const mins = elapsedMinutes(sentAt)
  const tone = elapsedTone(mins)
  return (
    <span className={`text-xs flex items-center gap-1 tnum font-semibold ${
      tone === 'ok'   ? 'text-[var(--color-ok)]'   :
      tone === 'warn' ? 'text-[var(--color-warn)]' :
                        'text-[var(--color-err)]'
    }`}>
      <Clock size={11} /> {formatElapsed(sentAt)}
    </span>
  )
}

// Header nav button (riusa pattern)
function NavButton({ icon: Icon, label, onClick, hoverColor = 'gold' }) {
  const HOVER = {
    gold: 'hover:text-[var(--color-gold)]',
    warn: 'hover:text-[var(--color-warn)]',
  }
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-[var(--color-text-2)] ${HOVER[hoverColor]} hover:bg-[rgba(255,255,255,0.04)] transition text-xs px-2 py-1.5 rounded-lg`}
    >
      <Icon size={13} /> {label}
    </button>
  )
}

export default function KDSPage() {
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()
  const { toast } = useToast()
  const { user, logout } = useAuth()
  const [orders, setOrders] = useState([])
  const [crossmatches, setCrossmatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState({})
  const loadedRef = useRef(false)
  const updatingRef = useRef({})

  const loadOrders = useCallback(async () => {
    try {
      const [ordersRes, crossRes] = await Promise.all([
        kdsAPI.pending(),
        workflowAPI.getCrossmatches().catch(() => ({ data: [] })),
      ])
      // DEBUG temporaneo per diagnose React #31 con menu_item_id
      // eslint-disable-next-line no-console
      console.log('[KDS] orders[0]:', ordersRes.data?.[0])
      // eslint-disable-next-line no-console
      console.log('[KDS] orders[0].items[0]:', ordersRes.data?.[0]?.items?.[0])
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : [])
      setCrossmatches(Array.isArray(crossRes.data) ? crossRes.data : [])
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[KDS] loadOrders failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!loadedRef.current) { loadedRef.current = true; loadOrders() }
  }, [loadOrders])

  // Socket real-time updates
  useEffect(() => {
    if (!socket) return

    const onNewOrder = () => loadOrders()
    const onItemAdded = () => loadOrders()

    const onItemUpdated = ({ orderId, itemId, status }) => {
      setOrders(prev => {
        const updated = prev.map(order => {
          if (order.order_id !== orderId) return order
          const newItems = order.items.map(it =>
            it.id === itemId ? { ...it, status } : it
          )
          const active = newItems.filter(it => it.status === 'pending' || it.status === 'cooking')
          if (active.length === 0) return null
          return { ...order, items: newItems }
        })
        return updated.filter(Boolean)
      })
    }

    const onWorkflowChanged = () => loadOrders()

    socket.on('new-order', onNewOrder)
    socket.on('order-item-added', onItemAdded)
    socket.on('item-status-updated', onItemUpdated)
    socket.on('workflow-status-changed', onWorkflowChanged)
    socket.on('item-released-to-production', onWorkflowChanged)

    const onReconnect = () => loadOrders()
    socket.on('connect', onReconnect)

    return () => {
      socket.off('new-order', onNewOrder)
      socket.off('order-item-added', onItemAdded)
      socket.off('item-status-updated', onItemUpdated)
      socket.off('workflow-status-changed', onWorkflowChanged)
      socket.off('item-released-to-production', onWorkflowChanged)
      socket.off('connect', onReconnect)
    }
  }, [socket, loadOrders])

  // Fallback polling 15s
  useEffect(() => {
    const interval = setInterval(() => {
      if (Object.keys(updatingRef.current).length === 0) loadOrders()
    }, 15000)
    return () => clearInterval(interval)
  }, [loadOrders])

  const handleAdvance = async (itemId, nextStatus) => {
    if (!nextStatus) return
    setUpdating(prev => { const n = { ...prev, [itemId]: true }; updatingRef.current = n; return n })

    // Optimistic update
    setOrders(prev => {
      const updated = prev.map(order => {
        const newItems = order.items.map(it => it.id === itemId ? { ...it, status: nextStatus } : it)
        const active = newItems.filter(it => it.status === 'pending' || it.status === 'cooking')
        if (active.length === 0) return null
        return { ...order, items: newItems }
      })
      return updated.filter(Boolean)
    })

    try {
      await kdsAPI.updateItemStatus(itemId, nextStatus)
    } catch {
      toast({ type: 'error', title: 'Errore aggiornamento stato' })
      loadOrders()
    } finally {
      setUpdating(prev => { const n = { ...prev }; delete n[itemId]; updatingRef.current = n; return n })
    }
  }

  const pendingCount = orders.reduce((sum, o) =>
    sum + o.items.filter(i => i.status === 'pending').length, 0)
  const cookingCount = orders.reduce((sum, o) =>
    sum + o.items.filter(i => i.status === 'cooking').length, 0)

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)]">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-20">
        {user?.role !== 'kitchen' && (
          <button
            onClick={() => navigate('/tables')}
            className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
            aria-label="Indietro"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <ChefHat size={20} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          KDS Cucina
        </h1>

        {/* Stats live */}
        <div className="flex items-center gap-2 text-xs ml-2">
          <Badge tone="warn" size="sm">{pendingCount} in attesa</Badge>
          <Badge tone="terracotta" size="sm">{cookingCount} in prep.</Badge>
          <span className="text-[var(--color-text-3)] text-[11px] tnum">
            {orders.length} ordini
          </span>
        </div>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-2">
          <NavButton icon={Clock} label="Attese" hoverColor="warn" onClick={() => navigate('/waiting-monitor')} />
          {['admin', 'manager'].includes(user?.role) && (
            <>
              <NavButton icon={LayoutDashboard} label="Dashboard" onClick={() => navigate('/dashboard')} />
              <NavButton icon={Package} label="Inventario" onClick={() => navigate('/inventory')} />
            </>
          )}
          <button
            onClick={loadOrders}
            className="text-[var(--color-text-2)] hover:text-[var(--color-gold)] transition p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)]"
            aria-label="Ricarica"
          >
            <RefreshCw size={14} />
          </button>
          <Badge
            tone={isConnected ? 'ok' : 'err'}
            size="sm"
            leftIcon={isConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          >
            {isConnected ? 'Live' : 'Offline'}
          </Badge>
          {user?.role === 'kitchen' && (
            <button
              onClick={logout}
              title="Logout"
              className="text-[var(--color-text-3)] hover:text-[var(--color-err)] hover:bg-[rgba(239,68,68,0.08)] rounded-lg p-2 transition"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </header>

      {/* ─── Content ─────────────────────────────────────────── */}
      <div className="flex-1 p-4 overflow-auto">

        {loading && (
          <div className="flex items-center justify-center h-64 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={20} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento ordini cucina…</span>
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <CheckCircle2 size={56} className="text-[var(--color-ok)]/40" />
            <p className="serif text-[var(--color-text-2)] text-lg font-bold">Nessun ordine in coda</p>
            <p className="text-[var(--color-text-3)] text-xs">La cucina è in pari · ottimo lavoro!</p>
          </div>
        )}

        {/* Incroci: piatti uguali su più tavoli — render difensivo per React #31 */}
        {!loading && crossmatches.length > 0 && (
          <Card variant="elevated" padding="md" className="mb-4 border-[var(--color-park)]/40">
            <div className="flex items-center gap-2 mb-3">
              <Badge tone="park" solid>INCROCI</Badge>
              <span className="text-[var(--color-text-3)] text-xs">
                Piatti uguali su più tavoli — ottimizza la produzione
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {crossmatches.map((cm, idx) => {
                // Difensivo: cast tutti i campi a primitive
                const id = String(cm?.menu_item_id ?? `cm-${idx}`)
                const name = String(cm?.item_name ?? 'Piatto')
                const qty = String(cm?.total_quantity ?? 0)
                const tables = Array.isArray(cm?.orders)
                  ? cm.orders.map(o => String(o?.table_number ?? '')).filter(Boolean).join(', ')
                  : ''
                return (
                  <div
                    key={id}
                    className="bg-[var(--color-park-soft)] border border-[var(--color-park)]/30 rounded-lg px-3 py-2 flex items-center gap-2"
                  >
                    <span className="text-[var(--color-text)] text-sm font-bold">{name}</span>
                    <span className="text-[var(--color-park)] text-xs font-bold tnum">
                      {qty}×
                    </span>
                    {tables && (
                      <span className="text-[var(--color-text-3)] text-[10px]">
                        ({tables})
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {orders.map(order => {
                const oldest = order.items.reduce((min, it) =>
                  !min || new Date(it.sent_at) < new Date(min) ? it.sent_at : min, null)
                const mins = elapsedMinutes(oldest)
                const urgency = elapsedTone(mins) // ok | warn | err

                return (
                  <motion.div
                    key={order.order_id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className={`bg-[var(--color-surface)] rounded-xl border-2 flex flex-col overflow-hidden ${
                      urgency === 'err'  ? 'border-[var(--color-err)]/60 animate-[pulse-err_2.4s_ease-in-out_infinite]' :
                      urgency === 'warn' ? 'border-[var(--color-warn)]/40' :
                                            'border-[var(--color-border-soft)]'
                    }`}
                  >

                    {/* Order header (urgency tinted) */}
                    <div className={`px-4 py-3 flex items-center justify-between ${
                      urgency === 'err'  ? 'bg-[var(--color-err-soft)]'  :
                      urgency === 'warn' ? 'bg-[var(--color-warn-soft)]' :
                                            'bg-[var(--color-surface-2)]'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {order.order_type === 'takeaway' ? (
                          <div className="flex flex-col min-w-0">
                            <Badge tone="warn" size="sm">ASPORTO</Badge>
                            {order.order_customer_name && (
                              <span className="text-[var(--color-text-2)] text-xs truncate mt-1">
                                {order.order_customer_name}
                              </span>
                            )}
                            {order.pickup_time && (
                              <span className="text-[var(--color-gold)] text-xs font-semibold tnum">
                                ⏱ {order.pickup_time.slice(0, 5)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <>
                            <span className="serif text-[var(--color-text)] font-bold text-2xl tnum">
                              {order.table_number}
                            </span>
                            <span className="text-[var(--color-text-3)] text-xs">{order.zone_name}</span>
                          </>
                        )}
                      </div>
                      <ElapsedTick sentAt={oldest} />
                    </div>

                    {/* Items: gerarchia visiva active > waiting > delivered */}
                    <div className="flex-1 p-3 flex flex-col gap-1.5">
                      {order.items.map(item => {
                        const cfg = ITEM_STATUS[item.status] ?? ITEM_STATUS.pending
                        const isUpdating = updating[item.id]
                        const ds = item.display_status || 'active'

                        // ── DELIVERED (c) — minimo impatto visivo ──
                        if (ds === 'delivered') {
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 px-2 py-0.5 opacity-30"
                            >
                              <span className="text-[9px] font-mono text-[var(--color-text-3)]">c</span>
                              <span className="text-[var(--color-text-3)] text-[10px] line-through">
                                {item.quantity > 1 ? `×${item.quantity} ` : ''}{item.name}
                              </span>
                            </div>
                          )
                        }

                        // ── WAITING (A) — secondario ──
                        if (ds === 'waiting') {
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 px-2 py-1 rounded border border-[var(--color-border-strong)] bg-[var(--color-surface-2)]/50 opacity-60"
                            >
                              <span className="text-xs font-bold text-[var(--color-warn)] w-4">A</span>
                              <span className="text-[var(--color-text-2)] text-xs">
                                {item.quantity > 1 ? `×${item.quantity} ` : ''}{item.name}
                              </span>
                              {item.course_type && (
                                <span className="ml-auto text-[9px] text-[var(--color-text-3)] italic">
                                  {item.course_type}
                                </span>
                              )}
                            </div>
                          )
                        }

                        // ── ACTIVE — da eseguire ORA (grande, dominante) ──
                        return (
                          <div
                            key={item.id}
                            className={`rounded-lg border p-3 flex flex-col gap-2 ${cfg.bg} ${cfg.border}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[var(--color-text)] font-bold text-base uppercase tracking-wide">
                                    {item.quantity > 1 && (
                                      <span className="text-[var(--color-gold)] mr-1 tnum">×{item.quantity}</span>
                                    )}
                                    {item.name}
                                  </span>
                                  {item.is_combo && (
                                    <Badge tone="gold" size="sm">MENU</Badge>
                                  )}
                                  {item.course_type && item.course_type !== 'altro' && (
                                    <Badge tone="neutral" size="sm">{item.course_type}</Badge>
                                  )}
                                </div>
                                {item.is_combo && item.combo_selections && (
                                  <div className="mt-1 flex flex-col gap-0.5">
                                    {Object.entries(item.combo_selections).map(([course, selection]) => (
                                      <p key={course} className="text-[var(--color-text-2)] text-xs">
                                        <span className="text-[var(--color-text-3)]">{course}:</span>{' '}
                                        {Array.isArray(selection) ? selection.join(', ') : selection}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {!item.is_combo && item.modifiers?.length > 0 && (
                                  <p className="text-[var(--color-text-2)] text-xs mt-0.5">
                                    {item.modifiers.join(', ')}
                                  </p>
                                )}
                                {item.notes && (
                                  <p className="text-[var(--color-warn)] text-xs mt-0.5 italic font-semibold">
                                    ⚠ {item.notes}
                                  </p>
                                )}
                              </div>
                              <span className={`text-xs font-semibold whitespace-nowrap ${cfg.text}`}>
                                {cfg.label}
                              </span>
                            </div>

                            {(() => {
                              // Bevande: skip "Inizia" → diretto a "Pronto"
                              const isBev = item.course_type === 'bevanda'
                              const nextStatus = isBev && cfg.next === 'cooking' ? 'ready' : cfg.next
                              const nextLabel = isBev && cfg.next === 'cooking' ? 'Pronto' : cfg.nextLabel
                              const btnColor = nextStatus === 'ready'
                                ? 'bg-[var(--color-ok)] hover:brightness-110 text-white'
                                : 'bg-[var(--color-terracotta)] hover:brightness-110 text-white'

                              return nextStatus && (
                                <button
                                  onClick={() => handleAdvance(item.id, nextStatus)}
                                  disabled={isUpdating}
                                  className={`w-full py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-1 ${btnColor} disabled:opacity-50 min-h-[40px]`}
                                >
                                  {isUpdating
                                    ? <RefreshCw size={14} className="animate-spin" />
                                    : nextLabel
                                  }
                                </button>
                              )
                            })()}
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
