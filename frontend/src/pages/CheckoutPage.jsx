import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Banknote, CreditCard, Smartphone, Receipt, RefreshCw,
  CheckCircle2, Users, SplitSquareVertical, Pencil, Plus, Minus, X,
} from 'lucide-react'
import { billingAPI, tablesAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'
import { useToast } from '../context/ToastContext'

// ─── Constants ──────────────────────────────────────────────
const PAY_METHODS = [
  { id: 'cash',    label: 'Contanti', icon: Banknote,    cls: 'emerald' },
  { id: 'card',    label: 'Carta',    icon: CreditCard,  cls: 'blue'    },
  { id: 'digital', label: 'Digitale', icon: Smartphone,  cls: 'purple'  },
]
const PERSON_COLORS = ['#D4AF37','#60A5FA','#34D399','#F87171','#A78BFA','#FB923C']

const clsMap = {
  emerald: 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10',
  blue:    'border-blue-500/60    text-blue-400    bg-blue-500/10',
  purple:  'border-purple-500/60  text-purple-400   bg-purple-500/10',
}

// ─── MethodPicker ────────────────────────────────────────────
function MethodPicker({ value, onChange, small = false }) {
  return (
    <div className={`grid grid-cols-3 gap-1.5 ${small ? '' : 'gap-2'}`}>
      {PAY_METHODS.map(m => {
        const Icon = m.icon
        const active = value === m.id
        return (
          <button key={m.id} onClick={() => onChange(m.id)}
            className={`rounded-xl border-2 transition flex flex-col items-center justify-center gap-1
              ${small ? 'py-2' : 'py-3'}
              ${active ? clsMap[m.cls] + ' border-opacity-100' : 'border-[#3A3A3A] text-[#555] hover:text-[#888] hover:border-[#555]'}`}>
            <Icon size={small ? 14 : 18} />
            <span className={`font-medium ${small ? 'text-[10px]' : 'text-xs'}`}>{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── SplitEqual ──────────────────────────────────────────────
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
      <div className="bg-[#2A2A2A] rounded-xl p-3 flex flex-col gap-2">
        <p className="text-[#888] text-xs">Numero di persone</p>
        <div className="flex items-center gap-3 justify-center">
          <button onClick={() => setCount(c => Math.max(2, c - 1))}
            disabled={paid > 0}
            className="w-8 h-8 rounded-lg bg-[#333] text-[#888] hover:text-[#F5F5DC] text-lg flex items-center justify-center disabled:opacity-30">
            <Minus size={14} />
          </button>
          <span className="text-[#F5F5DC] font-bold text-2xl w-10 text-center">{count}</span>
          <button onClick={() => setCount(c => Math.min(10, c + 1))}
            disabled={paid > 0}
            className="w-8 h-8 rounded-lg bg-[#333] text-[#888] hover:text-[#F5F5DC] text-lg flex items-center justify-center disabled:opacity-30">
            <Plus size={14} />
          </button>
        </div>
        <p className="text-[#D4AF37] text-sm text-center font-semibold">
          {formatPrice(perPart)} a persona
        </p>
        {/* Dots progress */}
        <div className="flex justify-center gap-1.5 mt-1">
          {[...Array(count)].map((_, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${i < paid ? 'bg-emerald-500' : 'bg-[#444]'}`} />
          ))}
        </div>
        <p className="text-[#555] text-[10px] text-center">{paid}/{count} pagato</p>
      </div>

      {/* Pending parts */}
      <div className="flex flex-col gap-2">
        {[...Array(count - paid)].map((_, i) => {
          const idx = paid + i
          return (
            <div key={idx} className="bg-[#2A2A2A] rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-[#1A1A1A]"
                  style={{ backgroundColor: PERSON_COLORS[idx % PERSON_COLORS.length] }}>
                  {idx + 1}
                </div>
                <span className="text-[#888] text-xs">Persona {idx + 1} · {formatPrice(perPart)}</span>
              </div>
              <MethodPicker small value={methods[idx]} onChange={m => setMethods(p => ({ ...p, [idx]: m }))} />
              <button onClick={() => handlePartPay(idx)}
                disabled={paying || !methods[idx]}
                className="w-full py-2 rounded-lg bg-[#D4AF37] text-[#1A1A1A] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-30 hover:bg-[#c9a42e] transition">
                {paying ? <RefreshCw size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> Incassa {formatPrice(perPart)}</>}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── SplitByItem ─────────────────────────────────────────────
function SplitByItem({ bill, onPay, paying }) {
  const [personCount, setPersonCount] = useState(2)
  const [assignments, setAssignments] = useState({})  // itemId → personIdx (0-based)
  const [methods, setMethods] = useState({})           // personIdx → payMethod
  const [paid, setPaid] = useState(new Set())

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
    const total = bill.items.reduce((sum, item) => {
      if (assignments[item.id] === pi) return sum + parseFloat(item.subtotal)
      return sum
    }, 0)
    return parseFloat(total.toFixed(2))
  })

  const unassignedTotal = bill.items.reduce((sum, item) => {
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
      <div className="flex items-center justify-between bg-[#2A2A2A] rounded-xl px-4 py-2.5">
        <span className="text-[#888] text-xs">Persone</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPersonCount(c => Math.max(2, c - 1))}
            className="w-6 h-6 rounded-lg bg-[#333] text-[#888] flex items-center justify-center">
            <Minus size={12} />
          </button>
          <span className="text-[#F5F5DC] font-bold text-sm w-5 text-center">{personCount}</span>
          <button onClick={() => setPersonCount(c => Math.min(PERSON_COLORS.length, c + 1))}
            className="w-6 h-6 rounded-lg bg-[#333] text-[#888] flex items-center justify-center">
            <Plus size={12} />
          </button>
        </div>
      </div>

      <p className="text-[#555] text-[10px] text-center">Tocca un piatto per assegnarlo a una persona</p>

      {/* Items assignment */}
      <div className="bg-[#2A2A2A] rounded-xl overflow-hidden">
        {bill.items.map((item, i) => {
          const pi = assignments[item.id]
          const color = pi !== undefined ? PERSON_COLORS[pi % PERSON_COLORS.length] : '#444'
          return (
            <button key={item.id} onClick={() => toggleAssign(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition
                ${i < bill.items.length - 1 ? 'border-b border-[#333]' : ''}
                ${pi !== undefined ? 'bg-[#252525]' : 'hover:bg-[#222]'}`}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-[#1A1A1A] transition-colors"
                  style={{ backgroundColor: color }}>
                  {pi !== undefined ? pi + 1 : '?'}
                </div>
                <span className="text-[#F5F5DC] text-xs truncate">
                  ×{item.quantity} {item.item_name}
                </span>
              </div>
              <span className="text-[#888] text-xs ml-2 flex-shrink-0">{formatPrice(item.subtotal)}</span>
            </button>
          )
        })}
      </div>

      {unassignedTotal > 0 && (
        <p className="text-amber-400 text-[10px] text-center">
          {formatPrice(unassignedTotal)} non assegnati
        </p>
      )}

      {/* Per-person pay */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: personCount }, (_, pi) => {
          if (paid.has(pi)) {
            return (
              <div key={pi} className="flex items-center gap-2 px-3 py-2 bg-emerald-900/20 border border-emerald-700/30 rounded-xl">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-emerald-400 text-xs">Persona {pi + 1} — pagato {formatPrice(personTotals[pi])}</span>
              </div>
            )
          }
          if (personTotals[pi] === 0) return null
          return (
            <div key={pi} className="bg-[#2A2A2A] rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-[#1A1A1A]"
                  style={{ backgroundColor: PERSON_COLORS[pi % PERSON_COLORS.length] }}>
                  {pi + 1}
                </div>
                <span className="text-[#888] text-xs">Persona {pi + 1} · {formatPrice(personTotals[pi])}</span>
              </div>
              <MethodPicker small value={methods[pi]} onChange={m => setMethods(p => ({ ...p, [pi]: m }))} />
              <button onClick={() => handlePersonPay(pi)}
                disabled={paying || !methods[pi]}
                className="w-full py-2 rounded-lg bg-[#D4AF37] text-[#1A1A1A] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-30 hover:bg-[#c9a42e] transition">
                {paying ? <RefreshCw size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> Incassa {formatPrice(personTotals[pi])}</>}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── SplitCustom ─────────────────────────────────────────────
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
      <div className={`rounded-xl px-4 py-2.5 flex justify-between items-center
        ${Math.abs(remaining) < 0.01 ? 'bg-emerald-900/20 border border-emerald-700/30' : 'bg-[#2A2A2A]'}`}>
        <span className="text-[#888] text-xs">Rimanente</span>
        <span className={`font-bold text-sm ${remaining > 0.01 ? 'text-amber-400' : remaining < -0.01 ? 'text-red-400' : 'text-emerald-400'}`}>
          {formatPrice(Math.abs(remaining))} {remaining < -0.01 ? 'in eccesso' : ''}
        </span>
      </div>

      {/* People list */}
      <div className="flex flex-col gap-2">
        {people.map((p, i) => {
          if (paid.has(i)) {
            return (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-emerald-900/20 border border-emerald-700/30 rounded-xl">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-emerald-400 text-xs">{p.name} — pagato {formatPrice(parseFloat(p.amount))}</span>
              </div>
            )
          }
          return (
            <div key={i} className="bg-[#2A2A2A] rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-[#1A1A1A]"
                  style={{ backgroundColor: PERSON_COLORS[i % PERSON_COLORS.length] }}>
                  {i + 1}
                </div>
                <input value={p.name} onChange={e => update(i, 'name', e.target.value)}
                  className="flex-1 bg-transparent text-[#F5F5DC] text-xs outline-none border-b border-[#444] pb-0.5" />
                {people.length > 2 && (
                  <button onClick={() => removePerson(i)} className="text-[#444] hover:text-red-400 transition">
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#555] text-xs">€</span>
                <input type="number" value={p.amount} onChange={e => update(i, 'amount', e.target.value)}
                  placeholder="0.00" step="0.01" min="0"
                  className="flex-1 bg-[#1A1A1A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-sm text-right outline-none focus:border-[#D4AF37]/60 transition" />
              </div>
              <MethodPicker small value={p.method} onChange={m => update(i, 'method', m)} />
              <button onClick={() => handlePersonPay(i)}
                disabled={paying || !p.method || !parseFloat(p.amount)}
                className="w-full py-2 rounded-lg bg-[#D4AF37] text-[#1A1A1A] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-30 hover:bg-[#c9a42e] transition">
                {paying ? <RefreshCw size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> Incassa {p.amount ? formatPrice(parseFloat(p.amount)) : '—'}</>}
              </button>
            </div>
          )
        })}
      </div>

      <button onClick={addPerson}
        className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-[#3A3A3A] text-[#555] hover:text-[#888] hover:border-[#555] text-xs transition">
        <Plus size={12} /> Aggiungi persona
      </button>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
const SPLIT_MODES = [
  { id: 'single',   label: 'Intero',     icon: Receipt              },
  { id: 'equal',    label: 'Quote uguali', icon: Users              },
  { id: 'byitem',   label: 'Per piatto', icon: SplitSquareVertical  },
  { id: 'custom',   label: 'Libero',     icon: Pencil               },
]

export default function CheckoutPage() {
  const { orderId } = useParams()
  const navigate    = useNavigate()
  const { toast }   = useToast()

  const [bill, setBill]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)
  const [mode, setMode]     = useState('single')
  const [method, setMethod] = useState(null)
  const [paying, setPaying] = useState(false)
  const [done, setDone]     = useState(false)

  useEffect(() => {
    billingAPI.preConto(orderId)
      .then(r => setBill(r.data))
      .catch(() => setError('Ordine non trovato'))
      .finally(() => setLoading(false))
  }, [orderId])

  const freeTable = async () => {
    try {
      const tableRes = await tablesAPI.list()
      const table = tableRes.data.find(t => t.active_order_id === orderId)
      if (table) await tablesAPI.setStatus(table.id, 'dirty').catch(() => {})
    } catch {}
  }

  const handlePay = async (amount, isSplit = false, splitIndex = 1, splitTotal = 1, payMethod = method) => {
    if (!payMethod) return
    setPaying(true)
    try {
      const res = await billingAPI.pay({
        order_id: orderId,
        amount,
        payment_method: payMethod,
        is_split: isSplit,
        split_index: splitIndex,
        split_total: splitTotal,
      })

      const updatedBill = await billingAPI.preConto(orderId).then(r => r.data)
      setBill(updatedBill)

      if (updatedBill.payment_status === 'paid') {
        await freeTable()
        setDone(true)
        setTimeout(() => navigate('/tables'), 2200)
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

  // ── Done screen
  if (done) {
    return (
      <div className="min-h-screen bg-[#1A1A1A] flex flex-col items-center justify-center gap-4">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
          <CheckCircle2 size={72} className="text-emerald-400" />
        </motion.div>
        <p className="text-[#F5F5DC] text-xl font-semibold">Pagamento completato!</p>
        <p className="text-[#888] text-sm">Tavolo liberato — ritorno alla mappa…</p>
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
        <Receipt size={17} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-semibold text-sm">
          Cassa — {bill?.table_number ? `Tavolo ${bill.table_number}` : 'Asporto'}
        </span>
        {bill && (
          <span className="ml-auto text-[#D4AF37] font-bold">{formatPrice(bill.total_amount)}</span>
        )}
      </header>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw size={20} className="animate-spin text-[#555]" />
        </div>
      )}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!loading && bill && (
        <div className="flex flex-1 overflow-hidden">

          {/* ── LEFT: Itemized bill ── */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
            <h3 className="text-[#888] text-xs font-medium uppercase tracking-wider">Dettaglio ordine</h3>

            <div className="bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
              {bill.items.map((item, i) => (
                <div key={item.id}
                  className={`flex items-start justify-between px-4 py-3 ${i < bill.items.length - 1 ? 'border-b border-[#2E2E2E]' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <span className="text-[#F5F5DC] text-sm">
                      <span className="text-[#D4AF37] mr-1">×{item.quantity}</span>
                      {item.item_name}
                    </span>
                    {item.modifiers?.length > 0 && (
                      <p className="text-[#555] text-xs mt-0.5 truncate">{item.modifiers.map(m => m.name).join(', ')}</p>
                    )}
                  </div>
                  <span className="text-[#F5F5DC] text-sm ml-4 flex-shrink-0">{formatPrice(item.subtotal)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
              <div className="flex justify-between px-4 py-2 border-b border-[#2E2E2E]">
                <span className="text-[#888] text-sm">Imponibile</span>
                <span className="text-[#F5F5DC] text-sm">{formatPrice(bill.subtotal)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 border-b border-[#2E2E2E]">
                <span className="text-[#888] text-sm">IVA</span>
                <span className="text-[#F5F5DC] text-sm">{formatPrice(bill.tax_amount)}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-[#F5F5DC] font-bold">Totale</span>
                <span className="text-[#D4AF37] font-bold text-lg">{formatPrice(bill.total_amount)}</span>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Payment panel ── */}
          <div className="w-80 bg-[#222] border-l border-[#3A3A3A] flex flex-col overflow-hidden">

            {/* Mode tabs */}
            <div className="grid grid-cols-4 border-b border-[#3A3A3A]">
              {SPLIT_MODES.map(m => {
                const Icon = m.icon
                return (
                  <button key={m.id} onClick={() => setMode(m.id)}
                    className={`flex flex-col items-center gap-1 py-2.5 transition text-[10px] font-medium
                      ${mode === m.id
                        ? 'text-[#D4AF37] border-b-2 border-[#D4AF37] bg-[#252525]'
                        : 'text-[#555] hover:text-[#888]'}`}>
                    <Icon size={14} />
                    {m.label}
                  </button>
                )
              })}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                <motion.div key={mode}
                  initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}>

                  {mode === 'single' && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[#888] text-xs uppercase tracking-wider font-medium">Metodo di pagamento</p>
                      <MethodPicker value={method} onChange={setMethod} />
                      <div className="mt-2">
                        <motion.button
                          onClick={() => handlePay(bill.total_amount, false, 1, 1, method)}
                          disabled={paying || !method}
                          whileTap={{ scale: 0.97 }}
                          className="w-full py-3.5 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold flex items-center justify-center gap-2 disabled:opacity-30 hover:bg-[#c9a42e] transition">
                          {paying
                            ? <RefreshCw size={16} className="animate-spin" />
                            : <><CheckCircle2 size={16} /> Incassa {formatPrice(bill.total_amount)}</>}
                        </motion.button>
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
