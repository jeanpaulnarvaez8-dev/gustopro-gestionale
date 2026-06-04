import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Banknote, CreditCard, Smartphone, Receipt, RefreshCw,
  CheckCircle2, Users, SplitSquareVertical, Pencil, Plus, Minus, X, Zap, Trash2,
  Printer, Share2,
} from 'lucide-react'
import { billingAPI, tablesAPI, ordersAPI, printAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { Card, Badge, Button } from '../components/v2'
import ReceiptPrint from '../components/ReceiptPrint'

// ─── Constants ───────────────────────────────────────────────────────────────
const PAY_METHODS = [
  { id: 'cash',    label: 'Contanti', icon: Banknote,    tone: 'ok'   },
  { id: 'card',    label: 'Carta',    icon: CreditCard,  tone: 'sea'  },
  { id: 'digital', label: 'Digitale', icon: Smartphone,  tone: 'park' },
]

// Colori "persone" per split — palette Riva (gold + accenti mediterranei)
const PERSON_COLORS = ['#D4AF37','#3E7A93','#4A7A5C','#C9A96E','#B85C3C','#A855F7']

// JP 2026-05-27: "gli ordini uguali si devono accumulare e i coperti devono
// uscire per primo". Accumula le voci identiche del conto in una sola riga
// con quantita'/subtotale sommati. Chiave merge: nome + prezzo unitario +
// note + firma modificatori. Conserva gli id originali (ids[]) per la
// rimozione e l'id rappresentativo (primo) per l'assegnazione split.
// L'ordine in ingresso e' gia' coperti-first dal backend: lo preserviamo
// creando i gruppi al primo incontro.
function accumulateBillItems(items) {
  if (!Array.isArray(items)) return []
  const groups = []
  const index = new Map()
  for (const it of items) {
    const modKey = Array.isArray(it.modifiers) && it.modifiers.length > 0
      ? JSON.stringify(it.modifiers.map(m => `${m.name}:${m.price_extra}`).sort())
      : ''
    const key = `${it.item_name}|${it.unit_price}|${it.notes || ''}|${modKey}`
    let g = index.get(key)
    if (!g) {
      g = {
        ...it,
        ids: [it.id],
        quantity: Number(it.quantity || 0),
        subtotal: parseFloat(it.subtotal || 0),
      }
      index.set(key, g)
      groups.push(g)
    } else {
      g.ids.push(it.id)
      g.quantity += Number(it.quantity || 0)
      g.subtotal = parseFloat(g.subtotal) + parseFloat(it.subtotal || 0)
    }
  }
  return groups
}

// Applica l'accumulo all'oggetto bill restituito dal backend.
function accumulateBill(data) {
  if (!data) return data
  return { ...data, items: accumulateBillItems(data.items) }
}

const TONE_BTN = {
  ok:   'border-[var(--color-ok)]/60   text-[var(--color-ok)]   bg-[var(--color-ok-soft)]',
  sea:  'border-[var(--color-sea)]/60  text-[var(--color-sea)]  bg-[var(--color-sea-soft)]',
  park: 'border-[var(--color-park)]/60 text-[var(--color-park)] bg-[var(--color-park-soft)]',
}

// ─── MethodPicker ────────────────────────────────────────────────────────────
function MethodPicker({ value, onChange, small = false }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PAY_METHODS.map(m => {
        const Icon = m.icon
        const active = value === m.id
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`rounded-xl border-2 transition flex flex-col items-center justify-center gap-1
              ${small ? 'py-2' : 'py-3'}
              ${active
                ? TONE_BTN[m.tone]
                : 'border-[var(--color-border-strong)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)] hover:border-[var(--color-text-3)]'
              }`}
          >
            <Icon size={small ? 14 : 18} />
            <span className={`font-semibold ${small ? 'text-[10px]' : 'text-xs'}`}>{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── PersonAvatar ────────────────────────────────────────────────────────────
function PersonAvatar({ idx, size = 5 }) {
  const px = `${size * 4}px`
  return (
    <div
      className="rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-[#13181C] tnum"
      style={{
        width: px,
        height: px,
        backgroundColor: PERSON_COLORS[idx % PERSON_COLORS.length],
      }}
    >
      {idx + 1}
    </div>
  )
}

// ─── SplitEqual ──────────────────────────────────────────────────────────────
function SplitEqual({ bill, onPay, paying }) {
  const [count, setCount] = useState(2)
  const [paid, setPaid]   = useState(0)
  const [methods, setMethods] = useState({})

  const remaining = bill.total_amount
  const perPart = parseFloat((remaining / (count - paid)).toFixed(2))

  const handlePartPay = async (personIdx) => {
    const m = methods[personIdx]
    if (!m) return
    await onPay(perPart, true, personIdx + 1, count, m)
    setPaid(p => p + 1)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Counter */}
      <Card padding="md" className="flex flex-col gap-2">
        <p className="text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider">
          Numero di persone
        </p>
        <div className="flex items-center gap-3 justify-center">
          <button
            onClick={() => setCount(c => Math.max(2, c - 1))}
            disabled={paid > 0}
            className="w-9 h-9 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] hover:text-[var(--color-text)] disabled:opacity-30 transition flex items-center justify-center"
          >
            <Minus size={14} />
          </button>
          <span className="serif text-[var(--color-text)] font-bold text-3xl w-12 text-center tnum">
            {count}
          </span>
          <button
            onClick={() => setCount(c => Math.min(10, c + 1))}
            disabled={paid > 0}
            className="w-9 h-9 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] hover:text-[var(--color-text)] disabled:opacity-30 transition flex items-center justify-center"
          >
            <Plus size={14} />
          </button>
        </div>
        <p className="text-[var(--color-gold)] text-sm text-center font-bold tnum">
          {formatPrice(perPart)} a persona
        </p>
        {/* Dots progress */}
        <div className="flex justify-center gap-1.5 mt-1">
          {[...Array(count)].map((_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i < paid ? 'bg-[var(--color-ok)]' : 'bg-[var(--color-border-strong)]'
              }`}
            />
          ))}
        </div>
        <p className="text-[var(--color-text-3)] text-[10px] text-center tnum">
          {paid}/{count} pagato
        </p>
      </Card>

      {/* Pending parts */}
      <div className="flex flex-col gap-2">
        {[...Array(count - paid)].map((_, i) => {
          const idx = paid + i
          return (
            <Card key={idx} padding="md" className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <PersonAvatar idx={idx} />
                <span className="text-[var(--color-text-2)] text-xs">
                  Persona {idx + 1} · <span className="text-[var(--color-gold)] font-semibold tnum">{formatPrice(perPart)}</span>
                </span>
              </div>
              <MethodPicker small value={methods[idx]} onChange={m => setMethods(p => ({ ...p, [idx]: m }))} />
              <Button
                size="sm"
                fullWidth
                loading={paying}
                disabled={!methods[idx]}
                leftIcon={<CheckCircle2 size={12} />}
                onClick={() => handlePartPay(idx)}
              >
                Incassa {formatPrice(perPart)}
              </Button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ─── SplitByItem ─────────────────────────────────────────────────────────────
function SplitByItem({ bill, onPay, paying }) {
  const [personCount, setPersonCount] = useState(2)
  const [assignments, setAssignments] = useState({})  // itemId → personIdx
  const [methods, setMethods] = useState({})
  const [paid, setPaid] = useState(new Set())

  // JP 2026-06-04: il coperto/surcharge NON si assegna tap-per-tap; viene
  // ripartito in parti uguali tra le persone dello split. Cosi' personTotals
  // somma sempre al bill.total_amount anche se il cameriere splitta solo
  // i piatti normali.
  const isCopertoLike = (it) =>
    !!it?.is_surcharge ||
    /coperto/i.test(it?.item_name || '') ||
    /coperto/i.test(it?.custom_name || '')
  const dishItems = bill.items.filter(it => !isCopertoLike(it))
  const surchargeItems = bill.items.filter(isCopertoLike)
  const surchargeTotal = surchargeItems.reduce((s, it) => s + parseFloat(it.subtotal || 0), 0)
  const surchargePerPerson = personCount > 0 ? surchargeTotal / personCount : 0

  const toggleAssign = (itemId) => {
    setAssignments(p => {
      const cur = p[itemId]
      if (cur === undefined) return { ...p, [itemId]: 0 }
      if (cur < personCount - 1) return { ...p, [itemId]: cur + 1 }
      const next = { ...p }
      delete next[itemId]
      return next
    })
  }

  const personTotals = Array.from({ length: personCount }, (_, pi) => {
    const fromDishes = dishItems.reduce((sum, item) => {
      if (assignments[item.id] === pi) return sum + parseFloat(item.subtotal)
      return sum
    }, 0)
    return parseFloat((fromDishes + surchargePerPerson).toFixed(2))
  })

  const unassignedTotal = dishItems.reduce((sum, item) => {
    if (assignments[item.id] === undefined) return sum + parseFloat(item.subtotal)
    return sum
  }, 0)

  const handlePersonPay = async (pi) => {
    const m = methods[pi]
    if (!m || personTotals[pi] === 0) return
    await onPay(personTotals[pi], true, paid.size + 1, personCount, m)
    setPaid(p => new Set([...p, pi]))
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Person count */}
      <Card padding="sm" className="flex items-center justify-between">
        <span className="text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider">Persone</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPersonCount(c => Math.max(2, c - 1))}
            className="w-7 h-7 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] flex items-center justify-center"
          >
            <Minus size={12} />
          </button>
          <span className="text-[var(--color-text)] font-bold text-base w-6 text-center tnum">{personCount}</span>
          <button
            onClick={() => setPersonCount(c => Math.min(PERSON_COLORS.length, c + 1))}
            className="w-7 h-7 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] flex items-center justify-center"
          >
            <Plus size={12} />
          </button>
        </div>
      </Card>

      <p className="text-[var(--color-text-3)] text-[11px] text-center">
        Tocca un piatto per assegnarlo a una persona
      </p>

      {/* JP 2026-06-04: banner coperto pro-rata — riassicura il cameriere
          che la quota e' inclusa in ogni persona, senza dover assegnarlo. */}
      {surchargeTotal > 0 && (
        <div className="px-3 py-2 rounded-lg bg-[var(--color-gold-soft)] border border-[var(--color-gold-ring)] text-[11px] flex items-center justify-between gap-2">
          <span className="text-[var(--color-gold)] font-semibold">
            Coperto {formatPrice(surchargeTotal)} ÷ {personCount} persone
          </span>
          <span className="text-[var(--color-text-2)] tnum">
            +{formatPrice(surchargePerPerson)}/persona
          </span>
        </div>
      )}

      {/* Items assignment — solo piatti (coperto suddiviso a parte) */}
      <Card padding="none" className="overflow-hidden">
        {dishItems.map((item, i) => {
          const pi = assignments[item.id]
          const color = pi !== undefined ? PERSON_COLORS[pi % PERSON_COLORS.length] : 'rgba(232,219,180,0.16)'
          return (
            <button
              key={item.id}
              onClick={() => toggleAssign(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition
                ${i < dishItems.length - 1 ? 'border-b border-[var(--color-border-soft)]' : ''}
                ${pi !== undefined ? 'bg-[var(--color-surface-2)]' : 'hover:bg-[rgba(255,255,255,0.02)]'}`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-[#13181C] tnum transition-colors"
                  style={{ backgroundColor: color }}
                >
                  {pi !== undefined ? pi + 1 : '?'}
                </div>
                <span className="text-[var(--color-text)] text-xs truncate">
                  <span className="text-[var(--color-gold)] tnum">×{item.quantity}</span>{' '}
                  {item.item_name}
                </span>
              </div>
              <span className="text-[var(--color-text-2)] text-xs ml-2 flex-shrink-0 tnum">
                {formatPrice(item.subtotal)}
              </span>
            </button>
          )
        })}
      </Card>

      {unassignedTotal > 0 && (
        <p className="text-[var(--color-warn)] text-[11px] text-center font-semibold tnum">
          {formatPrice(unassignedTotal)} non assegnati
        </p>
      )}

      {/* Per-person pay */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: personCount }, (_, pi) => {
          if (paid.has(pi)) {
            return (
              <div
                key={pi}
                className="flex items-center gap-2 px-3 py-2 bg-[var(--color-ok-soft)] border border-[var(--color-ok)]/30 rounded-xl"
              >
                <CheckCircle2 size={14} className="text-[var(--color-ok)]" />
                <span className="text-[var(--color-ok)] text-xs font-semibold">
                  Persona {pi + 1} — pagato {formatPrice(personTotals[pi])}
                </span>
              </div>
            )
          }
          if (personTotals[pi] === 0) return null
          return (
            <Card key={pi} padding="md" className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <PersonAvatar idx={pi} />
                <span className="text-[var(--color-text-2)] text-xs">
                  Persona {pi + 1} · <span className="text-[var(--color-gold)] font-semibold tnum">{formatPrice(personTotals[pi])}</span>
                </span>
              </div>
              <MethodPicker small value={methods[pi]} onChange={m => setMethods(p => ({ ...p, [pi]: m }))} />
              <Button
                size="sm"
                fullWidth
                loading={paying}
                disabled={!methods[pi]}
                leftIcon={<CheckCircle2 size={12} />}
                onClick={() => handlePersonPay(pi)}
              >
                Incassa {formatPrice(personTotals[pi])}
              </Button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ─── SplitCustom ─────────────────────────────────────────────────────────────
function SplitCustom({ bill, onPay, paying }) {
  const [people, setPeople] = useState([
    { name: 'Persona 1', amount: '', method: null },
    { name: 'Persona 2', amount: '', method: null },
  ])
  const [paid, setPaid] = useState(new Set())

  const totalAssigned = people.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const remaining = parseFloat((bill.total_amount - totalAssigned).toFixed(2))

  const update = (i, field, val) => setPeople(ps => ps.map((p, idx) => idx === i ? { ...p, [field]: val } : p))

  const addPerson = () => setPeople(ps => [...ps, { name: `Persona ${ps.length + 1}`, amount: '', method: null }])
  const removePerson = (i) => setPeople(ps => ps.filter((_, idx) => idx !== i))

  const handlePersonPay = async (i) => {
    const p = people[i]
    const amount = parseFloat(p.amount)
    if (!p.method || !amount) return
    const newPaid = new Set([...paid, i])
    await onPay(amount, true, i + 1, people.length, p.method)
    setPaid(newPaid)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Remaining tracker */}
      <div
        className={`rounded-xl px-4 py-2.5 flex justify-between items-center border ${
          Math.abs(remaining) < 0.01
            ? 'bg-[var(--color-ok-soft)] border-[var(--color-ok)]/30'
            : 'bg-[var(--color-surface-2)] border-[var(--color-border-strong)]'
        }`}
      >
        <span className="text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider">Rimanente</span>
        <span className={`font-bold text-sm tnum ${
          remaining > 0.01 ? 'text-[var(--color-warn)]' :
          remaining < -0.01 ? 'text-[var(--color-err)]' :
          'text-[var(--color-ok)]'
        }`}>
          {formatPrice(Math.abs(remaining))} {remaining < -0.01 ? 'in eccesso' : ''}
        </span>
      </div>

      {/* People list */}
      <div className="flex flex-col gap-2">
        {people.map((p, i) => {
          if (paid.has(i)) {
            return (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 bg-[var(--color-ok-soft)] border border-[var(--color-ok)]/30 rounded-xl"
              >
                <CheckCircle2 size={14} className="text-[var(--color-ok)]" />
                <span className="text-[var(--color-ok)] text-xs font-semibold">
                  {p.name} — pagato {formatPrice(parseFloat(p.amount))}
                </span>
              </div>
            )
          }
          return (
            <Card key={i} padding="md" className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <PersonAvatar idx={i} />
                <input
                  value={p.name}
                  onChange={e => update(i, 'name', e.target.value)}
                  className="flex-1 bg-transparent text-[var(--color-text)] text-xs outline-none border-b border-[var(--color-border-strong)] pb-0.5 focus:border-[var(--color-gold)] transition"
                />
                {people.length > 2 && (
                  <button
                    onClick={() => removePerson(i)}
                    className="text-[var(--color-text-3)] hover:text-[var(--color-err)] transition p-0.5"
                    aria-label="Rimuovi persona"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-text-3)] text-xs">€</span>
                <input
                  type="number"
                  value={p.amount}
                  onChange={e => update(i, 'amount', e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="flex-1 bg-[var(--color-canvas)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-2 py-1.5 text-[var(--color-text)] text-sm text-right outline-none transition tnum"
                />
              </div>
              <MethodPicker small value={p.method} onChange={m => update(i, 'method', m)} />
              <Button
                size="sm"
                fullWidth
                loading={paying}
                disabled={!p.method || !parseFloat(p.amount)}
                leftIcon={<CheckCircle2 size={12} />}
                onClick={() => handlePersonPay(i)}
              >
                Incassa {p.amount ? formatPrice(parseFloat(p.amount)) : '—'}
              </Button>
            </Card>
          )
        })}
      </div>

      <button
        onClick={addPerson}
        className="flex items-center justify-center gap-1.5 py-3 rounded-xl border border-dashed border-[var(--color-border-strong)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)] hover:border-[var(--color-text-3)] text-xs font-medium transition"
      >
        <Plus size={12} /> Aggiungi persona
      </button>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
const SPLIT_MODES = [
  { id: 'single',   label: 'Intero',       icon: Receipt              },
  { id: 'equal',    label: 'Quote uguali', icon: Users                },
  { id: 'byitem',   label: 'Per piatto',   icon: SplitSquareVertical  },
  { id: 'custom',   label: 'Libero',       icon: Pencil               },
]

export default function CheckoutPage() {
  const { orderId } = useParams()
  const navigate    = useNavigate()
  const { toast }   = useToast()
  const { user }    = useAuth()

  const [bill, setBill]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [mode, setMode]       = useState('single')
  const [method, setMethod]   = useState(null)
  const [paying, setPaying]   = useState(false)
  const [done, setDone]       = useState(false)
  // Ricevuta finale: dati dell'ultimo payment + receipt + bill snapshot
  const [finalReceipt, setFinalReceipt] = useState(null) // { bill, payment, receipt }

  // Voce a prezzo libero (cassa): qualcosa fuori menu da mettere sul conto.
  const canAddCustom = ['cashier', 'admin', 'manager'].includes(user?.role)
  const [showAddItem, setShowAddItem] = useState(false)
  const [customName, setCustomName]   = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customQty, setCustomQty]     = useState(1)
  const [addingItem, setAddingItem]   = useState(false)
  // Sconto (JP 2026-05-31): applica sconto al conto come voce negativa.
  const [showDiscount, setShowDiscount] = useState(false)
  const [discountAmount, setDiscountAmount] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [applyingDiscount, setApplyingDiscount] = useState(false)
  // Edit prezzo inline (JP 2026-05-31): tap sul prezzo di una riga del conto
  // per cambiarlo direttamente. editingPriceFor = group representative id.
  const [editingPriceFor, setEditingPriceFor] = useState(null)
  const [editPriceInput, setEditPriceInput] = useState('')
  const [editingPrice, setEditingPrice] = useState(false)

  // Cassa fisica: persistita in localStorage per device. Default null,
  // l'utente la seleziona dalla pillola in alto. Inviata al backend con
  // ogni payment per audit (tabella payments.register).
  const [activeRegister, setActiveRegister] = useState(() => {
    try { return localStorage.getItem('gustopro_register') || null } catch { return null }
  })
  function switchRegister(r) {
    setActiveRegister(r)
    try {
      if (r) localStorage.setItem('gustopro_register', r)
      else localStorage.removeItem('gustopro_register')
    } catch {}
  }

  useEffect(() => {
    billingAPI.preConto(orderId)
      .then(r => setBill(accumulateBill(r.data)))
      .catch(() => setError('Ordine non trovato'))
      .finally(() => setLoading(false))
  }, [orderId])

  const freeTable = async () => {
    try {
      const tableRes = await tablesAPI.list()
      const table = tableRes.data.find(t => t.active_order_id === orderId)
      if (table) await tablesAPI.setStatus(table.id, 'dirty').catch(() => {})
    } catch {
      // ignore
    }
  }

  const handlePay = async (amount, isSplit = false, splitIndex = 1, splitTotal = 1, payMethod = method) => {
    if (!payMethod) return
    setPaying(true)
    try {
      // Salva la response del pagamento: { payment, receipt, payment_status }
      // Identificatore cassa fisica: usa il valore corrente dello state
      // (sincronizzato con localStorage). Il selettore C1/C2 nell'header
      // permette di switchare. Inviato col payment per audit.
      const register = activeRegister
      const payResp = await billingAPI.pay({
        order_id: orderId,
        amount,
        payment_method: payMethod,
        is_split: isSplit,
        split_index: splitIndex,
        split_total: splitTotal,
        register,
      }).then(r => r.data)

      const updatedBill = accumulateBill(await billingAPI.preConto(orderId).then(r => r.data))
      setBill(updatedBill)

      if (updatedBill.payment_status === 'paid') {
        // Salva snapshot ricevuta per la print view (snapshot evita race
        // condition se l'utente preme "Stampa" dopo che il bill cambia)
        setFinalReceipt({
          bill: updatedBill,
          payment: payResp.payment,
          receipt: payResp.receipt,
        })
        await freeTable()
        setDone(true)
        // NB: NESSUN auto-redirect — l'utente deve poter stampare o chiudere
      } else {
        toast({
          type: 'success',
          title: `Quota ${splitIndex}/${splitTotal} incassata`,
          message: formatPrice(amount),
        })
      }
    } catch {
      toast({ type: 'error', title: 'Errore pagamento', message: 'Riprova' })
    } finally {
      setPaying(false)
    }
  }

  const handleAddCustom = async () => {
    // Nome opzionale: se vuoto usa "Extra" (basta l'importo).
    const name = customName.trim() || 'Extra'
    const price = parseFloat(customPrice)
    const qty = Math.max(1, parseInt(customQty, 10) || 1)
    if (!(price > 0)) { toast({ type: 'warning', title: 'Inserisci un importo in €' }); return }
    setAddingItem(true)
    try {
      await ordersAPI.addCustomItem(orderId, { custom_name: name, unit_price: price, quantity: qty })
      const updatedBill = accumulateBill(await billingAPI.preConto(orderId).then(r => r.data))
      setBill(updatedBill)
      setCustomName(''); setCustomPrice(''); setCustomQty(1); setShowAddItem(false)
      toast({ type: 'success', title: 'Voce aggiunta', message: `${name} · ${formatPrice(price * qty)}` })
    } catch (e) {
      toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
    } finally {
      setAddingItem(false)
    }
  }

  // Applica uno sconto al conto come riga negativa "Sconto …". JP 2026-05-31.
  // Si appoggia ad addCustomItem (gia' riservato a cashier/admin/manager) con
  // unit_price negativo. Il backend ora accetta valori negativi per surcharge.
  const handleApplyDiscount = async () => {
    const amount = parseFloat(discountAmount)
    if (!(amount > 0)) { toast({ type: 'warning', title: 'Inserisci un importo in €' }); return }
    // Cap di sicurezza: non oltre il totale corrente (sconto > totale → totale negativo).
    const currentTotal = parseFloat(bill?.total_amount || 0)
    if (amount > currentTotal) {
      if (!window.confirm(`Lo sconto (${amount.toFixed(2)} €) e' superiore al totale (${currentTotal.toFixed(2)} €). Continuare lo stesso?`)) return
    }
    const reason = (discountReason || '').trim()
    const label = reason ? `Sconto · ${reason}`.slice(0, 120) : 'Sconto'
    setApplyingDiscount(true)
    try {
      await ordersAPI.addCustomItem(orderId, { custom_name: label, unit_price: -amount, quantity: 1 })
      const updatedBill = accumulateBill(await billingAPI.preConto(orderId).then(r => r.data))
      setBill(updatedBill)
      setDiscountAmount(''); setDiscountReason(''); setShowDiscount(false)
      toast({ type: 'success', title: 'Sconto applicato', message: `-${formatPrice(amount)}` })
    } catch (e) {
      toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
    } finally {
      setApplyingDiscount(false)
    }
  }

  // Tap su un prezzo nel conto per modificarlo direttamente. JP 2026-05-31.
  // L'utente scrive il NUOVO TOTALE per la riga (subtotale del gruppo); il
  // sistema calcola il unit_price = nuovoTotale / qty_totale e lo applica a
  // tutti gli order_items sottostanti del gruppo.
  const startEditPrice = (item) => {
    setEditingPriceFor(item.id)
    setEditPriceInput(String(parseFloat(item.subtotal).toFixed(2)))
  }
  const cancelEditPrice = () => {
    setEditingPriceFor(null); setEditPriceInput('')
  }
  const applyPriceEdit = async (item) => {
    const newSubtotal = parseFloat(editPriceInput)
    if (!Number.isFinite(newSubtotal)) {
      toast({ type: 'warning', title: 'Inserisci un importo valido' }); return
    }
    if (newSubtotal < 0) {
      toast({ type: 'warning', title: 'Il prezzo non puo’ essere negativo' }); return
    }
    const totalQty = Number(item.quantity) || 1
    const newUnitPrice = Math.round((newSubtotal / totalQty) * 100) / 100
    const ids = Array.isArray(item.ids) && item.ids.length ? item.ids : [item.id]
    setEditingPrice(true)
    try {
      // Applica il nuovo unit_price a tutti gli order_items sottostanti.
      for (const id of ids) {
        await ordersAPI.setItemPrice(orderId, id, newUnitPrice)
      }
      const updatedBill = accumulateBill(await billingAPI.preConto(orderId).then(r => r.data))
      setBill(updatedBill)
      cancelEditPrice()
      toast({ type: 'success', title: 'Prezzo aggiornato', message: `${item.item_name} · ${formatPrice(newSubtotal)}` })
    } catch (e) {
      toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
    } finally {
      setEditingPrice(false)
    }
  }

  // Togli un piatto dal conto. Admin/manager: diretto. Cassa/cameriere: PIN responsabile.
  const removeBillItem = async (item) => {
    // item ora e' un GRUPPO accumulato (ids[] = voci sottostanti). Togliamo
    // 1 unita' alla volta: rimuoviamo l'ultimo id del gruppo (x3 -> x2 -> ...).
    const groupIds = Array.isArray(item.ids) && item.ids.length ? item.ids : [item.id]
    const targetId = groupIds[groupIds.length - 1]
    const msg = groupIds.length > 1
      ? `Togliere 1 di "${item.item_name}" dal conto? (restano ${groupIds.length - 1})`
      : `Togliere "${item.item_name}" dal conto?`
    if (!window.confirm(msg)) return
    let override
    if (!['admin', 'manager'].includes(user?.role)) {
      const pin = window.prompt('PIN del responsabile per togliere il piatto:')
      if (!pin) return
      override = { pin, reason: 'Rimozione dal conto (cassa)' }
    }
    try {
      await ordersAPI.cancelItem(orderId, targetId, override)
      const updated = accumulateBill(await billingAPI.preConto(orderId).then(r => r.data))
      setBill(updated)
      toast({ type: 'success', title: 'Piatto tolto dal conto', message: item.item_name })
    } catch (e) {
      toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
    }
  }

  // Aggiungi +1 a una voce del conto. JP 2026-05-29: "se si e' aggiunta una
  // persona dopo devo aggiungerlo dal x1 a x2, fallo modificabile".
  //  - Coperto / voce a prezzo libero (surcharge): aggiunge un'altra unita'
  //    come surcharge (NON va in cucina). Si accumula a x N+1.
  //  - Piatto vero (menu_item_id): lo ri-manda (va in cucina come nuovo piatto
  //    per la persona aggiunta).
  const addOneBillItem = async (item) => {
    try {
      if (item.is_surcharge || !item.menu_item_id) {
        await ordersAPI.addCustomItem(orderId, {
          custom_name: item.item_name,
          unit_price: parseFloat(item.unit_price) || 0,
          quantity: 1,
        })
      } else {
        await ordersAPI.addItems(orderId, [{ menu_item_id: item.menu_item_id, quantity: 1 }])
      }
      const updated = accumulateBill(await billingAPI.preConto(orderId).then(r => r.data))
      setBill(updated)
      toast({ type: 'success', title: 'Aggiunto', message: `+1 ${item.item_name}` })
    } catch (e) {
      toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
    }
  }

  // Invia scontrino al cliente via link condivisibile (WhatsApp/SMS/Mail).
  // JP 2026-05-29. Usa Web Share API (menu di condivisione nativo del tablet);
  // fallback desktop: copia il link negli appunti.
  const shareReceipt = async () => {
    const rid = finalReceipt?.receipt?.id
    if (!rid) { toast({ type: 'error', title: 'Scontrino non disponibile' }); return }
    const url = `${window.location.origin}/receipt/${rid}`
    const shareData = {
      title: 'Scontrino',
      text: `Ecco il tuo scontrino da ${finalReceipt?.bill?.tenant?.name || 'Riva Beach'} 🧾`,
      url,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(url)
        toast({ type: 'success', title: 'Link copiato', message: 'Incollalo su WhatsApp / SMS / Mail' })
      }
    } catch (e) {
      // L'utente ha annullato la condivisione → non è un errore.
      if (e?.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(url)
          toast({ type: 'success', title: 'Link copiato', message: 'Incollalo dove vuoi' })
        } catch {
          toast({ type: 'error', title: 'Impossibile condividere', message: url })
        }
      }
    }
  }

  // ── Done splash con RICEVUTA STAMPABILE ───────────────────
  if (done && finalReceipt) {
    return (
      <div className="min-h-screen flex flex-col items-center py-6 px-3 gap-4">
        {/* Header celebrativo (nascosto in stampa via .no-print) */}
        <div className="no-print flex flex-col items-center gap-2">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
          >
            <CheckCircle2 size={56} className="text-[var(--color-ok)]" />
          </motion.div>
          <p className="serif text-[var(--color-text)] text-xl font-bold">
            Pagamento completato!
          </p>
          <p className="text-[var(--color-text-3)] text-xs">
            Stampa la ricevuta o chiudi per tornare ai tavoli
          </p>
        </div>

        {/* Anteprima ricevuta su schermo (look POS thermal) */}
        <div className="bg-white rounded-lg shadow-2xl my-2" style={{ width: 'auto' }}>
          <ReceiptPrint
            bill={finalReceipt.bill}
            payment={finalReceipt.payment}
            receipt={finalReceipt.receipt}
            cashierName={user?.name}
          />
        </div>

        {/* Pulsanti azione (nascosti in stampa) */}
        <div className="no-print flex flex-wrap justify-center gap-3 mt-2 sticky bottom-4">
          <Button
            variant="primary"
            size="lg"
            leftIcon={<Share2 size={18} />}
            onClick={shareReceipt}
            className="shadow-lg"
          >
            Invia scontrino
          </Button>
          <Button
            variant="secondary"
            size="lg"
            leftIcon={<Printer size={18} />}
            onClick={() => window.print()}
            className="shadow-lg"
          >
            Stampa
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => navigate('/tables')}
            className="shadow-lg"
          >
            Chiudi
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">

      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => navigate('/tables')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <Receipt size={17} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Cassa {bill?.table_number ? `· Tavolo ${bill.table_number}` : '· Asporto'}
        </h1>

        {/* Register switcher: cassa 1 / cassa 2 / nessuna. Persistito per device. */}
        <div className="ml-3 inline-flex items-center rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-0.5 text-[10px]">
          {['cassa_1','cassa_2'].map(r => (
            <button
              key={r}
              onClick={() => switchRegister(activeRegister === r ? null : r)}
              className={`px-2 py-1 rounded-md font-semibold transition uppercase tracking-wider ${
                activeRegister === r
                  ? 'bg-[var(--color-gold)] text-[#13181C]'
                  : 'text-[var(--color-text-3)] hover:text-[var(--color-text)]'
              }`}
              title={`Identifica questo device come ${r.replace('_', ' ')}`}
            >
              {r.replace('cassa_', 'C')}
            </button>
          ))}
        </div>

        {bill && (
          <div className="ml-auto flex items-center gap-3">
            {/* JP 2026-06-03: stampa preconto dal conto. Mette in coda sul
                backend → l'agente locale (sul Mac/RPi della LAN) prende
                il job entro ~2s e lo manda alla TP808 .24:9100. */}
            <button
              onClick={async () => {
                if (!orderId) return
                try {
                  await printAPI.enqueue('preconto', orderId)
                  toast({
                    type: 'success',
                    title: '🖨 Preconto in stampa',
                    message: 'Esce dalla .24 fra qualche secondo',
                  })
                } catch (e) {
                  toast({
                    type: 'error',
                    title: 'Errore stampa',
                    message: e?.response?.data?.error || 'Agente offline?',
                  })
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-[var(--color-gold)] text-[#13181C] font-extrabold text-sm uppercase tracking-wider flex items-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition"
              title="Stampa preconto sulla TP808 .24"
            >
              <Printer size={16} />
              Preconto
            </button>
            <span className="serif text-[var(--color-gold)] font-bold text-xl tnum">
              {formatPrice(bill.total_amount)}
            </span>
          </div>
        )}
      </header>

      {loading && (
        <div className="flex-1 flex items-center justify-center gap-2 text-[var(--color-text-2)]">
          <RefreshCw size={20} className="animate-spin text-[var(--color-gold)]" />
          <span className="text-sm">Caricamento conto…</span>
        </div>
      )}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <Badge tone="err">{error}</Badge>
        </div>
      )}

      {!loading && bill && (
        <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">

          {/* ── LEFT: itemized bill ─────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 max-w-3xl mx-auto lg:mx-0 w-full">
            <h3 className="text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider">
              Dettaglio ordine
            </h3>

            <Card padding="none" className="overflow-hidden">
              {bill.items.map((item, i) => (
                <div
                  key={item.id}
                  className={`flex items-start justify-between px-4 py-3 ${
                    i < bill.items.length - 1 ? 'border-b border-[var(--color-border-soft)]' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-[var(--color-text)] text-sm">
                      <span className="text-[var(--color-gold)] mr-1 tnum font-semibold">×{item.quantity}</span>
                      {item.item_name}
                    </span>
                    {item.modifiers?.length > 0 && (
                      <p className="text-[var(--color-text-3)] text-xs mt-0.5 truncate">
                        {item.modifiers.map(m => m.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                    {/* Prezzo cliccabile (solo cassa+): tap → input inline */}
                    {canAddCustom && editingPriceFor === item.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          autoFocus
                          value={editPriceInput}
                          onChange={e => setEditPriceInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') applyPriceEdit(item)
                            if (e.key === 'Escape') cancelEditPrice()
                          }}
                          className="w-[80px] bg-[var(--color-canvas)] border-2 border-[var(--color-gold)] rounded-md px-2 py-1 text-[var(--color-text)] text-sm font-bold text-right outline-none tnum"
                        />
                        <button
                          onClick={() => applyPriceEdit(item)}
                          disabled={editingPrice}
                          className="w-7 h-7 rounded-md bg-[var(--color-gold)] text-[#13181C] flex items-center justify-center active:scale-90 disabled:opacity-50"
                          title="Conferma"
                          aria-label="Conferma prezzo"
                        >
                          <CheckCircle2 size={16} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={cancelEditPrice}
                          className="w-7 h-7 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] flex items-center justify-center active:scale-90"
                          title="Annulla"
                          aria-label="Annulla"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => canAddCustom && startEditPrice(item)}
                        disabled={!canAddCustom}
                        className={`text-[var(--color-text)] text-sm tnum font-semibold w-[68px] text-right ${canAddCustom ? 'hover:text-[var(--color-gold)] hover:underline decoration-dotted cursor-pointer' : 'cursor-default'}`}
                        title={canAddCustom ? 'Tocca per modificare il prezzo' : ''}
                      >
                        {formatPrice(item.subtotal)}
                      </button>
                    )}
                    {canAddCustom && editingPriceFor !== item.id && (
                      <div className="flex items-center gap-1">
                        {/* − togli 1 */}
                        <button
                          onClick={() => removeBillItem(item)}
                          className="w-8 h-8 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] hover:text-[var(--color-err)] hover:border-[var(--color-err)]/60 flex items-center justify-center active:scale-90 transition"
                          title="Togli 1"
                          aria-label="Togli 1"
                        >
                          <Minus size={16} strokeWidth={2.5} />
                        </button>
                        {/* quantità corrente */}
                        <span className="text-[var(--color-gold)] font-bold tnum text-base w-7 text-center">{item.quantity}</span>
                        {/* + aggiungi 1 */}
                        <button
                          onClick={() => addOneBillItem(item)}
                          className="w-8 h-8 rounded-lg bg-[var(--color-gold-soft)] border border-[var(--color-gold-ring)] text-[var(--color-gold)] hover:bg-[var(--color-gold)] hover:text-[#13181C] flex items-center justify-center active:scale-90 transition"
                          title="Aggiungi 1"
                          aria-label="Aggiungi 1"
                        >
                          <Plus size={16} strokeWidth={2.5} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </Card>

            {/* Importo manuale (cassa): SEMPRE disponibile, grande e oro */}
            {canAddCustom && (
              !showAddItem ? (
                <button
                  onClick={() => setShowAddItem(true)}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[var(--color-gold)] text-[#13181C] text-lg font-extrabold uppercase tracking-wide hover:brightness-110 active:scale-[0.98] transition"
                >
                  <Plus size={22} strokeWidth={3} /> Aggiungi importo manuale
                </button>
              ) : (
                <Card padding="md" className="flex flex-col gap-3 border-2 border-[var(--color-gold-ring)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text)] text-base font-bold uppercase tracking-wider">
                      Aggiungi importo al conto
                    </span>
                    <button
                      onClick={() => setShowAddItem(false)}
                      className="text-[var(--color-text-3)] hover:text-[var(--color-err)] p-1"
                      aria-label="Chiudi"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* IMPORTO — campo principale, grande */}
                  <div className="flex items-center gap-2 bg-[var(--color-canvas)] border-2 border-[var(--color-border-strong)] focus-within:border-[var(--color-gold)] rounded-xl px-4 py-3">
                    <span className="text-[var(--color-gold)] text-3xl font-bold">€</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={customPrice}
                      onChange={e => setCustomPrice(e.target.value)}
                      placeholder="0,00"
                      autoFocus
                      className="w-full bg-transparent text-[var(--color-text)] text-4xl font-extrabold text-right outline-none tnum"
                    />
                  </div>

                  {/* Descrizione opzionale + quantita' */}
                  <div className="flex items-center gap-2">
                    <input
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      placeholder="Descrizione (opzionale)"
                      className="flex-1 bg-[var(--color-canvas)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] rounded-lg px-3 py-2.5 text-[var(--color-text)] text-base outline-none transition"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCustomQty(q => Math.max(1, q - 1))}
                        className="w-10 h-10 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] flex items-center justify-center"
                        aria-label="Diminuisci"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-8 text-center text-[var(--color-text)] font-bold text-xl tnum">{customQty}</span>
                      <button
                        onClick={() => setCustomQty(q => q + 1)}
                        className="w-10 h-10 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text-2)] flex items-center justify-center"
                        aria-label="Aumenta"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    fullWidth
                    loading={addingItem}
                    disabled={!(parseFloat(customPrice) > 0)}
                    leftIcon={<Plus size={18} />}
                    onClick={handleAddCustom}
                  >
                    Aggiungi al conto{parseFloat(customPrice) > 0 ? ` · ${formatPrice(parseFloat(customPrice) * customQty)}` : ''}
                  </Button>
                </Card>
              )
            )}

            {/* APPLICA SCONTO — JP 2026-05-31: voce negativa nel conto. */}
            {canAddCustom && (
              !showDiscount ? (
                <button
                  onClick={() => setShowDiscount(true)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--color-err-soft)] border-2 border-[var(--color-err)]/50 text-[var(--color-err)] text-base font-extrabold uppercase tracking-wide hover:brightness-110 active:scale-[0.98] transition"
                >
                  <Minus size={20} strokeWidth={3} /> Applica sconto
                </button>
              ) : (
                <Card padding="md" className="flex flex-col gap-3 border-2 border-[var(--color-err)]/60">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text)] text-base font-bold uppercase tracking-wider">
                      Applica sconto
                    </span>
                    <button
                      onClick={() => { setShowDiscount(false); setDiscountAmount(''); setDiscountReason('') }}
                      className="text-[var(--color-text-3)] hover:text-[var(--color-err)] p-1"
                      aria-label="Chiudi"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Importo sconto in € */}
                  <div className="flex items-center gap-2 bg-[var(--color-canvas)] border-2 border-[var(--color-border-strong)] focus-within:border-[var(--color-err)] rounded-xl px-4 py-3">
                    <span className="text-[var(--color-err)] text-3xl font-bold">-€</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={discountAmount}
                      onChange={e => setDiscountAmount(e.target.value)}
                      placeholder="0,00"
                      autoFocus
                      className="w-full bg-transparent text-[var(--color-text)] text-4xl font-extrabold text-right outline-none tnum"
                    />
                  </div>

                  {/* Motivo opzionale (es. "cliente abituale") */}
                  <input
                    value={discountReason}
                    onChange={e => setDiscountReason(e.target.value)}
                    placeholder="Motivo (opzionale, es. cliente abituale)"
                    className="bg-[var(--color-canvas)] border border-[var(--color-border-strong)] focus:border-[var(--color-err)] rounded-lg px-3 py-2.5 text-[var(--color-text)] text-base outline-none transition"
                  />

                  <Button
                    size="lg"
                    fullWidth
                    loading={applyingDiscount}
                    disabled={!(parseFloat(discountAmount) > 0)}
                    leftIcon={<Minus size={18} />}
                    onClick={handleApplyDiscount}
                  >
                    Applica sconto{parseFloat(discountAmount) > 0 ? ` · -${formatPrice(parseFloat(discountAmount))}` : ''}
                  </Button>
                </Card>
              )
            )}

            {/* Totals */}
            <Card padding="none" className="overflow-hidden">
              <div className="flex justify-between px-4 py-2 border-b border-[var(--color-border-soft)]">
                <span className="text-[var(--color-text-2)] text-sm">Imponibile</span>
                <span className="text-[var(--color-text)] text-sm tnum">{formatPrice(bill.subtotal)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 border-b border-[var(--color-border-soft)]">
                <span className="text-[var(--color-text-2)] text-sm">IVA</span>
                <span className="text-[var(--color-text)] text-sm tnum">{formatPrice(bill.tax_amount)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-[var(--color-surface-2)]">
                <span className="serif text-[var(--color-text)] font-bold">Totale</span>
                <span className="serif text-[var(--color-gold)] font-bold text-2xl tnum">
                  {formatPrice(bill.total_amount)}
                </span>
              </div>
            </Card>
          </div>

          {/* ── RIGHT: payment panel ─────────────────────── */}
          <div className="lg:w-96 bg-[var(--color-surface)] border-t lg:border-t-0 lg:border-l border-[var(--color-border-soft)] flex flex-col overflow-hidden">

            {/* Mode tabs */}
            <div className="grid grid-cols-4 border-b border-[var(--color-border-soft)]">
              {SPLIT_MODES.map(m => {
                const Icon = m.icon
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`flex flex-col items-center gap-1 py-3 transition text-[10px] font-semibold
                      ${mode === m.id
                        ? 'text-[var(--color-gold)] border-b-2 border-[var(--color-gold)] bg-[var(--color-gold-soft)]/40'
                        : 'text-[var(--color-text-3)] hover:text-[var(--color-text-2)]'
                      }`}
                  >
                    <Icon size={14} />
                    {m.label}
                  </button>
                )
              })}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                >

                  {mode === 'single' && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[var(--color-text-2)] text-xs uppercase tracking-wider font-semibold">
                        Metodo di pagamento
                      </p>
                      <MethodPicker value={method} onChange={setMethod} />
                      <div className="flex flex-col gap-2 mt-2">
                        <Button
                          fullWidth
                          size="lg"
                          loading={paying}
                          disabled={!method}
                          leftIcon={<CheckCircle2 size={16} />}
                          onClick={() => handlePay(bill.total_amount, false, 1, 1, method)}
                        >
                          Incassa {formatPrice(bill.total_amount)}
                        </Button>
                        {/* SumUp deep-link — apre app SumUp su tablet/phone */}
                        <a
                          href={`sumupmerchant://pay?amount=${bill.total_amount.toFixed(2)}&currency=EUR&title=GustoPro%20Tavolo%20${bill.table_number ?? ''}&foreign-transaction-id=${orderId}`}
                          onClick={() => { setMethod('card') }}
                          className="w-full py-2.5 rounded-xl border-2 border-[var(--color-sea)]/50 text-[var(--color-sea)] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--color-sea-soft)] transition"
                        >
                          <Zap size={15} /> Paga con SumUp
                        </a>
                      </div>
                    </div>
                  )}

                  {mode === 'equal' && (
                    <SplitEqual bill={bill} onPay={handlePay} paying={paying} />
                  )}

                  {mode === 'byitem' && (
                    <SplitByItem bill={bill} onPay={handlePay} paying={paying} />
                  )}

                  {mode === 'custom' && (
                    <SplitCustom bill={bill} onPay={handlePay} paying={paying} />
                  )}

                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
