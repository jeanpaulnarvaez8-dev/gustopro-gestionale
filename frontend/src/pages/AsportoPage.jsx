import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ShoppingBag, Plus, Minus, Trash2, Send, ShoppingCart,
  RefreshCw, CheckCircle2, User, Phone, Clock, Receipt,
  Printer, Package, XCircle, Banknote, CreditCard, Smartphone, X,
} from 'lucide-react'
import { menuAPI, asportoAPI, adminAPI, printAPI, ordersAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { Card, Badge, Button } from '../components/v2'

export default function AsportoPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const { socket } = useSocket()
  const canManageList = ['admin', 'manager'].includes(user?.role)

  // JP 2026-06-04: lista asporti di oggi (solo admin/manager) — top panel
  // sopra il form di creazione. Include stampa preconto per ciascuno.
  const [openAsporti, setOpenAsporti] = useState([])
  const [printing, setPrinting] = useState({})
  const loadAsporti = useCallback(async () => {
    if (!canManageList) return
    try {
      const { data } = await adminAPI.takeawayList()
      setOpenAsporti(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
  }, [canManageList])
  useEffect(() => { loadAsporti() }, [loadAsporti])
  useEffect(() => {
    if (!canManageList) return
    const id = setInterval(loadAsporti, 15000)
    return () => clearInterval(id)
  }, [canManageList, loadAsporti])

  // JP 2026-06-06: socket real-time per asporti.
  // Senza, due admin che premono RITIRATO sullo stesso ordine generavano 409.
  useEffect(() => {
    if (!canManageList || !socket) return
    const onClosed = (payload) => {
      if (!payload?.orderId) return
      setOpenAsporti(prev => prev.filter(x => x.id !== payload.orderId))
    }
    socket.on('order-completed', onClosed)
    socket.on('order-cancelled', onClosed)
    socket.on('new-order', loadAsporti)
    return () => {
      socket.off('order-completed', onClosed)
      socket.off('order-cancelled', onClosed)
      socket.off('new-order', loadAsporti)
    }
  }, [canManageList, socket, loadAsporti])
  const handlePrintAsporto = async (orderId, customer) => {
    if (printing[orderId]) return
    setPrinting(p => ({ ...p, [orderId]: true }))
    try {
      await printAPI.enqueue('preconto', orderId)
      toast({ type: 'success', title: '🖨 Preconto in stampa', message: `${customer || 'Asporto'} — esce dalla .24` })
    } catch (e) {
      toast({ type: 'error', title: 'Errore stampa', message: e?.response?.data?.error || 'Riprova' })
    } finally {
      setPrinting(p => { const n = { ...p }; delete n[orderId]; return n })
    }
  }
  // JP 2026-06-06: split flow chiusura asporto.
  // releaseModal = { orderId, customer, total, action: 'ritirato'|'no_show' } | null
  // action selezionata via due bottoni distinti sulla card.
  // submit chiama ordersAPI.asportoRitirato / asportoNoShow.
  const [releaseModal, setReleaseModal] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [noShowReason, setNoShowReason] = useState('')
  const [submittingRelease, setSubmittingRelease] = useState(false)

  const openReleaseModal = (orderId, customer, total, action) => {
    setReleaseModal({ orderId, customer, total, action })
    setPaymentMethod('cash')
    setNoShowReason('')
  }
  const closeReleaseModal = () => {
    if (submittingRelease) return
    setReleaseModal(null)
  }
  const handleSubmitRelease = async () => {
    if (!releaseModal || submittingRelease) return
    const { orderId, customer, action } = releaseModal
    setSubmittingRelease(true)
    try {
      if (action === 'ritirato') {
        // JP 2026-06-06: propaga register (stesso pattern di CheckoutPage).
        // Senza, payments/receipts venivano salvati con register=NULL e
        // dayClose non riusciva a riconciliarli al registratore corretto.
        let register = null
        try { register = localStorage.getItem('gustopro_register') || null } catch {}
        await ordersAPI.asportoRitirato(orderId, { payment_method: paymentMethod, register })
        toast({ type: 'success', title: '✅ Ritirato + scontrino', message: `${customer || 'Asporto'} · ${paymentMethod}` })
      } else {
        await ordersAPI.asportoNoShow(orderId, { reason: noShowReason.trim() || null })
        toast({ type: 'warning', title: '⚠ No show registrato', message: customer || 'Asporto' })
      }
      setOpenAsporti(prev => prev.filter(x => x.id !== orderId))
      setReleaseModal(null)
    } catch (e) {
      toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
    } finally {
      setSubmittingRelease(false)
    }
  }

  // Customer info
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [pickupTime, setPickupTime] = useState('')

  // Menu
  const [categories, setCategories]   = useState([])
  const [menuItems, setMenuItems]     = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)

  // Cart
  const [cart, setCart] = useState([])

  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)

  useEffect(() => {
    menuAPI.categories()
      .then(r => {
        setCategories(r.data)
        if (r.data.length > 0) setActiveCategory(r.data[0].id)
      })
      .catch(() => toast({ type: 'error', title: 'Errore caricamento menu' }))
      .finally(() => setLoadingMenu(false))
  }, []) // eslint-disable-line

  const loadItems = useCallback(async (catId) => {
    if (!catId) return
    setLoadingItems(true)
    try {
      const r = await menuAPI.items(catId)
      setMenuItems(r.data)
    } catch {
      setMenuItems([])
    } finally {
      setLoadingItems(false)
    }
  }, [])

  useEffect(() => { loadItems(activeCategory) }, [activeCategory, loadItems])

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id)
      if (existing) return prev.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { item, quantity: 1, _key: `${item.id}-${Date.now()}` }]
    })
  }

  const updateQty = (key, qty) => {
    if (qty < 1) return removeFromCart(key)
    setCart(prev => prev.map(c => c._key === key ? { ...c, quantity: qty } : c))
  }

  const removeFromCart = (key) => setCart(prev => prev.filter(c => c._key !== key))

  const total = cart.reduce((s, c) => s + parseFloat(c.item.base_price) * c.quantity, 0)
  const itemCount = cart.reduce((s, c) => s + c.quantity, 0)

  const handleSend = async () => {
    if (cart.length === 0) {
      toast({ type: 'warning', title: 'Carrello vuoto', message: 'Aggiungi almeno un piatto' })
      return
    }
    if (!customerName.trim()) {
      toast({ type: 'warning', title: 'Nome obbligatorio', message: 'Inserisci il nome del cliente' })
      return
    }
    setSending(true)
    try {
      await asportoAPI.create({
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        pickup_time:    pickupTime || null,
        items: cart.map(c => ({
          menu_item_id: c.item.id,
          quantity: c.quantity,
          notes: null,
          modifiers: [],
        })),
      })
      setSent(true)
      setTimeout(() => navigate('/tables'), 2000)
    } catch {
      toast({ type: 'error', title: 'Errore invio ordine', message: 'Riprova' })
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
          <CheckCircle2 size={72} className="text-[var(--color-ok)]" />
        </motion.div>
        <p className="serif text-[var(--color-text)] text-2xl font-bold">Ordine asporto inviato!</p>
        <p className="text-[var(--color-text-2)] text-sm">Ritorno alla mappa…</p>
      </div>
    )
  }

  const inputCls = 'flex-1 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-2.5 py-2 text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-3)] outline-none transition'

  return (
    <div className="min-h-screen flex flex-col">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-3 sm:px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => navigate('/tables')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <ShoppingBag size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">Asporto</h1>
        {canManageList && openAsporti.length > 0 && (
          <span className="ml-2 px-2 py-0.5 rounded bg-[var(--color-warn)] text-black text-xs font-bold uppercase">
            {openAsporti.length} oggi
          </span>
        )}
        {itemCount > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-[var(--color-gold)] font-semibold tnum text-sm">
            <ShoppingCart size={16} />
            <span>{itemCount}</span>
          </div>
        )}
      </header>

      {/* JP 2026-06-04: pannello "Asporti di oggi" SOLO admin/manager.
          Visibile sopra il form di nuovo asporto, scrollabile orizzontalmente.
          Per ognuno: nome, totale, items, bottone stampa preconto. */}
      {canManageList && openAsporti.length > 0 && (
        <div className="bg-[var(--color-warn-soft)]/30 border-b-2 border-[var(--color-warn)]/40 px-3 py-3 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Package size={14} className="text-[var(--color-warn)]" />
            <span className="text-[var(--color-warn)] text-xs font-bold uppercase tracking-wider">
              Asporti di oggi · {openAsporti.length} · Totale {formatPrice(openAsporti.reduce((s, o) => s + Number(o.total_amount || 0), 0))}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {openAsporti.map(o => (
              <div
                key={o.id}
                className="shrink-0 w-[260px] bg-[var(--color-surface)] border-2 border-[var(--color-warn)]/40 rounded-lg p-3 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[var(--color-text)] font-extrabold text-base truncate">
                      {o.customer_name || '—'}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-3)]">
                      {o.pickup_time && <span>⏱ {String(o.pickup_time).slice(0, 5)}</span>}
                      {o.takeaway_number && <span>#{o.takeaway_number}</span>}
                    </div>
                  </div>
                  <span className="serif text-[var(--color-gold)] font-bold text-base tnum shrink-0">
                    {formatPrice(o.total_amount)}
                  </span>
                </div>
                {Array.isArray(o.items) && (
                  <div className="text-[11px] text-[var(--color-text-2)] line-clamp-2 leading-snug">
                    {o.items.map(it => `${it.quantity}× ${it.name}`).join(' · ')}
                  </div>
                )}
                <button
                  onClick={() => handlePrintAsporto(o.id, o.customer_name)}
                  disabled={printing[o.id]}
                  className="w-full py-2 rounded-md bg-[var(--color-gold)] text-[#13181C] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-50"
                >
                  <Printer size={13} />
                  {printing[o.id] ? '…' : 'Stampa preconto'}
                </button>
                {/* JP 2026-06-07: bottone "Cassa" che apre il checkout
                    completo (sconti, split, voce libera, modifica peso/prezzo).
                    Per asporti complessi quando il quick-flow Ritirato non basta. */}
                <button
                  onClick={() => navigate(`/checkout/${o.id}`)}
                  className="w-full py-2 rounded-md bg-[var(--color-sea)] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition"
                  title="Cassa completa (sconti, split, voce libera)"
                >
                  <Receipt size={13} />
                  Cassa completa
                </button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => openReleaseModal(o.id, o.customer_name, o.total_amount, 'ritirato')}
                    className="py-2 rounded-md bg-[var(--color-ok)] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1 hover:brightness-110 active:scale-[0.98] transition"
                    title="Cliente ritira + paga → scontrino"
                  >
                    <CheckCircle2 size={13} />
                    Ritirato
                  </button>
                  <button
                    onClick={() => openReleaseModal(o.id, o.customer_name, o.total_amount, 'no_show')}
                    className="py-2 rounded-md bg-[var(--color-err)]/80 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1 hover:brightness-110 active:scale-[0.98] transition"
                    title="Cliente non si presenta → cancellato"
                  >
                    <XCircle size={13} />
                    No show
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">

        {/* ── LEFT: Customer info + Menu ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Customer info bar */}
          <div className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <User size={14} className="text-[var(--color-text-3)] flex-shrink-0" />
              <input
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Nome cliente *"
                className={inputCls}
              />
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[160px]">
              <Phone size={14} className="text-[var(--color-text-3)] flex-shrink-0" />
              <input
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="Telefono"
                type="tel"
                className={`${inputCls} tnum`}
              />
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-[var(--color-text-3)] flex-shrink-0" />
              <input
                value={pickupTime}
                onChange={e => setPickupTime(e.target.value)}
                type="time"
                className={`${inputCls} tnum w-32 flex-none`}
              />
              <span className="text-[var(--color-text-3)] text-xs uppercase tracking-wider font-semibold">ritiro</span>
            </div>
          </div>

          {/* Category tabs */}
          <div className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 overflow-x-auto scrollbar-none">
            <div className="flex gap-0 min-w-max">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { setActiveCategory(cat.id); setMenuItems([]) }}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                    activeCategory === cat.id
                      ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                      : 'border-transparent text-[var(--color-text-2)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Menu items */}
          <div className="flex-1 overflow-y-auto p-4">
            {loadingMenu || loadingItems ? (
              <div className="flex items-center justify-center h-40 gap-2 text-[var(--color-text-2)]">
                <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
                <span className="text-sm">Caricamento…</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {menuItems.map(item => (
                  <motion.button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    whileTap={{ scale: 0.96 }}
                    className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] hover:border-[var(--color-gold-ring)] rounded-xl p-4 text-left transition flex flex-col gap-2"
                  >
                    <span className="text-[var(--color-text)] text-sm font-bold leading-tight">{item.name}</span>
                    {item.description && (
                      <span className="text-[var(--color-text-3)] text-xs leading-tight line-clamp-2">
                        {item.description}
                      </span>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span className="text-[var(--color-gold)] font-bold text-sm tnum">
                        {formatPrice(item.base_price)}
                      </span>
                      <Plus size={14} className="text-[var(--color-text-2)]" />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Cart ── */}
        <div className="lg:w-80 bg-[var(--color-surface)] border-t lg:border-t-0 lg:border-l border-[var(--color-border-soft)] flex flex-col">
          <div className="px-4 py-3 border-b border-[var(--color-border-soft)] flex items-center gap-2">
            <ShoppingBag size={16} className="text-[var(--color-gold)]" />
            <h3 className="serif text-[var(--color-text)] font-bold text-base tracking-tight flex-1">Ordine asporto</h3>
            {itemCount > 0 && <Badge tone="gold" size="sm">{itemCount}</Badge>}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 max-h-[40vh] lg:max-h-none">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <ShoppingCart size={32} className="text-[var(--color-text-3)]" />
                <p className="text-[var(--color-text-3)] text-xs text-center">
                  Aggiungi piatti dal menu
                </p>
              </div>
            ) : (
              <AnimatePresence>
                {cart.map(ci => (
                  <motion.div
                    key={ci._key}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="py-2 border-b border-[var(--color-border-soft)] last:border-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[var(--color-text)] text-xs font-semibold leading-tight flex-1">
                        {ci.item.name}
                      </span>
                      <button
                        onClick={() => removeFromCart(ci._key)}
                        className="text-[var(--color-text-3)] hover:text-[var(--color-err)] transition p-0.5"
                        aria-label="Rimuovi"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(ci._key, ci.quantity - 1)}
                          className="w-5 h-5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] flex items-center justify-center text-[var(--color-text-2)] hover:text-[var(--color-text)] transition"
                          aria-label="Diminuisci"
                        >
                          <Minus size={10} />
                        </button>
                        <span className="text-[var(--color-text)] text-xs w-4 text-center font-semibold tnum">
                          {ci.quantity}
                        </span>
                        <button
                          onClick={() => updateQty(ci._key, ci.quantity + 1)}
                          className="w-5 h-5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] flex items-center justify-center text-[var(--color-text-2)] hover:text-[var(--color-text)] transition"
                          aria-label="Aumenta"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                      <span className="text-[var(--color-gold)] text-xs font-bold tnum">
                        {formatPrice(parseFloat(ci.item.base_price) * ci.quantity)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Footer: customer summary + total + send */}
          <div className="px-4 py-4 border-t border-[var(--color-border-soft)] flex flex-col gap-3 bg-[var(--color-surface-2)]">
            {customerName.trim() && (
              <Card variant="outline" padding="sm" className="text-xs">
                <p className="text-[var(--color-text)] font-semibold">{customerName}</p>
                {customerPhone && <p className="text-[var(--color-text-2)] mt-0.5 tnum">{customerPhone}</p>}
                {pickupTime && (
                  <p className="text-[var(--color-gold)] mt-0.5 font-semibold tnum">Ritiro: {pickupTime}</p>
                )}
              </Card>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-2)] text-sm">Totale</span>
              <span className="serif text-[var(--color-gold)] font-bold text-2xl tnum">
                {formatPrice(total)}
              </span>
            </div>
            <Button
              fullWidth
              size="lg"
              loading={sending}
              disabled={cart.length === 0}
              leftIcon={<Send size={16} />}
              onClick={handleSend}
            >
              Invia ordine
            </Button>
          </div>
        </div>
      </div>

      {/* JP 2026-06-06: modal split flow chiusura asporto.
          action='ritirato' → scelta payment_method (cash/card/digital)
          action='no_show'   → motivo opzionale */}
      <AnimatePresence>
        {releaseModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={closeReleaseModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--color-surface)] border-2 border-[var(--color-border-strong)] rounded-2xl w-full max-w-md p-5 flex flex-col gap-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[var(--color-text-3)] text-xs uppercase tracking-wider font-semibold">
                    {releaseModal.action === 'ritirato' ? 'Ritirato + scontrino' : 'No show'}
                  </p>
                  <p className="serif text-[var(--color-text)] font-extrabold text-xl truncate">
                    {releaseModal.customer || 'Asporto'}
                  </p>
                  <p className="text-[var(--color-gold)] font-bold text-sm tnum">
                    {formatPrice(releaseModal.total)}
                  </p>
                </div>
                <button
                  onClick={closeReleaseModal}
                  disabled={submittingRelease}
                  className="text-[var(--color-text-3)] hover:text-[var(--color-text)] p-1 disabled:opacity-50"
                  aria-label="Chiudi"
                >
                  <X size={18} />
                </button>
              </div>

              {releaseModal.action === 'ritirato' ? (
                <>
                  <p className="text-[var(--color-text-2)] text-sm">
                    Metodo di pagamento incassato:
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'cash',    label: 'Contanti', Icon: Banknote },
                      { key: 'card',    label: 'Carta',    Icon: CreditCard },
                      { key: 'digital', label: 'Digitale', Icon: Smartphone },
                    ].map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        onClick={() => setPaymentMethod(key)}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border-2 transition ${
                          paymentMethod === key
                            ? 'border-[var(--color-gold)] bg-[var(--color-gold)]/10 text-[var(--color-gold)]'
                            : 'border-[var(--color-border-strong)] text-[var(--color-text-2)] hover:text-[var(--color-text)]'
                        }`}
                      >
                        <Icon size={20} />
                        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[var(--color-text-3)] text-xs leading-snug">
                    Verra' generato uno scontrino con il metodo selezionato. L'azione e' tracciata in audit log.
                  </p>
                </>
              ) : (
                <>
                  <label className="text-[var(--color-text-2)] text-sm">
                    Motivo (opzionale):
                  </label>
                  <textarea
                    value={noShowReason}
                    onChange={e => setNoShowReason(e.target.value)}
                    placeholder="es. cliente non si e' presentato dopo 30 min, telefono spento..."
                    rows={3}
                    maxLength={500}
                    className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-3)] outline-none resize-none"
                  />
                  <p className="text-[var(--color-text-3)] text-xs leading-snug">
                    L'ordine verra' annullato e tracciato in audit log come no_show. Gli items gia' preparati restano nello storico KDS (per analytics spreco).
                  </p>
                </>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={closeReleaseModal}
                  disabled={submittingRelease}
                  className="flex-1 py-2.5 rounded-lg border border-[var(--color-border-strong)] text-[var(--color-text-2)] font-semibold text-sm hover:bg-[var(--color-surface-2)] disabled:opacity-50 transition"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSubmitRelease}
                  disabled={submittingRelease}
                  className={`flex-1 py-2.5 rounded-lg text-white font-bold text-sm uppercase tracking-wider hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition ${
                    releaseModal.action === 'ritirato'
                      ? 'bg-[var(--color-ok)]'
                      : 'bg-[var(--color-err)]'
                  }`}
                >
                  {submittingRelease ? '…' : releaseModal.action === 'ritirato' ? 'Conferma' : 'Conferma no show'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
