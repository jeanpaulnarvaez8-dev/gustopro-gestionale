import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Plus, Minus, Trash2, Send, ShoppingCart, RefreshCw,
  CheckCircle2, BookOpen, X, ChevronRight,
} from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { menuAPI, ordersAPI, tablesAPI, comboAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'

// ─── Combo Course Selector Modal ─────────────────────────────

function ComboModal({ combo, onClose, onConfirm }) {
  // selections: { courseId: { item_id, item_name, price_supplement } }
  const [selections, setSelections] = useState({})

  const allRequired = combo.courses.every(course => {
    const sel = selections[course.id]
    return sel && Object.keys(sel).length >= (course.min_choices ?? 1)
  })

  const totalSupplement = Object.values(selections).reduce((s, sel) => {
    return s + Object.values(sel).reduce((ss, v) => ss + (v.price_supplement || 0), 0)
  }, 0)

  const toggleItem = (course, item) => {
    const max = course.max_choices ?? 1
    setSelections(prev => {
      const cur = prev[course.id] ?? {}
      if (cur[item.id]) {
        // deselect
        const next = { ...cur }
        delete next[item.id]
        return { ...prev, [course.id]: next }
      }
      if (Object.keys(cur).length >= max) {
        // replace if max=1, otherwise ignore
        if (max === 1) return { ...prev, [course.id]: { [item.id]: item } }
        return prev
      }
      return { ...prev, [course.id]: { ...cur, [item.id]: item } }
    })
  }

  const buildSelectionsPayload = () => {
    const result = {}
    for (const course of combo.courses) {
      const sel = selections[course.id] ?? {}
      const names = Object.values(sel).map(v => v.item_name)
      result[course.name] = names.length === 1 ? names[0] : names
    }
    return result
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
        className="bg-[#222] border border-[#3A3A3A] rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#3A3A3A]">
          <div>
            <h3 className="text-[#F5F5DC] font-bold">{combo.name}</h3>
            <p className="text-[#D4AF37] text-sm">
              {formatPrice(combo.price)}
              {totalSupplement > 0 && (
                <span className="text-[#888] text-xs ml-1">(+{formatPrice(totalSupplement)} supplementi)</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-[#888] mt-0.5"><X size={18} /></button>
        </div>

        {/* Courses */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {combo.courses.map(course => {
            const sel = selections[course.id] ?? {}
            const selectedCount = Object.keys(sel).length
            const max = course.max_choices ?? 1
            const min = course.min_choices ?? 1
            const isFilled = selectedCount >= min

            return (
              <div key={course.id}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#F5F5DC] text-sm font-semibold">{course.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    isFilled
                      ? 'bg-emerald-900/40 text-emerald-400'
                      : 'bg-[#2A2A2A] text-[#555]'
                  }`}>
                    {selectedCount}/{max} {max > 1 ? `(min ${min})` : ''}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {course.items.map(item => {
                    const isSelected = !!sel[item.id]
                    return (
                      <button key={item.id} onClick={() => toggleItem(course, item)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition text-left ${
                          isSelected
                            ? 'border-[#D4AF37]/70 bg-[#D4AF37]/10 text-[#F5F5DC]'
                            : 'border-[#333] bg-[#2A2A2A] text-[#888] hover:border-[#555] hover:text-[#F5F5DC]'
                        }`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
                            isSelected ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-[#444]'
                          }`}>
                            {isSelected && <CheckCircle2 size={10} className="text-[#1A1A1A]" />}
                          </div>
                          <span className="text-sm">{item.item_name}</span>
                        </div>
                        {item.price_supplement > 0 && (
                          <span className="text-[#D4AF37] text-xs">+{formatPrice(item.price_supplement)}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#3A3A3A]">
          <button onClick={() => allRequired && onConfirm(combo, buildSelectionsPayload())}
            disabled={!allRequired}
            className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-30 hover:bg-[#c9a42e] transition">
            <ShoppingCart size={15} /> Aggiungi al carrello · {formatPrice(combo.price + totalSupplement)}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

const COMBO_TAB_ID = '__combos__'

export default function OrderPage() {
  const { tableId } = useParams()
  const navigate = useNavigate()
  const { items: cartItems, total, itemCount, setTable, addItem, addCombo, removeItem, updateQuantity, clearCart } = useCart()
  const { toast } = useToast()

  // Coperti dalla URL (?covers=N)
  const searchParams = new URLSearchParams(window.location.search)
  const initialCovers = parseInt(searchParams.get('covers')) || 1

  const [table, setTableData]         = useState(null)
  const [categories, setCategories]   = useState([])
  const [menuItems, setMenuItems]     = useState([])
  const [combos, setCombos]           = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [sending, setSending]         = useState(false)
  const [sent, setSent]               = useState(false)
  const [comboModal, setComboModal]   = useState(null)
  const [covers, setCovers]           = useState(initialCovers)
  const [weightModal, setWeightModal] = useState(null)
  const [weightInput, setWeightInput] = useState('')
  const [showMobileCart, setShowMobileCart] = useState(false)

  // Load table + categories + combos on mount
  useEffect(() => {
    async function init() {
      try {
        const [tablesRes, catsRes, combosRes] = await Promise.all([
          tablesAPI.list(),
          menuAPI.categories(),
          comboAPI.list(),
        ])
        const t = tablesRes.data.find(t => t.id === tableId)
        if (!t) { navigate('/tables', { replace: true }); return }
        setTableData(t)
        setTable(t.id, t.table_number)
        setCategories(catsRes.data)
        setCombos(combosRes.data.filter(c => c.is_active !== false))
        if (catsRes.data.length > 0) setActiveCategory(catsRes.data[0].id)
      } catch {
        toast({ type: 'error', title: 'Errore caricamento menu' })
      } finally {
        setLoadingMenu(false)
      }
    }
    init()
  }, [tableId, setTable])

  // Load items when category changes (not for combo tab)
  const loadItems = useCallback(async (catId) => {
    if (!catId || catId === COMBO_TAB_ID) return
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
    if (catId !== COMBO_TAB_ID) setMenuItems([])
  }

  const handleComboConfirm = (combo, selections) => {
    addCombo(combo, selections)
    setComboModal(null)
    toast({ type: 'success', title: `${combo.name} aggiunto`, message: formatPrice(combo.price) })
  }

  const handleSend = async () => {
    if (cartItems.length === 0) {
      toast({ type: 'warning', title: 'Carrello vuoto', message: 'Aggiungi almeno un piatto' })
      return
    }
    setSending(true)
    try {
      const regularItems = cartItems
        .filter(ci => !ci.item.is_combo)
        .map(ci => ({
          menu_item_id: ci.item.id,
          quantity: ci.quantity,
          notes: ci.notes || null,
          modifiers: ci.modifiers.map(m => ({ modifier_id: m.id })),
          ...(ci.weight_g ? { weight_g: ci.weight_g } : {}),
        }))

      const comboItems = cartItems
        .filter(ci => ci.item.is_combo)
        .map(ci => ({
          combo_menu_id: ci.combo_id,
          quantity: ci.quantity,
          combo_selections: ci.combo_selections,
        }))

      const items = [...regularItems, ...comboItems]

      if (table?.active_order_id) {
        await ordersAPI.addItems(table.active_order_id, items)
      } else {
        await ordersAPI.create({ table_id: tableId, items, covers })
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
          <span className="ml-2 text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full">
            {covers} pers.
          </span>
          {table?.active_order_id && (
            <span className="ml-1 text-xs text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded-full">
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

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">

        {/* Menu (piena larghezza su mobile) */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Category tabs — scrollabili orizzontalmente */}
          <div className="bg-[#222] border-b border-[#3A3A3A] px-2 sm:px-4 overflow-x-auto shrink-0">
            <div className="flex gap-0 min-w-max">
              {categories.map(cat => (
                <button key={cat.id} onClick={() => handleSelectCategory(cat.id)}
                  className={`px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                    activeCategory === cat.id
                      ? 'border-[#D4AF37] text-[#D4AF37]'
                      : 'border-transparent text-[#888] hover:text-[#F5F5DC]'
                  }`}>
                  {cat.name}
                </button>
              ))}
              {combos.length > 0 && (
                <button onClick={() => handleSelectCategory(COMBO_TAB_ID)}
                  className={`px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                    activeCategory === COMBO_TAB_ID
                      ? 'border-[#D4AF37] text-[#D4AF37]'
                      : 'border-transparent text-[#888] hover:text-[#F5F5DC]'
                  }`}>
                  <BookOpen size={13} /> Menù Fissi
                </button>
              )}
            </div>
          </div>

          {/* Piatti — lista verticale su mobile, griglia su desktop */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {loadingMenu || loadingItems ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw size={18} className="animate-spin text-[#888]" />
              </div>
            ) : activeCategory === COMBO_TAB_ID ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {combos.map(combo => (
                  <motion.button key={combo.id} onClick={() => setComboModal(combo)}
                    whileTap={{ scale: 0.97 }}
                    className="bg-[#2A2A2A] border border-[#3A3A3A] hover:border-[#D4AF37]/50 rounded-xl p-4 text-left transition flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[#F5F5DC] font-semibold text-sm leading-tight">{combo.name}</span>
                      <span className="text-[9px] font-bold bg-[#D4AF37]/20 text-[#D4AF37] px-1.5 py-0.5 rounded-full flex-shrink-0">MENU</span>
                    </div>
                    {combo.description && (
                      <span className="text-[#555] text-xs leading-tight line-clamp-2">{combo.description}</span>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span className="text-[#D4AF37] font-bold text-sm">{formatPrice(combo.price)}</span>
                      <ChevronRight size={14} className="text-[#555]" />
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              /* Piatti: lista su mobile, griglia su desktop */
              <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-3">
                {menuItems.map(item => (
                  <motion.button key={item.id}
                    onClick={() => {
                      if (item.pricing_type === 'per_kg') {
                        setWeightModal(item)
                        setWeightInput('')
                      } else {
                        addItem(item, 1, [], null)
                      }
                    }}
                    whileTap={{ scale: 0.97 }}
                    className="bg-[#2A2A2A] border border-[#3A3A3A] active:border-[#D4AF37]/50 rounded-xl p-3 sm:p-4 text-left transition flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
                    {/* Mobile: riga orizzontale | Desktop: card verticale */}
                    <div className="flex-1 min-w-0">
                      <span className="text-[#F5F5DC] text-sm sm:text-sm font-semibold leading-tight block truncate sm:whitespace-normal">
                        {item.name}
                      </span>
                      {item.description && (
                        <span className="text-[#555] text-xs leading-tight line-clamp-1 sm:line-clamp-2 block mt-0.5">{item.description}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 sm:w-full sm:justify-between sm:mt-auto sm:pt-1">
                      <span className="text-[#D4AF37] font-bold text-sm">
                        {formatPrice(item.base_price)}{item.pricing_type === 'per_kg' ? '/kg' : ''}
                      </span>
                      {item.pricing_type === 'per_kg'
                        ? <span className="text-[9px] text-amber-400 font-medium bg-amber-900/20 px-1.5 py-0.5 rounded">PESO</span>
                        : <div className="w-8 h-8 sm:w-auto sm:h-auto rounded-lg bg-[#D4AF37]/10 flex items-center justify-center sm:bg-transparent">
                            <Plus size={16} className="text-[#D4AF37] sm:text-[#888]" />
                          </div>
                      }
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Carrello: pannello laterale su desktop, barra fissa in basso su mobile */}
        <div className="hidden md:flex w-72 bg-[#222] border-l border-[#3A3A3A] flex-col">
          <div className="px-4 py-3 border-b border-[#3A3A3A]">
            <h3 className="text-[#F5F5DC] font-semibold text-sm">Ordine</h3>
          </div>

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
                      <div className="flex-1 min-w-0">
                        <span className="text-[#F5F5DC] text-xs font-medium leading-tight block truncate">
                          {ci.item.is_combo && (
                            <span className="text-[9px] font-bold bg-[#D4AF37]/20 text-[#D4AF37] px-1 py-0.5 rounded mr-1">M</span>
                          )}
                          {ci.item.name}
                          {ci.weight_g && (
                            <span className="text-[#888] text-[9px] ml-1">{ci.weight_g}g</span>
                          )}
                        </span>
                        {ci.item.is_combo && ci.combo_selections && (
                          <div className="mt-0.5">
                            {Object.entries(ci.combo_selections).map(([course, sel]) => (
                              <p key={course} className="text-[#555] text-[9px] truncate">
                                {course}: {Array.isArray(sel) ? sel.join(', ') : sel}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => removeItem(ci._key)}
                        className="text-[#555] hover:text-red-400 transition flex-shrink-0">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      {!ci.item.is_combo ? (
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
                      ) : (
                        <span className="text-[#555] text-[10px]">×1</span>
                      )}
                      <span className="text-[#D4AF37] text-xs font-medium">
                        {formatPrice((ci.item.computed_price ?? ci.item.base_price) * ci.quantity)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

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

      {/* Carrello mobile — barra fissa in basso */}
      {itemCount > 0 && (
        <div className="md:hidden fixed bottom-14 left-0 right-0 z-[80] bg-[#222] border-t border-[#3A3A3A] safe-area-bottom">
          {showMobileCart ? (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="max-h-[50vh] overflow-y-auto px-4 py-3 space-y-2">
              {cartItems.map(ci => (
                <div key={ci._key} className="flex items-center justify-between py-1.5 border-b border-[#2A2A2A] last:border-0">
                  <div className="flex-1 min-w-0">
                    <span className="text-[#F5F5DC] text-sm block truncate">
                      {ci.quantity > 1 && <span className="text-[#D4AF37]">{ci.quantity}× </span>}
                      {ci.item.name}
                      {ci.weight_g && <span className="text-[#888] text-xs ml-1">{ci.weight_g}g</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[#D4AF37] text-sm font-medium">
                      {formatPrice((ci.item.computed_price ?? ci.item.base_price) * ci.quantity)}
                    </span>
                    <button onClick={() => removeItem(ci._key)} className="text-[#555] active:text-red-400 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          ) : null}
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => setShowMobileCart(v => !v)}
              className="flex items-center gap-2 flex-1">
              <div className="relative">
                <ShoppingCart size={20} className="text-[#D4AF37]" />
                <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-[#D4AF37] rounded-full text-[#1A1A1A] text-[8px] font-bold flex items-center justify-center">
                  {itemCount}
                </span>
              </div>
              <span className="text-[#F5F5DC] font-bold text-lg">{formatPrice(total)}</span>
              <ChevronRight size={16} className={`text-[#888] transition ${showMobileCart ? 'rotate-90' : '-rotate-90'}`} />
            </button>
            <motion.button onClick={handleSend} disabled={sending}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-3 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center gap-2 disabled:opacity-40">
              {sending ? <RefreshCw size={14} className="animate-spin" /> : <><Send size={14} /> Invia</>}
            </motion.button>
          </div>
        </div>
      )}

      {/* Combo Modal */}
      <AnimatePresence>
        {comboModal && (
          <ComboModal
            combo={comboModal}
            onClose={() => setComboModal(null)}
            onConfirm={handleComboConfirm}
          />
        )}
      </AnimatePresence>

      {/* Modale peso per piatti a peso (pesce al kg) */}
      <AnimatePresence>
        {weightModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setWeightModal(null)}>
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              className="bg-[#222] border border-[#3A3A3A] rounded-2xl w-full max-w-xs"
              onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-[#3A3A3A] text-center">
                <h3 className="text-[#F5F5DC] font-bold">{weightModal.name}</h3>
                <p className="text-[#D4AF37] text-sm mt-1">{formatPrice(weightModal.base_price)}/kg</p>
              </div>
              <div className="p-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[#888] text-xs">Peso in grammi</label>
                  <input type="number" inputMode="numeric" value={weightInput}
                    onChange={e => setWeightInput(e.target.value)}
                    placeholder="es. 350"
                    className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-4 py-3 text-[#F5F5DC] text-lg text-center font-bold placeholder-[#555]"
                    autoFocus />
                </div>
                {weightInput && parseInt(weightInput) > 0 && (
                  <div className="text-center">
                    <span className="text-[#888] text-xs">Prezzo: </span>
                    <span className="text-[#D4AF37] font-bold text-lg">
                      {formatPrice((parseFloat(weightModal.base_price) * parseInt(weightInput)) / 1000)}
                    </span>
                    <span className="text-[#555] text-xs ml-1">({parseInt(weightInput)}g)</span>
                  </div>
                )}
                <button
                  onClick={() => {
                    const g = parseInt(weightInput)
                    if (!g || g <= 0) { toast({ type: 'warning', title: 'Inserisci un peso valido' }); return }
                    addItem(weightModal, 1, [], null, g)
                    const price = (parseFloat(weightModal.base_price) * g) / 1000
                    toast({ type: 'success', title: `${weightModal.name} ${g}g`, message: formatPrice(price) })
                    setWeightModal(null)
                  }}
                  disabled={!weightInput || parseInt(weightInput) <= 0}
                  className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm disabled:opacity-30 hover:bg-[#c9a42e] transition">
                  Aggiungi al carrello
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
