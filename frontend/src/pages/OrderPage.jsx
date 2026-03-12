import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Plus, Minus, Trash2, Send, ShoppingCart, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { menuAPI, ordersAPI, tablesAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'

export default function OrderPage() {
  const { tableId } = useParams()
  const navigate = useNavigate()
  const { items: cartItems, total, itemCount, setTable, addItem, removeItem, updateQuantity, clearCart } = useCart()
  const { toast } = useToast()

  const [table, setTableData] = useState(null)
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  // Load table + categories on mount
  useEffect(() => {
    async function init() {
      try {
        const [tablesRes, catsRes] = await Promise.all([
          tablesAPI.list(),
          menuAPI.categories(),
        ])
        const t = tablesRes.data.find(t => t.id === tableId)
        if (t) {
          setTableData(t)
          setTable(t.id, t.table_number)
        }
        setCategories(catsRes.data)
        if (catsRes.data.length > 0) setActiveCategory(catsRes.data[0].id)
      } catch {
        toast({ type: 'error', title: 'Errore caricamento menu' })
      } finally {
        setLoadingMenu(false)
      }
    }
    init()
  }, [tableId, setTable])

  // Load items when category changes
  const loadItems = useCallback(async (catId) => {
    if (!catId) return
    setLoadingItems(true)
    try {
      const res = await menuAPI.items(catId)
      setMenuItems(res.data)
    } catch {
      setMenuItems([])
    } finally {
      setLoadingItems(false)
    }
  }, [])

  useEffect(() => { loadItems(activeCategory) }, [activeCategory, loadItems])

  const handleSelectCategory = (catId) => {
    setActiveCategory(catId)
    setMenuItems([])
  }

  const handleAddItem = (item) => {
    addItem(item, 1, [], null)
  }

  const handleSend = async () => {
    if (cartItems.length === 0) return
    setSending(true)
    try {
      const payload = {
        table_id: tableId,
        items: cartItems.map(ci => ({
          menu_item_id: ci.item.id,
          quantity: ci.quantity,
          notes: ci.notes || null,
          modifiers: ci.modifiers.map(m => ({ modifier_id: m.id })),
        })),
      }

      if (table?.active_order_id) {
        await ordersAPI.addItems(table.active_order_id, payload.items)
      } else {
        await ordersAPI.create(payload)
        // mark table occupied
        await tablesAPI.setStatus(tableId, 'occupied').catch(() => {})
      }

      clearCart()
      setSent(true)
      setTimeout(() => navigate('/tables'), 1800)
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
        <p className="text-[#F5F5DC] text-xl font-semibold">Ordine inviato!</p>
        <p className="text-[#888] text-sm">Ritorno alla mappa tavoli...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">

      {/* Header */}
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/tables')}
          className="text-[#888] hover:text-[#F5F5DC] transition p-1">
          <ArrowLeft size={20} />
        </button>
        <div className="w-7 h-7 rounded-full bg-[#8B0000] flex items-center justify-center">
          <span className="text-[#D4AF37] font-bold text-xs">G</span>
        </div>
        <div className="flex-1">
          <span className="text-[#F5F5DC] font-semibold text-sm">
            Tavolo {table?.table_number ?? '...'}
          </span>
          {table?.active_order_id && (
            <span className="ml-2 text-xs text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded-full">
              Ordine aperto
            </span>
          )}
        </div>
        {itemCount > 0 && (
          <div className="flex items-center gap-1 text-[#D4AF37] text-sm">
            <ShoppingCart size={16} />
            <span>{itemCount}</span>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Menu */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Category tabs */}
          <div className="bg-[#222] border-b border-[#3A3A3A] px-4 overflow-x-auto">
            <div className="flex gap-0 min-w-max">
              {categories.map(cat => (
                <button key={cat.id} onClick={() => handleSelectCategory(cat.id)}
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

          {/* Menu items grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loadingMenu || loadingItems ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw size={18} className="animate-spin text-[#888]" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {menuItems.map(item => (
                  <motion.button key={item.id} onClick={() => handleAddItem(item)}
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

        {/* RIGHT: Cart */}
        <div className="w-72 bg-[#222] border-l border-[#3A3A3A] flex flex-col">
          <div className="px-4 py-3 border-b border-[#3A3A3A]">
            <h3 className="text-[#F5F5DC] font-semibold text-sm">Ordine</h3>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <ShoppingCart size={28} className="text-[#333]" />
                <p className="text-[#555] text-xs text-center">Aggiungi piatti dal menu</p>
              </div>
            ) : (
              <AnimatePresence>
                {cartItems.map(ci => (
                  <motion.div key={ci._key}
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                    className="py-2 border-b border-[#2E2E2E] last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[#F5F5DC] text-xs font-medium leading-tight flex-1">
                        {ci.item.name}
                      </span>
                      <button onClick={() => removeItem(ci._key)}
                        className="text-[#555] hover:text-red-400 transition flex-shrink-0">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQuantity(ci._key, ci.quantity - 1)}
                          disabled={ci.quantity <= 1}
                          className="w-5 h-5 rounded bg-[#333] flex items-center justify-center text-[#888] hover:text-[#F5F5DC] disabled:opacity-30 transition">
                          <Minus size={10} />
                        </button>
                        <span className="text-[#F5F5DC] text-xs w-4 text-center">{ci.quantity}</span>
                        <button onClick={() => updateQuantity(ci._key, ci.quantity + 1)}
                          className="w-5 h-5 rounded bg-[#333] flex items-center justify-center text-[#888] hover:text-[#F5F5DC] transition">
                          <Plus size={10} />
                        </button>
                      </div>
                      <span className="text-[#D4AF37] text-xs font-medium">
                        {formatPrice(ci.item.base_price * ci.quantity)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Footer: total + send */}
          <div className="px-4 py-4 border-t border-[#3A3A3A] flex flex-col gap-3">

            <div className="flex items-center justify-between">
              <span className="text-[#888] text-sm">Totale</span>
              <span className="text-[#D4AF37] font-bold text-lg">{formatPrice(total)}</span>
            </div>
            <motion.button
              onClick={handleSend}
              disabled={cartItems.length === 0 || sending}
              whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition hover:bg-[#c9a42e]">
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
