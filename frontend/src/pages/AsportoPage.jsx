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
  const [cart, setCart] = useState([])   // [{ item, quantity, _key }]

  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)

  // Load categories
  useEffect(() => {
    menuAPI.categories()
      .then(r => {
        setCategories(r.data)
        if (r.data.length > 0) setActiveCategory(r.data[0].id)
      })
      .catch(() => toast({ type: 'error', title: 'Errore caricamento menu' }))
      .finally(() => setLoadingMenu(false))
  }, [])

  // Load items on category change
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

  // Cart helpers
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
      <div className="min-h-screen bg-[#1A1A1A] flex flex-col items-center justify-center gap-4">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
          <CheckCircle2 size={64} className="text-emerald-400" />
        </motion.div>
        <p className="text-[#F5F5DC] text-xl font-semibold">Ordine asporto inviato!</p>
        <p className="text-[#888] text-sm">Ritorno alla mappa…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">

      {/* Header */}
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/tables')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <ShoppingBag size={17} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-semibold text-sm">Asporto</span>
        {itemCount > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[#D4AF37] text-sm">
            <ShoppingCart size={15} /> {itemCount}
          </span>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Customer info + Menu ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Customer info bar */}
          <div className="bg-[#222] border-b border-[#3A3A3A] px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[160px]">
              <User size={14} className="text-[#555] flex-shrink-0" />
              <input
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Nome cliente *"
                className="flex-1 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2.5 py-1.5 text-[#F5F5DC] text-sm placeholder-[#555] outline-none focus:border-[#D4AF37]/60 transition"
              />
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[140px]">
              <Phone size={14} className="text-[#555] flex-shrink-0" />
              <input
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="Telefono"
                type="tel"
                className="flex-1 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2.5 py-1.5 text-[#F5F5DC] text-sm placeholder-[#555] outline-none focus:border-[#D4AF37]/60 transition"
              />
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-[#555] flex-shrink-0" />
              <input
                value={pickupTime}
                onChange={e => setPickupTime(e.target.value)}
                type="time"
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2.5 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition w-28"
              />
              <span className="text-[#555] text-xs">ritiro</span>
            </div>
          </div>

          {/* Category tabs */}
          <div className="bg-[#222] border-b border-[#3A3A3A] px-4 overflow-x-auto">
            <div className="flex gap-0 min-w-max">
              {categories.map(cat => (
                <button key={cat.id} onClick={() => { setActiveCategory(cat.id); setMenuItems([]) }}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                    activeCategory === cat.id
                      ? 'border-[#D4AF37] text-[#D4AF37]'
                      : 'border-transparent text-[#888] hover:text-[#F5F5DC]'
                  }`}>
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Menu items */}
          <div className="flex-1 overflow-y-auto p-4">
            {loadingMenu || loadingItems ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw size={18} className="animate-spin text-[#888]" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {menuItems.map(item => (
                  <motion.button key={item.id} onClick={() => addToCart(item)}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    className="bg-[#2A2A2A] border border-[#3A3A3A] hover:border-[#D4AF37]/50 rounded-xl p-4 text-left transition flex flex-col gap-2">
                    <span className="text-[#F5F5DC] text-sm font-medium leading-tight">{item.name}</span>
                    {item.description && (
                      <span className="text-[#555] text-xs leading-tight line-clamp-2">{item.description}</span>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span className="text-[#D4AF37] font-semibold text-sm">{formatPrice(item.base_price)}</span>
                      <Plus size={14} className="text-[#888]" />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Cart ── */}
        <div className="w-72 bg-[#222] border-l border-[#3A3A3A] flex flex-col">
          <div className="px-4 py-3 border-b border-[#3A3A3A] flex items-center gap-2">
            <ShoppingBag size={15} className="text-[#D4AF37]" />
            <h3 className="text-[#F5F5DC] font-semibold text-sm">Ordine asporto</h3>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <ShoppingCart size={28} className="text-[#333]" />
                <p className="text-[#555] text-xs text-center">Aggiungi piatti dal menu</p>
              </div>
            ) : (
              <AnimatePresence>
                {cart.map(ci => (
                  <motion.div key={ci._key}
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                    className="py-2 border-b border-[#2E2E2E] last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[#F5F5DC] text-xs font-medium leading-tight flex-1">{ci.item.name}</span>
                      <button onClick={() => removeFromCart(ci._key)} className="text-[#555] hover:text-red-400 transition">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQty(ci._key, ci.quantity - 1)}
                          className="w-5 h-5 rounded bg-[#333] flex items-center justify-center text-[#888] hover:text-[#F5F5DC] transition">
                          <Minus size={10} />
                        </button>
                        <span className="text-[#F5F5DC] text-xs w-4 text-center">{ci.quantity}</span>
                        <button onClick={() => updateQty(ci._key, ci.quantity + 1)}
                          className="w-5 h-5 rounded bg-[#333] flex items-center justify-center text-[#888] hover:text-[#F5F5DC] transition">
                          <Plus size={10} />
                        </button>
                      </div>
                      <span className="text-[#D4AF37] text-xs font-medium">
                        {formatPrice(parseFloat(ci.item.base_price) * ci.quantity)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          <div className="px-4 py-4 border-t border-[#3A3A3A] flex flex-col gap-3">
            {customerName.trim() && (
              <div className="bg-[#2A2A2A] rounded-lg px-3 py-2">
                <p className="text-[#F5F5DC] text-xs font-medium">{customerName}</p>
                {customerPhone && <p className="text-[#888] text-xs">{customerPhone}</p>}
                {pickupTime && <p className="text-[#D4AF37] text-xs">Ritiro: {pickupTime}</p>}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[#888] text-sm">Totale</span>
              <span className="text-[#D4AF37] font-bold text-lg">{formatPrice(total)}</span>
            </div>
            <motion.button
              onClick={handleSend}
              disabled={cart.length === 0 || sending}
              whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#c9a42e] transition">
              {sending
                ? <RefreshCw size={16} className="animate-spin" />
                : <><Send size={16} /> Invia Ordine</>
              }
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}
