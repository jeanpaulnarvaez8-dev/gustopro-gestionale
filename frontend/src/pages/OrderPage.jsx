import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Plus, Minus, Trash2, Send, ShoppingCart, RefreshCw,
  CheckCircle2, BookOpen, ChevronRight, Building, Clock, Zap, PackageCheck, UserPlus2, Receipt, Pencil, Search, X,
} from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { menuAPI, ordersAPI, tablesAPI, comboAPI, waitersAPI, workflowAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'
import { AllergenBadges } from '../lib/allergens'
import { Card, Badge, Modal, BottomSheet, Button } from '../components/v2'

// ─── Combo Modal: selezione portate per menù fisso ───────────────────────────
function ComboCourses({ combo, selections, onToggle }) {
  return (
    <div className="flex flex-col gap-4">
      {combo.courses.map(course => {
        const sel = selections[course.id] ?? {}
        const selectedCount = Object.keys(sel).length
        const max = course.max_choices ?? 1
        const min = course.min_choices ?? 1
        const isFilled = selectedCount >= min

        return (
          <div key={course.id}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[var(--color-text)] text-sm font-bold">
                {course.name}
              </span>
              <Badge tone={isFilled ? 'ok' : 'neutral'} size="sm">
                {selectedCount}/{max} {max > 1 ? `(min ${min})` : ''}
              </Badge>
            </div>
            <div className="flex flex-col gap-1.5">
              {course.items.map(item => {
                const isSelected = !!sel[item.id]
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onToggle(course, item)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition text-left ${
                      isSelected
                        ? 'border-[var(--color-gold-ring)] bg-[var(--color-gold-soft)] text-[var(--color-text)]'
                        : 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:border-[var(--color-text-3)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
                        isSelected ? 'border-[var(--color-gold)] bg-[var(--color-gold)]' : 'border-[var(--color-text-3)]'
                      }`}>
                        {isSelected && <CheckCircle2 size={10} className="text-[#13181C]" />}
                      </div>
                      <span className="text-sm">{item.item_name}</span>
                    </div>
                    {item.price_supplement > 0 && (
                      <span className="text-[var(--color-gold)] text-xs tnum font-semibold">
                        +{formatPrice(item.price_supplement)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ComboModalV2({ combo, onClose, onConfirm }) {
  const [selections, setSelections] = useState({})
  if (!combo) return null

  const allRequired = combo.courses.every(course => {
    const sel = selections[course.id]
    return sel && Object.keys(sel).length >= (course.min_choices ?? 1)
  })

  const totalSupplement = Object.values(selections).reduce((s, sel) =>
    s + Object.values(sel).reduce((ss, v) => ss + (v.price_supplement || 0), 0), 0)

  const toggleItem = (course, item) => {
    const max = course.max_choices ?? 1
    setSelections(prev => {
      const cur = prev[course.id] ?? {}
      if (cur[item.id]) {
        const next = { ...cur }
        delete next[item.id]
        return { ...prev, [course.id]: next }
      }
      if (Object.keys(cur).length >= max) {
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
    <Modal
      open={!!combo}
      onClose={onClose}
      size="md"
      title={combo.name}
      description={
        <span>
          <span className="text-[var(--color-gold)] font-semibold tnum">{formatPrice(combo.price)}</span>
          {totalSupplement > 0 && (
            <span className="text-[var(--color-text-3)] text-xs ml-2">
              (+{formatPrice(totalSupplement)} supplementi)
            </span>
          )}
        </span>
      }
      footer={
        <Button
          fullWidth
          size="lg"
          leftIcon={<ShoppingCart size={16} />}
          disabled={!allRequired}
          onClick={() => onConfirm(combo, buildSelectionsPayload())}
        >
          Aggiungi al carrello · {formatPrice(combo.price + totalSupplement)}
        </Button>
      }
    >
      <ComboCourses combo={combo} selections={selections} onToggle={toggleItem} />
    </Modal>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
const COMBO_TAB_ID = '__combos__'

export default function OrderPage() {
  const { tableId } = useParams()
  const navigate = useNavigate()
  const {
    items: cartItems, total, itemCount, setTable, addItem, addCombo,
    removeItem, updateQuantity, setWorkflowStatus, setNotes, setFireAtMinutes, clearCart,
  } = useCart()
  const { toast } = useToast()
  const { user: authUser } = useAuth()

  // Coperti dalla URL (?covers=N)
  const searchParams = new URLSearchParams(window.location.search)
  const initialCovers = parseInt(searchParams.get('covers'), 10) || 1
  // JP 2026-06-01: incroci tavoli — ?cross=id1,id2,id3 → ogni item del
  // carrello viene replicato anche sui tavoli incroci (ciascuno mantiene
  // il proprio conto). I tavoli incroci devono gia' avere un ordine
  // attivo (creato in TableMapPage.confirmCrossTables).
  const crossTableIds = (searchParams.get('cross') || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const [crossOrders, setCrossOrders] = useState([]) // array di {tableId,orderId,tableNumber}

  const [table, setTableData]         = useState(null)
  const [categories, setCategories]   = useState([])
  const [menuItems, setMenuItems]     = useState([])
  // JP 2026-06-04: ricerca piatti su tutto il menu. Lazy: carica al
  // primo focus/keystroke. searchResults != null → render grid filtrata
  // invece della categoria attiva.
  const [searchQuery, setSearchQuery] = useState('')
  const [allMenuItems, setAllMenuItems] = useState([])
  const [allItemsLoaded, setAllItemsLoaded] = useState(false)
  const loadAllItemsLazy = useCallback(async () => {
    if (allItemsLoaded) return
    try {
      const r = await menuAPI.allItems()
      setAllMenuItems(Array.isArray(r.data) ? r.data : [])
      setAllItemsLoaded(true)
    } catch { /* silent */ }
  }, [allItemsLoaded])
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null
    return allMenuItems.filter(it =>
      it.is_available !== false &&
      ((it.name || '').toLowerCase().includes(q) || (it.description || '').toLowerCase().includes(q))
    )
  }, [searchQuery, allMenuItems])
  const [combos, setCombos]           = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [sending, setSending]         = useState(false)
  const [sent, setSent]               = useState(false)
  const [comboModal, setComboModal]   = useState(null)
  const [covers]                      = useState(initialCovers)
  const [weightSheet, setWeightSheet] = useState(null)
  // Modifica piatto: nota tipo "senza cipolla". noteFor = _key item del carrello.
  const [noteFor, setNoteFor] = useState(null)
  const [noteText, setNoteText] = useState('')
  const noteItem = cartItems.find(ci => ci._key === noteFor) || null
  const openNote = (ci) => { setNoteFor(ci._key); setNoteText(ci.notes || '') }
  const QUICK_NOTES = ['Senza cipolla', 'Senza aglio', 'Senza glutine', 'Senza lattosio', 'No piccante', 'Ben cotto', 'Al sangue', 'Senza sale']
  // "Già al tavolo": cosa è stato già ordinato (se il tavolo ha un ordine aperto).
  const [existingItems, setExistingItems] = useState([])
  // JP 2026-06-03: refresh dei piatti gia' nel tavolo quando arriva un evento
  // di workflow change (es. il 7500 fa INIZIA TAVOLO). Senza questo, il
  // cameriere continua a vedere il piatto come waiting e clicca "Manda"
  // facendo 400 "stato gia' impostato".
  const { socket } = useSocket()
  const loadExisting = useCallback(async (orderId) => {
    if (!orderId) return
    try {
      const r = await ordersAPI.get(orderId)
      setExistingItems((r.data.items || []).filter(i => i.status !== 'cancelled'))
    } catch { /* silent */ }
  }, [])
  const [showExisting, setShowExisting] = useState(true)
  const canRemove = ['admin', 'manager', 'cashier'].includes(authUser?.role)
  const canFire = ['waiter', 'manager', 'admin'].includes(authUser?.role)
  // Aggrega visivamente le voci uguali nel pannello "Già al tavolo":
  // se al tavolo c'e' x1 Impepata di Cozze e ne arriva un'altra uguale,
  // mostriamo x2 invece di due righe separate. Aggreghiamo per
  // (menu_item_id | combo_id | custom_name) + workflow_status + status
  // + notes + modifiers + peso. Le azioni (manda in cucina / togli)
  // agiscono sul "primo" item del gruppo, cosi' un trash decrementa
  // la x di uno.
  const existingGroups = useMemo(() => {
    const groups = []
    const index = new Map()
    for (const it of existingItems) {
      const refKey = it.menu_item_id
        ? `m:${it.menu_item_id}`
        : it.combo_id
          ? `b:${it.combo_id}`
          : `c:${it.custom_name || it.item_name || ''}`
      const modKey = Array.isArray(it.modifiers) && it.modifiers.length > 0
        ? JSON.stringify(it.modifiers.map(m => m.modifier_id || m.id).sort())
        : ''
      const weightKey = it.weight_g ? `w${it.weight_g}` : ''
      const noteKey = it.notes ? `n:${it.notes}` : ''
      const key = `${refKey}|${it.workflow_status || ''}|${it.status || ''}|${noteKey}|${modKey}|${weightKey}`
      let g = index.get(key)
      if (!g) {
        g = { key, items: [], qty: 0, sample: it }
        index.set(key, g)
        groups.push(g)
      }
      g.items.push(it)
      g.qty += Number(it.quantity || 0)
    }
    return groups
  }, [existingItems])
  // Manda in cucina TUTTI gli item waiting di un gruppo (azione su gruppo).
  const fireGroup = async (group) => {
    const waitingItems = group.items.filter(x => x.workflow_status === 'waiting')
    for (const it of waitingItems) {
      try {
        await workflowAPI.changeStatus(it.id, 'production')
        setExistingItems(prev => prev.map(x => x.id === it.id ? { ...x, workflow_status: 'production' } : x))
      } catch (e) {
        toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
        return
      }
    }
    toast({ type: 'success', title: 'Mandato in cucina', message: `${group.sample.item_name} × ${group.qty}` })
  }
  // Decrementa la quantita' del gruppo: rimuove l'ULTIMO item (cosi' x2 -> x1).
  const removeOneFromGroup = async (group) => {
    if (!table?.active_order_id) return
    const target = group.items[group.items.length - 1]
    if (!target) return
    const remainingAfter = group.qty - Number(target.quantity || 1)
    const promptMsg = group.items.length > 1
      ? `Togliere 1 di "${group.sample.item_name}"? Restano ${remainingAfter}.`
      : `Togliere "${group.sample.item_name}" dal tavolo?`
    if (!window.confirm(promptMsg)) return
    let override
    if (!['admin', 'manager'].includes(authUser?.role)) {
      const pin = window.prompt('PIN del responsabile per togliere il piatto:')
      if (!pin) return
      override = { pin, reason: 'Rimozione dal tavolo' }
    }
    try {
      await ordersAPI.cancelItem(table.active_order_id, target.id, override)
      setExistingItems(prev => prev.filter(x => x.id !== target.id))
      toast({ type: 'success', title: 'Piatto tolto', message: group.sample.item_name })
    } catch (e) {
      toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
    }
  }
  const [weightInput, setWeightInput] = useState('')
  const [showMobileCart, setShowMobileCart] = useState(false)
  // "Codice 32" — modal delega ordine ad altro cameriere
  const [transferOpen, setTransferOpen] = useState(false)
  const [waiters, setWaiters] = useState([])
  const [transferTo, setTransferTo] = useState('')
  const [transferring, setTransferring] = useState(false)

  // Acqua + pane reminder: SOP Riva chiede di portarli SUBITO all'apertura.
  // Banner visivo dismissibile, persistito per tavolo in localStorage cosi'
  // non riappare ad ogni nav back. Se l'ordine e' gia' aperto (active_order_id)
  // si assume che il cameriere abbia gia' gestito acqua/pane.
  const wbKey = tableId ? `gustopro_wb_${tableId}` : null
  const [wbDismissed, setWbDismissed] = useState(() => {
    try { return wbKey ? localStorage.getItem(wbKey) === '1' : false } catch { return false }
  })
  const acquaInCart = cartItems.some(ci => /acqua/i.test(ci.item?.name || ''))
  const showWaterBreadBanner = !wbDismissed && !table?.active_order_id && !acquaInCart
  const dismissWB = () => {
    setWbDismissed(true)
    try { wbKey && localStorage.setItem(wbKey, '1') } catch {}
  }

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
        // Tavoli incroci: popola crossOrders con i tavoli ?cross=ids.
        if (crossTableIds.length > 0) {
          const cross = crossTableIds
            .map(id => tablesRes.data.find(x => x.id === id))
            .filter(x => x && x.active_order_id)
            .map(x => ({ tableId: x.id, orderId: x.active_order_id, tableNumber: x.table_number }))
          setCrossOrders(cross)
        }
        setCategories(catsRes.data)
        setCombos(combosRes.data.filter(c => c.is_active !== false))
        if (catsRes.data.length > 0) setActiveCategory(catsRes.data[0].id)
        // Tavolo con ordine aperto → mostra cosa è già stato ordinato.
        if (t.active_order_id) {
          loadExisting(t.active_order_id)
        }
      } catch {
        toast({ type: 'error', title: 'Errore caricamento menu' })
      } finally {
        setLoadingMenu(false)
      }
    }
    init()
  }, [tableId, setTable])

  // JP 2026-06-03: ricarica existingItems su socket events. Quando il 7500
  // fa INIZIA TAVOLO o un dispatcher rilascia un waiting, il cameriere
  // deve vedere immediatamente che il piatto e' "production" → bottone
  // "Manda" sparisce, niente piu' errore "stato gia' impostato".
  useEffect(() => {
    if (!socket || !table?.active_order_id) return
    const refresh = (payload) => {
      if (!payload || payload.orderId === table.active_order_id) {
        loadExisting(table.active_order_id)
      }
    }
    socket.on('workflow-status-changed', refresh)
    socket.on('item-released-to-production', refresh)
    socket.on('item-status-updated', refresh)
    return () => {
      socket.off('workflow-status-changed', refresh)
      socket.off('item-released-to-production', refresh)
      socket.off('item-status-updated', refresh)
    }
  }, [socket, table?.active_order_id, loadExisting])

  // Load items when category changes
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
          workflow_status: ci.workflow_status || 'production',
          ...(ci.weight_g ? { weight_g: ci.weight_g } : {}),
          // JP 2026-06-03: timer auto-fire impostato dal cameriere nel carrello.
          ...((ci.workflow_status === 'waiting' && Number(ci.fire_at_minutes) > 0)
              ? { fire_at_minutes: Number(ci.fire_at_minutes) }
              : {}),
        }))

      const comboItems = cartItems
        .filter(ci => ci.item.is_combo)
        .map(ci => ({
          combo_menu_id: ci.combo_id,
          quantity: ci.quantity,
          combo_selections: ci.combo_selections,
          workflow_status: ci.workflow_status || 'production',
        }))

      const items = [...regularItems, ...comboItems]

      // Tavolo principale: addItems se ordine aperto, altrimenti create.
      if (table?.active_order_id) {
        await ordersAPI.addItems(table.active_order_id, items)
      } else {
        try {
          await ordersAPI.create({ table_id: tableId, items, covers })
          await tablesAPI.setStatus(tableId, 'occupied').catch(() => {})
        } catch (e) {
          // 409 race: altro cameriere ha aperto il tavolo → addItems sullo
          // stesso ordine (niente doppio conto).
          const existing = e?.response?.data?.existing_order_id
          if (e?.response?.status === 409 && existing) {
            await ordersAPI.addItems(existing, items)
            toast({
              type: 'info',
              title: 'Aggiunto a ordine esistente',
              message: 'Un altro cameriere aveva già aperto il tavolo.',
            })
          } else {
            throw e
          }
        }
      }
      // JP 2026-06-01: REPLICA su tavoli INCROCI. Ogni cross order riceve
      // gli stessi items in parallelo. Ciascun tavolo mantiene il proprio
      // conto (sono ordini distinti). La cucina li raggruppera' via Abbina.
      if (crossOrders.length > 0 && items.length > 0) {
        await Promise.all(crossOrders.map(c =>
          ordersAPI.addItems(c.orderId, items).catch(err => {
            toast({ type: 'warning', title: `Tav ${c.tableNumber}: errore replica`, message: err?.response?.data?.error || '' })
          })
        ))
        toast({ type: 'success', title: `Incrocio: replicato su ${crossOrders.length + 1} tavoli` })
      }

      clearCart()
      setSent(true)
      setTimeout(() => navigate('/tables'), 1800)
    } catch (e) {
      const msg = e?.response?.data?.error || 'Riprova'
      toast({ type: 'error', title: 'Errore invio ordine', message: msg })
      setSending(false)
    }
  }

  // ─── Sent splash ───────────────────────────────────────────
  if (sent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
        >
          <CheckCircle2 size={72} className="text-[var(--color-ok)]" />
        </motion.div>
        <p className="serif text-[var(--color-text)] text-2xl font-bold">Ordine inviato!</p>
        <p className="text-[var(--color-text-2)] text-sm">Ritorno alla mappa tavoli…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">

      {/* ─── Header ─────────────────────────────────────────────── */}
      {/* Banner incroci attivo — JP 2026-06-01 */}
      {crossOrders.length > 0 && (
        <div className="bg-[var(--color-gold)] text-[#13181C] px-3 py-1.5 text-xs font-bold flex items-center gap-2 sticky top-0 z-30">
          🔗 INCROCIO: Tav {table?.table_number} + {crossOrders.map(c => c.tableNumber).join(' + ')} · ogni piatto va su tutti
        </div>
      )}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-3 sm:px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => navigate('/tables')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <div
          className="w-9 h-9 rounded-[8px] flex items-center justify-center font-extrabold text-[#13181C] text-[12px] shrink-0"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #9c7e1f)' }}
        >
          GP
        </div>
        <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="serif text-[var(--color-text)] font-bold text-lg leading-none">
            Tavolo {table?.table_number ?? '…'}
          </span>
          <Badge tone="sea" size="sm">{covers} pers.</Badge>
          {table?.active_order_id && (
            <Badge tone="gold" size="sm" leftIcon={<Building size={10} />}>
              Ordine aperto
            </Badge>
          )}
        </div>
        {itemCount > 0 && (
          <div className="flex items-center gap-1.5 text-[var(--color-gold)] font-semibold tnum text-sm shrink-0">
            <ShoppingCart size={16} />
            <span>{itemCount}</span>
          </div>
        )}

        {/* Conto: cassa/admin/manager vanno al checkout di questo tavolo.
            Visibile solo se c'e' un ordine aperto. Cosi' la cassa: apre il
            tavolo → vede/aggiunge cosa hanno mangiato → tocca "Conto". */}
        {table?.active_order_id && ['cashier','admin','manager'].includes(authUser?.role) && (
          <button
            onClick={() => navigate(`/checkout/${table.active_order_id}`)}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-[var(--color-gold)] text-[#13181C] text-xs font-bold flex items-center gap-1 hover:brightness-110 active:scale-95 transition"
            title="Vai al conto / cassa"
          >
            <Receipt size={13} /> Conto
          </button>
        )}

        {/* Codice 32: passa ordine ad altro cameriere (solo se ordine aperto) */}
        {table?.active_order_id && authUser?.role === 'waiter' && (
          <button
            onClick={async () => {
              setTransferOpen(true)
              if (waiters.length === 0) {
                try {
                  const { data } = await waitersAPI.list()
                  setWaiters(data.filter(u => u.id !== authUser?.id))
                } catch { /* show empty list */ }
              }
            }}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-[var(--color-warn-soft)] border border-[var(--color-warn)]/40 text-[var(--color-warn)] text-xs font-semibold flex items-center gap-1 hover:brightness-110 active:scale-95 transition"
            title="Codice 32 — passa l'ordine ad altro cameriere"
          >
            <UserPlus2 size={13} /> 32
          </button>
        )}
      </header>

      {/* ─── Banner acqua + pane (apertura tavolo) ─────────────── */}
      {showWaterBreadBanner && (
        <div className="bg-[var(--color-warn-soft)] border-b-2 border-[var(--color-warn)]/40 px-4 py-2.5 flex items-center gap-3 text-sm shrink-0">
          <span className="text-2xl">🥖</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[var(--color-warn)]">Hai portato acqua e pane?</p>
            <p className="text-[10px] text-[var(--color-text-3)] mt-0.5">
              SOP Riva: vanno serviti SUBITO all'apertura del tavolo. Aggiungi acqua al carrello sotto.
            </p>
          </div>
          <button
            onClick={dismissWB}
            className="px-3 py-1.5 rounded-md bg-[var(--color-warn)] text-black text-xs font-bold hover:brightness-110 shrink-0"
          >
            OK fatto
          </button>
        </div>
      )}

      {/* ─── Modal Codice 32 (delega ordine) ──────────────────── */}
      {transferOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !transferring && setTransferOpen(false)}>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-2xl p-5 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="serif text-lg font-bold text-[var(--color-text)] mb-1 flex items-center gap-2">
              <UserPlus2 size={18} className="text-[var(--color-warn)]" /> Codice 32 — Delega
            </h3>
            <p className="text-xs text-[var(--color-text-3)] mb-4">
              Passi la responsabilità del Tavolo {table?.table_number} ad un altro cameriere. L'azione è tracciata nell'audit.
            </p>
            <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-2)] font-semibold">Cameriere destinatario</label>
            <select
              value={transferTo}
              onChange={e => setTransferTo(e.target.value)}
              className="mt-1 w-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-gold)]"
              disabled={transferring}
            >
              <option value="">— scegli —</option>
              {waiters.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.sub_role ? ` (${w.sub_role})` : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setTransferOpen(false)}
                disabled={transferring}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] text-sm font-semibold hover:text-[var(--color-text)]"
              >
                Annulla
              </button>
              <button
                disabled={!transferTo || transferring}
                onClick={async () => {
                  setTransferring(true)
                  try {
                    await ordersAPI.transfer(table.active_order_id, transferTo, 'codice 32')
                    toast({ type: 'success', title: 'Codice 32', message: 'Ordine passato. Audit registrato.' })
                    setTransferOpen(false)
                    setTransferTo('')
                    navigate('/tables')
                  } catch (e) {
                    toast({ type: 'error', title: 'Errore delega', message: e?.response?.data?.error || 'Riprova' })
                  } finally { setTransferring(false) }
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-warn)] text-black text-sm font-bold disabled:opacity-40 hover:brightness-110"
              >
                {transferring ? 'Passo…' : 'Conferma 32'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Già al tavolo: cosa è stato già ordinato ─────────────── */}
      {existingItems.length > 0 && (
        <div className="bg-[var(--color-sea-soft)] border-b border-[var(--color-sea)]/30 shrink-0">
          <button
            onClick={() => setShowExisting(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5"
          >
            <span className="text-sm font-bold text-[var(--color-sea)] flex items-center gap-2">
              <ShoppingCart size={15} /> Già al tavolo · {existingItems.reduce((s, i) => s + i.quantity, 0)} piatti
            </span>
            <ChevronRight size={16} className={`text-[var(--color-sea)] transition-transform ${showExisting ? 'rotate-90' : ''}`} />
          </button>
          {showExisting && (
            <div className="px-4 pb-3 max-h-[30vh] overflow-y-auto space-y-1">
              {existingGroups.map(group => {
                const it = group.sample
                const STAT = { pending: 'Da fare', cooking: 'In lavorazione', oven_done: 'Sfornata', ready: 'Pronto', served: 'Servito' }
                const isWaiting = it.workflow_status === 'waiting'
                // JP 2026-06-01: timer auto-fire sui waiting. Se gia' impostato
                // mostriamo il countdown; altrimenti il bottone "⏰ tempo".
                const fireAtAny = group.items.find(x => x.fire_at)?.fire_at
                const minsToFire = fireAtAny
                  ? Math.max(0, Math.round((new Date(fireAtAny).getTime() - Date.now()) / 60000))
                  : null
                const setTimerForGroup = async () => {
                  const ans = window.prompt('Tra quanti minuti mandare in cucina?', '15')
                  if (ans === null) return
                  const mins = parseInt(ans, 10)
                  if (!(mins > 0)) {
                    toast({ type: 'warning', title: 'Inserisci minuti validi' })
                    return
                  }
                  try {
                    // JP 2026-06-03: il timer si puo' impostare anche su
                    // piatti gia' mandati (workflow=production) finche'
                    // sono ancora pending (il cuoco non li ha iniziati).
                    // Il backend riporta in waiting + fire_at.
                    for (const x of group.items.filter(i => i.status === 'pending')) {
                      await ordersAPI.setItemFireAt(table.active_order_id, x.id, mins)
                    }
                    setExistingItems(prev => prev.map(x =>
                      group.items.some(g => g.id === x.id)
                        ? { ...x, workflow_status: 'waiting', fire_at: new Date(Date.now() + mins * 60000).toISOString() }
                        : x
                    ))
                    toast({ type: 'success', title: `Partira' in cucina tra ${mins} min`, message: it.item_name })
                  } catch (e) {
                    toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
                  }
                }
                const cancelTimerForGroup = async () => {
                  try {
                    for (const x of group.items.filter(i => i.status === 'pending' && i.fire_at)) {
                      await ordersAPI.setItemFireAt(table.active_order_id, x.id, null)
                    }
                    // JP 2026-06-05 FIX: rimuovere il timer NON manda piu' in
                    // cucina automaticamente. Il piatto resta in attesa finche'
                    // il cameriere non preme "Manda in cucina" o INIZIA TAVOLO.
                    setExistingItems(prev => prev.map(x =>
                      group.items.some(g => g.id === x.id)
                        ? { ...x, fire_at: null }
                        : x
                    ))
                    toast({ type: 'info', title: 'Timer tolto — resta in attesa', message: it.item_name })
                  } catch (e) {
                    toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
                  }
                }
                // "+" pulsante: aggiunge 1 unita' al carrello (poi mandata in cucina
                // al "Manda comanda"). Disponibile solo se il gruppo ha menu_item_id
                // e nessun peso (i piatti a peso sono unici per quantita').
                const canAddMore = !!it.menu_item_id && !it.weight_g && !it.combo_id
                const addOne = () => {
                  addItem(
                    {
                      id: it.menu_item_id,
                      name: it.item_name,
                      base_price: it.unit_price,
                      pricing_type: it.pricing_type || 'fixed',
                    },
                    1,
                    [],
                    it.notes || null,
                  )
                  toast({ type: 'success', title: 'Aggiunto', message: `+1 ${it.item_name} nel carrello` })
                }
                return (
                  <div key={group.key} className={`flex items-start justify-between gap-2 text-sm py-1.5 border-b border-[var(--color-border-soft)] last:border-0 ${isWaiting ? 'bg-[var(--color-warn-soft)]/40 -mx-2 px-2 rounded' : ''}`}>
                    <span className="text-[var(--color-text)] min-w-0">
                      <span className="text-[var(--color-gold)] font-bold tnum">{group.qty}×</span> {it.item_name}
                      {it.notes && <span className="text-[var(--color-warn)] text-xs ml-1 italic">({it.notes})</span>}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* JP 2026-06-03: regole bottoni:
                          - pending (waiting OR production): "⏰ tempo" / countdown
                            sempre visibile (puo' rimettere in attesa col timer
                            anche un piatto gia' mandato).
                          - waiting + canFire: anche "Manda" per rilascio anticipato.
                          - cooking/ready/served: solo etichetta status. */}
                      {it.status === 'pending' ? (
                        <div className="flex items-center gap-1">
                          {minsToFire !== null ? (
                            <button
                              onClick={cancelTimerForGroup}
                              className="px-2 py-1 rounded-md bg-[var(--color-sea-soft)] border border-[var(--color-sea)]/50 text-[var(--color-sea)] text-[11px] font-bold flex items-center gap-1"
                              title="Annulla timer (parte subito)"
                            >
                              ⏰ {minsToFire}m
                            </button>
                          ) : (
                            <button
                              onClick={setTimerForGroup}
                              className="px-2 py-1 rounded-md bg-[var(--color-sea-soft)] border border-[var(--color-sea)]/40 text-[var(--color-sea)] text-[11px] font-bold flex items-center gap-1"
                              title="Programma quando mandare in cucina"
                            >
                              ⏰ tempo
                            </button>
                          )}
                          {/* JP 2026-06-04: "Manda" su tutti i waiting
                              del cameriere proprietario, come escape hatch
                              se Fabio (7500) e' lento. Cameriere su tavoli
                              altrui resta bloccato (canFire=false). */}
                          {isWaiting && canFire && (
                            <button
                              onClick={() => fireGroup(group)}
                              className="px-2.5 py-1 rounded-md bg-[var(--color-warn)] text-black text-[11px] font-bold uppercase active:scale-95 transition flex items-center gap-1"
                              title="Manda subito in cucina"
                            >
                              <Send size={11} /> Manda
                            </button>
                          )}
                          {isWaiting && !canFire && (
                            <span className="text-[var(--color-warn)] text-[11px] font-bold whitespace-nowrap">IN ATTESA</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--color-text-3)] text-[11px] whitespace-nowrap">{STAT[it.status] || it.status}</span>
                      )}
                      {/* JP 2026-05-27: "il x1 quando mi fa vedere quello che ce
                          nel tavolo devo avere la possibilita' di aumentare le
                          cose". Aggiungiamo "+" che mette +1 nel carrello. */}
                      {canAddMore && (
                        <button
                          onClick={addOne}
                          className="w-7 h-7 rounded-md bg-[var(--color-gold-soft)] border border-[var(--color-gold-ring)] text-[var(--color-gold)] hover:bg-[var(--color-gold)] hover:text-[#13181C] flex items-center justify-center active:scale-90 transition"
                          title="Aggiungi 1 al carrello"
                          aria-label="Aggiungi 1 al carrello"
                        >
                          <Plus size={14} strokeWidth={3} />
                        </button>
                      )}
                      {canRemove && (
                        <button
                          onClick={() => removeOneFromGroup(group)}
                          className="text-[var(--color-text-3)] hover:text-[var(--color-err)] p-1 active:scale-90 transition"
                          title={group.items.length > 1 ? 'Togli 1' : 'Togli dal tavolo'}
                          aria-label="Togli dal tavolo"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">

        {/* ─── Menu pane ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* JP 2026-06-04: barra ricerca piatti — su tutto il menu, sempre
              in alto sopra le tab categorie. Filtra per nome o descrizione. */}
          <div className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-3 py-2 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)] pointer-events-none" />
              <input
                type="search"
                placeholder="Cerca piatto…"
                value={searchQuery}
                onFocus={loadAllItemsLazy}
                onChange={(e) => { loadAllItemsLazy(); setSearchQuery(e.target.value) }}
                className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg pl-8 pr-9 py-2 text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-3)] outline-none transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-3)] hover:text-[var(--color-text)] p-0.5"
                  aria-label="Cancella ricerca"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {searchQuery && searchResults && (
              <p className="text-[10px] text-[var(--color-text-3)] mt-1 px-1">
                {searchResults.length} {searchResults.length === 1 ? 'risultato' : 'risultati'}
              </p>
            )}
          </div>

          {/* DESKTOP: tab categorie */}
          <div className="hidden md:block bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 overflow-x-auto shrink-0 scrollbar-none">
            <div className="flex gap-0 min-w-max">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleSelectCategory(cat.id)}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                    activeCategory === cat.id
                      ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                      : 'border-transparent text-[var(--color-text-2)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
              {combos.length > 0 && (
                <button
                  onClick={() => handleSelectCategory(COMBO_TAB_ID)}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                    activeCategory === COMBO_TAB_ID
                      ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                      : 'border-transparent text-[var(--color-text-2)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <BookOpen size={13} /> Menù Fissi
                </button>
              )}
            </div>
          </div>

          {/* MOBILE: accordion categorie con emoji portate */}
          <div className="md:hidden flex-1 overflow-y-auto">
            {loadingMenu ? (
              <div className="flex items-center justify-center h-40 gap-2 text-[var(--color-text-2)]">
                <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
                <span className="text-sm">Caricamento menu…</span>
              </div>
            ) : (
              <div className="pb-32">
                {categories.map(cat => {
                  const isOpen = activeCategory === cat.id
                  const courseEmoji = cat.course_type === 'antipasto' ? '🥗' :
                    cat.course_type === 'primo' ? '🍝' :
                    cat.course_type === 'secondo' ? '🥩' :
                    cat.course_type === 'contorno' ? '🥬' :
                    cat.course_type === 'dessert' ? '🍰' :
                    cat.course_type === 'bevanda' ? '🍷' : '📋'

                  const inCart = cartItems.filter(ci => ci.item?.category_id === cat.id).length

                  return (
                    <div key={cat.id}>
                      <button
                        onClick={() => handleSelectCategory(isOpen ? null : cat.id)}
                        className={`w-full flex items-center justify-between px-4 py-4 border-b transition active:bg-[rgba(255,255,255,0.04)] ${
                          isOpen
                            ? 'bg-[var(--color-surface)] border-[var(--color-gold-ring)]'
                            : 'bg-transparent border-[var(--color-border-soft)]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{courseEmoji}</span>
                          <div className="text-left">
                            <span className={`text-base font-bold block ${
                              isOpen ? 'text-[var(--color-gold)]' : 'text-[var(--color-text)]'
                            }`}>
                              {cat.name}
                            </span>
                            {inCart > 0 && (
                              <span className="text-[var(--color-gold)] text-xs font-medium">
                                {inCart} nel carrello
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight
                          size={18}
                          className={`text-[var(--color-text-2)] transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        />
                      </button>

                      {isOpen && !loadingItems && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          className="bg-[var(--color-canvas)] overflow-hidden"
                        >
                          {menuItems.map(item => (
                            <button
                              key={item.id}
                              onClick={() => {
                                if (item.pricing_type === 'per_kg') {
                                  setWeightSheet(item)
                                  setWeightInput(item.min_weight_g ? String(item.min_weight_g) : '')
                                } else {
                                  addItem(item, 1, [], null)
                                }
                              }}
                              className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-[var(--color-border-soft)] active:bg-[var(--color-gold-soft)] transition text-left"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-[var(--color-text)] text-[15px] font-semibold block">
                                  {item.name}
                                </span>
                                {item.description && (
                                  <span className="text-[var(--color-text-3)] text-xs block mt-0.5 line-clamp-1">
                                    {item.description}
                                  </span>
                                )}
                                <AllergenBadges items={item.allergens} size="sm" />
                              </div>
                              <span className="text-[var(--color-gold)] font-bold text-[15px] shrink-0 tnum">
                                {formatPrice(item.base_price)}{item.pricing_type === 'per_kg' ? '/kg' : ''}
                              </span>
                              {item.pricing_type === 'per_kg' ? (
                                <Badge tone="warn" size="sm">PESO</Badge>
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-[var(--color-gold-soft)] flex items-center justify-center shrink-0">
                                  <Plus size={20} className="text-[var(--color-gold)]" strokeWidth={2.5} />
                                </div>
                              )}
                            </button>
                          ))}
                          {menuItems.length === 0 && (
                            <p className="text-[var(--color-text-3)] text-sm text-center py-8">
                              Nessun piatto disponibile
                            </p>
                          )}
                        </motion.div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* DESKTOP: griglia piatti */}
          <div className="hidden md:block flex-1 overflow-y-auto p-4">
            {loadingMenu || loadingItems ? (
              <div className="flex items-center justify-center h-40 gap-2 text-[var(--color-text-2)]">
                <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
                <span className="text-sm">Caricamento…</span>
              </div>
            ) : searchResults ? (
              /* JP 2026-06-04: ricerca attiva → griglia su tutti i piatti
                 che matchano, ignora categoria. */
              searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-[var(--color-text-3)]">
                  <Search size={32} className="opacity-40" />
                  <p className="text-sm">Nessun piatto trovato per &quot;{searchQuery}&quot;</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {searchResults.map(item => (
                    <motion.button
                      key={item.id}
                      onClick={() => {
                        if (item.pricing_type === 'per_kg') {
                          setWeightSheet(item)
                          setWeightInput(item.min_weight_g ? String(item.min_weight_g) : '')
                        } else {
                          addItem(item, 1, [], null)
                          toast({ type: 'success', title: 'Aggiunto', message: item.name })
                        }
                      }}
                      whileTap={{ scale: 0.96 }}
                      className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] hover:border-[var(--color-gold-ring)] rounded-xl p-4 text-left transition flex flex-col gap-2"
                    >
                      <span className="text-[var(--color-text)] text-sm font-bold">{item.name}</span>
                      {item.category_name && (
                        <span className="text-[10px] text-[var(--color-text-3)] uppercase tracking-wide">{item.category_name}</span>
                      )}
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="text-[var(--color-gold)] font-bold text-sm tnum">
                          {formatPrice(item.base_price)}{item.pricing_type === 'per_kg' ? '/kg' : ''}
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )
            ) : activeCategory === COMBO_TAB_ID ? (
              <div className="grid grid-cols-2 gap-3">
                {combos.map(combo => (
                  <motion.button
                    key={combo.id}
                    onClick={() => setComboModal(combo)}
                    whileTap={{ scale: 0.97 }}
                    className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] hover:border-[var(--color-gold-ring)] rounded-xl p-4 text-left transition flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[var(--color-text)] font-bold text-sm">{combo.name}</span>
                      <Badge tone="gold" size="sm">MENU</Badge>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span className="text-[var(--color-gold)] font-bold text-sm tnum">
                        {formatPrice(combo.price)}
                      </span>
                      <ChevronRight size={14} className="text-[var(--color-text-3)]" />
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {menuItems.map(item => (
                  <motion.button
                    key={item.id}
                    onClick={() => {
                      if (item.pricing_type === 'per_kg') {
                        setWeightSheet(item)
                        setWeightInput(item.min_weight_g ? String(item.min_weight_g) : '')
                      } else {
                        addItem(item, 1, [], null)
                      }
                    }}
                    whileTap={{ scale: 0.96 }}
                    className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] hover:border-[var(--color-gold-ring)] rounded-xl p-4 text-left transition flex flex-col gap-2"
                  >
                    <span className="text-[var(--color-text)] text-sm font-bold">{item.name}</span>
                    {item.description && (
                      <span className="text-[var(--color-text-3)] text-xs line-clamp-2">{item.description}</span>
                    )}
                    <AllergenBadges items={item.allergens} size="xs" />
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span className="text-[var(--color-gold)] font-bold text-sm tnum">
                        {formatPrice(item.base_price)}{item.pricing_type === 'per_kg' ? '/kg' : ''}
                      </span>
                      {item.pricing_type === 'per_kg' ? (
                        <Badge tone="warn" size="sm">PESO</Badge>
                      ) : (
                        <Plus size={14} className="text-[var(--color-text-2)]" />
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Carrello laterale (desktop) ─────────────────────── */}
        <div className="hidden md:flex w-80 bg-[var(--color-surface)] border-l border-[var(--color-border-soft)] flex-col">
          <div className="px-4 py-3 border-b border-[var(--color-border-soft)] flex items-center justify-between">
            <h3 className="serif text-[var(--color-text)] font-bold text-base tracking-tight">Ordine</h3>
            {itemCount > 0 && <Badge tone="gold" size="sm">{itemCount} piatti</Badge>}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <ShoppingCart size={32} className="text-[var(--color-text-3)]" />
                <p className="text-[var(--color-text-3)] text-xs text-center">
                  Aggiungi piatti dal menu
                </p>
              </div>
            ) : (
              <AnimatePresence>
                {cartItems.map(ci => (
                  <motion.div
                    key={ci._key}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="py-2 border-b border-[var(--color-border-soft)] last:border-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-[var(--color-text)] text-xs font-semibold leading-tight block truncate">
                          {ci.item.is_combo && (
                            <span className="text-[9px] font-bold bg-[var(--color-gold-soft)] text-[var(--color-gold)] px-1 py-0.5 rounded mr-1">
                              M
                            </span>
                          )}
                          {ci.item.name}
                          {ci.weight_g && (
                            <span className="text-[var(--color-text-2)] text-[9px] ml-1 tnum">{ci.weight_g}g</span>
                          )}
                        </span>
                        {ci.item.is_combo && ci.combo_selections && (() => {
                          // Render-safe: gestisce format legacy [{menu_item_id}]
                          const sel = ci.combo_selections
                          let entries = []
                          if (Array.isArray(sel)) {
                            const valid = sel.filter(s => s && typeof s === 'object')
                            if (valid.length > 0) entries = [['Selezione', `${valid.length} portate (legacy)`]]
                          } else if (typeof sel === 'object') {
                            entries = Object.entries(sel).map(([k, v]) => [
                              String(k),
                              Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : '').filter(Boolean).join(', ')
                                : (typeof v === 'string' || typeof v === 'number') ? String(v) : ''
                            ]).filter(([, label]) => label)
                          }
                          if (entries.length === 0) return null
                          return (
                            <div className="mt-0.5">
                              {entries.map(([course, label], i) => (
                                <p key={`${course}-${i}`} className="text-[var(--color-text-3)] text-[9px] truncate">
                                  {course}: {label}
                                </p>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                      <button
                        onClick={() => removeItem(ci._key)}
                        className="text-[var(--color-text-3)] hover:text-[var(--color-err)] transition flex-shrink-0 p-0.5"
                        aria-label="Rimuovi"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {/* Workflow status A/P/C + timer minuti (JP 2026-06-03:
                        Marco deve poter inserire i minuti direttamente nel
                        carrello, senza passare per il pannello "Già al tavolo"). */}
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {[
                        { key: 'production', label: 'P', icon: Zap,           tone: 'terracotta', title: 'Produzione' },
                        { key: 'waiting',    label: 'A', icon: Clock,         tone: 'warn',       title: 'Attesa' },
                        { key: 'delivered',  label: 'C', icon: PackageCheck,  tone: 'ok',         title: 'Consegnato' },
                      ].map(ws => {
                        const active = (ci.workflow_status || 'production') === ws.key
                        return (
                          <button
                            key={ws.key}
                            onClick={() => setWorkflowStatus(ci._key, ws.key)}
                            title={ws.title}
                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border transition ${
                              active
                                ? `text-[var(--color-${ws.tone})] border-[var(--color-${ws.tone})]/50 bg-[var(--color-${ws.tone}-soft)]`
                                : 'text-[var(--color-text-3)] border-[var(--color-border-strong)] bg-transparent hover:border-[var(--color-text-3)]'
                            }`}
                          >
                            <ws.icon size={8} />
                            {ws.label}
                          </button>
                        )
                      })}
                      {/* Input minuti per timer auto-fire — visibile solo se ATTESA. */}
                      {(ci.workflow_status || 'production') === 'waiting' && (
                        <div className="flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded border border-[var(--color-sea)]/50 bg-[var(--color-sea-soft)]/40">
                          <Clock size={10} className="text-[var(--color-sea)]" />
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="180"
                            placeholder="min"
                            value={ci.fire_at_minutes ?? ''}
                            onChange={(e) => {
                              const v = e.target.value.trim()
                              // Cap a 180 min (3 ore) — un timer piu' lungo
                              // sopravviverebbe al day-close e creerebbe casino.
                              setFireAtMinutes(ci._key, v === '' ? null : Math.min(180, Math.max(0, parseInt(v, 10) || 0)))
                            }}
                            className="w-12 bg-transparent text-[var(--color-sea)] text-[10px] font-bold text-center outline-none tnum"
                          />
                          <span className="text-[9px] text-[var(--color-sea)] font-semibold">min</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-1.5">
                      {!ci.item.is_combo ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(ci._key, ci.quantity - 1)}
                            disabled={ci.quantity <= 1}
                            className="w-5 h-5 rounded bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[var(--color-border-strong)] disabled:opacity-30 transition"
                            aria-label="Diminuisci"
                          >
                            <Minus size={10} />
                          </button>
                          <span className="text-[var(--color-text)] text-xs w-4 text-center tnum font-semibold">
                            {ci.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(ci._key, ci.quantity + 1)}
                            className="w-5 h-5 rounded bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[var(--color-border-strong)] transition"
                            aria-label="Aumenta"
                          >
                            <Plus size={10} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[var(--color-text-3)] text-[10px]">×1</span>
                      )}
                      <span className="text-[var(--color-gold)] text-xs font-bold tnum">
                        {formatPrice((ci.item.computed_price ?? ci.item.base_price) * ci.quantity)}
                      </span>
                    </div>

                    {/* Modifica / nota piatto (es. senza cipolla) */}
                    <button
                      onClick={() => openNote(ci)}
                      className="mt-1.5 w-full text-left flex items-center gap-1 text-[10px] px-1.5 py-1 rounded border border-dashed border-[var(--color-border-strong)] text-[var(--color-text-3)] hover:text-[var(--color-gold)] hover:border-[var(--color-gold-ring)] transition"
                    >
                      <Pencil size={10} className="shrink-0" />
                      {ci.notes
                        ? <span className="text-[var(--color-warn)] font-semibold truncate">{ci.notes}</span>
                        : <span>Modifica / togli ingredienti</span>}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Footer: totale + invia */}
          <div className="px-4 py-4 border-t border-[var(--color-border-soft)] flex flex-col gap-3 bg-[var(--color-surface-2)]">
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
              disabled={cartItems.length === 0}
              leftIcon={<Send size={16} />}
              onClick={handleSend}
            >
              Invia ordine
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Carrello mobile (barra fissa in basso) ─────────────────── */}
      {itemCount > 0 && (
        <div className="md:hidden fixed bottom-14 left-0 right-0 z-[80] bg-[var(--color-surface)] border-t border-[var(--color-border-strong)] safe-area-bottom shadow-[0_-8px_24px_rgba(0,0,0,0.4)]">
          {showMobileCart && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              className="max-h-[50vh] overflow-y-auto px-4 py-3 space-y-2"
            >
              {cartItems.map(ci => (
                <div
                  key={ci._key}
                  className="flex items-center justify-between py-1.5 border-b border-[var(--color-border-soft)] last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-[var(--color-text)] text-sm block truncate">
                      {ci.quantity > 1 && (
                        <span className="text-[var(--color-gold)] font-semibold tnum">{ci.quantity}× </span>
                      )}
                      {ci.item.name}
                      {ci.weight_g && (
                        <span className="text-[var(--color-text-2)] text-xs ml-1 tnum">{ci.weight_g}g</span>
                      )}
                    </span>
                    {/* Modifica / nota piatto */}
                    <button
                      onClick={() => openNote(ci)}
                      className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-text-3)] active:text-[var(--color-gold)]"
                    >
                      <Pencil size={11} className="shrink-0" />
                      {ci.notes
                        ? <span className="text-[var(--color-warn)] font-semibold truncate">{ci.notes}</span>
                        : <span>Modifica / togli ingredienti</span>}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[var(--color-gold)] text-sm font-bold tnum">
                      {formatPrice((ci.item.computed_price ?? ci.item.base_price) * ci.quantity)}
                    </span>
                    <button
                      onClick={() => removeItem(ci._key)}
                      className="text-[var(--color-text-3)] active:text-[var(--color-err)] p-1"
                      aria-label="Rimuovi"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setShowMobileCart(v => !v)}
              className="flex items-center gap-2 flex-1"
            >
              <div className="relative">
                <ShoppingCart size={20} className="text-[var(--color-gold)]" />
                <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-[var(--color-gold)] rounded-full text-[#13181C] text-[8px] font-bold flex items-center justify-center tnum">
                  {itemCount}
                </span>
              </div>
              <span className="serif text-[var(--color-text)] font-bold text-lg tnum">
                {formatPrice(total)}
              </span>
              <ChevronRight
                size={16}
                className={`text-[var(--color-text-2)] transition ${showMobileCart ? 'rotate-90' : '-rotate-90'}`}
              />
            </button>
            <Button
              size="md"
              loading={sending}
              leftIcon={<Send size={14} />}
              onClick={handleSend}
            >
              Invia
            </Button>
          </div>
        </div>
      )}

      {/* ─── Combo Modal v2 ───────────────────────────────────────────── */}
      <ComboModalV2
        combo={comboModal}
        onClose={() => setComboModal(null)}
        onConfirm={handleComboConfirm}
      />

      {/* ─── BottomSheet per piatti al peso (pesce al kg) ─────────────── */}
      <BottomSheet
        open={!!weightSheet}
        onClose={() => setWeightSheet(null)}
        title={weightSheet ? `${weightSheet.name} · ${formatPrice(weightSheet.base_price)}/kg` : ''}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[var(--color-text-2)] text-xs uppercase tracking-wider font-semibold">
              Peso in grammi
            </label>
            {weightSheet?.min_weight_g > 0 && (
              <p className="text-[var(--color-gold)] text-sm font-bold">
                Ordine minimo: {weightSheet.min_weight_g} g
              </p>
            )}
            <input
              type="number"
              inputMode="numeric"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              placeholder="es. 350"
              className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-4 py-3.5 text-[var(--color-text)] text-2xl text-center font-bold placeholder:text-[var(--color-text-3)] outline-none transition tnum"
              autoFocus
            />
            {weightSheet?.min_weight_g > 0 && weightInput && parseInt(weightInput, 10) < weightSheet.min_weight_g && (
              <p className="text-[var(--color-err)] text-xs font-semibold">
                ⚠ Sotto il minimo di {weightSheet.min_weight_g} g
              </p>
            )}
          </div>
          {weightInput && parseInt(weightInput, 10) > 0 && weightSheet && (
            <div className="text-center bg-[var(--color-gold-soft)] rounded-lg py-3">
              <span className="text-[var(--color-text-2)] text-xs">Prezzo: </span>
              <span className="serif text-[var(--color-gold)] font-bold text-2xl tnum">
                {formatPrice((parseFloat(weightSheet.base_price) * parseInt(weightInput, 10)) / 1000)}
              </span>
              <span className="text-[var(--color-text-3)] text-xs ml-1 tnum">
                ({parseInt(weightInput, 10)}g)
              </span>
            </div>
          )}
          <Button
            fullWidth
            size="lg"
            disabled={!weightInput || parseInt(weightInput, 10) <= 0 || (weightSheet?.min_weight_g > 0 && parseInt(weightInput, 10) < weightSheet.min_weight_g)}
            leftIcon={<Plus size={16} />}
            onClick={() => {
              const g = parseInt(weightInput, 10)
              if (!g || g <= 0 || !weightSheet) {
                toast({ type: 'warning', title: 'Inserisci un peso valido' })
                return
              }
              if (weightSheet.min_weight_g > 0 && g < weightSheet.min_weight_g) {
                toast({ type: 'warning', title: `Minimo ${weightSheet.min_weight_g} g per ${weightSheet.name}` })
                return
              }
              addItem(weightSheet, 1, [], null, g)
              const price = (parseFloat(weightSheet.base_price) * g) / 1000
              toast({ type: 'success', title: `${weightSheet.name} ${g}g`, message: formatPrice(price) })
              setWeightSheet(null)
            }}
          >
            Aggiungi al carrello
          </Button>
        </div>
      </BottomSheet>

      {/* ─── BottomSheet modifica / nota piatto (senza X, aggiungi Y) ──── */}
      <BottomSheet
        open={!!noteFor}
        onClose={() => setNoteFor(null)}
        title={noteItem ? `Modifica · ${noteItem.item.name}` : 'Modifica piatto'}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[var(--color-text-3)] text-xs">
            Scrivi cosa togliere o aggiungere. La nota arriva al cuoco sulla comanda.
          </p>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Es. senza cipolla, no aglio, ben cotto…"
            rows={2}
            className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] rounded-lg px-3 py-2.5 text-[var(--color-text)] text-base outline-none transition resize-none"
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_NOTES.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => setNoteText(t => (t && t.trim()) ? `${t.trim()}, ${q}` : q)}
                className="px-3 py-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] text-sm active:bg-[var(--color-gold-soft)] active:text-[var(--color-gold)] transition"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setNoteText('')}>
              Pulisci
            </Button>
            <Button
              fullWidth
              leftIcon={<CheckCircle2 size={16} />}
              onClick={() => { if (noteFor) setNotes(noteFor, noteText.trim() || null); setNoteFor(null) }}
            >
              Salva
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
