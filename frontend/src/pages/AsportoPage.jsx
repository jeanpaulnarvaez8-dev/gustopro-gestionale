import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ShoppingBag, Plus, Minus, Trash2, Send, ShoppingCart,
  RefreshCw, CheckCircle2, User, Phone, Clock,
} from 'lucide-react'
import { menuAPI, asportoAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'
import { useToast } from '../context/ToastContext'
import { Card, Badge, Button } from '../components/v2'

export default function AsportoPage() {
  const navigate = useNavigate()
  const { toast } = useToast()

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
        {itemCount > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-[var(--color-gold)] font-semibold tnum text-sm">
            <ShoppingCart size={16} />
            <span>{itemCount}</span>
          </div>
        )}
      </header>

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
    </div>
  )
}
