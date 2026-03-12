import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Banknote, CreditCard, Split, RefreshCw, CheckCircle2, Receipt } from 'lucide-react'
import { billingAPI, tablesAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'

const METHODS = [
  { id: 'cash',  label: 'Contanti', icon: Banknote,    color: 'border-emerald-500/50 hover:border-emerald-400 text-emerald-400' },
  { id: 'card',  label: 'Carta',    icon: CreditCard,  color: 'border-blue-500/50    hover:border-blue-400    text-blue-400' },
  { id: 'split', label: 'Misto',    icon: Split,       color: 'border-purple-500/50  hover:border-purple-400  text-purple-400' },
]

export default function CheckoutPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()

  const [bill, setBill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [method, setMethod] = useState(null)
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  // Split state
  const [splitCount, setSplitCount] = useState(2)
  const [splitPaid, setSplitPaid] = useState(0)

  useEffect(() => {
    billingAPI.preConto(orderId)
      .then(res => setBill(res.data))
      .catch(() => setError('Ordine non trovato'))
      .finally(() => setLoading(false))
  }, [orderId])

  const handlePay = async (amount, isSplit = false, splitIndex = 1, splitTotal = 1) => {
    if (!method || method === 'split') return
    setPaying(true)
    setError(null)
    try {
      await billingAPI.pay({
        order_id: orderId,
        amount,
        payment_method: method,
        is_split: isSplit,
        split_index: splitIndex,
        split_total: splitTotal,
      })

      if (!isSplit || splitIndex === splitTotal) {
        // Free the table
        const tablesRes = await tablesAPI.list()
        const table = tablesRes.data.find(t => t.active_order_id === orderId)
        if (table) await tablesAPI.setStatus(table.id, 'free').catch(() => {})
        setDone(true)
        setTimeout(() => navigate('/tables'), 2000)
      } else {
        setSplitPaid(splitIndex)
        setBill(prev => ({ ...prev, total_amount: prev.total_amount - amount }))
      }
    } catch {
      setError('Errore pagamento. Riprova.')
    } finally {
      setPaying(false)
    }
  }

  const splitAmount = bill ? parseFloat((bill.total_amount / splitCount).toFixed(2)) : 0

  if (done) {
    return (
      <div className="min-h-screen bg-[#1A1A1A] flex flex-col items-center justify-center gap-4">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
          <CheckCircle2 size={64} className="text-emerald-400" />
        </motion.div>
        <p className="text-[#F5F5DC] text-xl font-semibold">Pagamento completato!</p>
        <p className="text-[#888] text-sm">Tavolo liberato — ritorno alla mappa...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">

      {/* Header */}
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/tables')}
          className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={20} />
        </button>
        <Receipt size={18} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-semibold text-sm">
          Cassa — Tavolo {bill?.table_number ?? '...'}
        </span>
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

          {/* LEFT: Itemized bill */}
          <div className="flex-1 overflow-y-auto p-5">
            <h3 className="text-[#888] text-xs font-medium uppercase tracking-wider mb-3">Dettaglio ordine</h3>
            <div className="bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
              {bill.items.map((item, i) => (
                <div key={item.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i < bill.items.length - 1 ? 'border-b border-[#2E2E2E]' : ''
                  }`}>
                  <div className="flex-1">
                    <span className="text-[#F5F5DC] text-sm">
                      <span className="text-[#D4AF37] mr-1">×{item.quantity}</span>
                      {item.item_name}
                    </span>
                    {item.modifiers?.length > 0 && (
                      <p className="text-[#555] text-xs mt-0.5">
                        {item.modifiers.map(m => m.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="text-[#F5F5DC] text-sm ml-4">{formatPrice(item.subtotal)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-4 bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
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

          {/* RIGHT: Payment */}
          <div className="w-72 bg-[#222] border-l border-[#3A3A3A] flex flex-col p-4 gap-4">
            <h3 className="text-[#888] text-xs font-medium uppercase tracking-wider">Metodo di pagamento</h3>

            {/* Method selector */}
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(m => {
                const Icon = m.icon
                return (
                  <button key={m.id} onClick={() => setMethod(m.id)}
                    className={`rounded-xl border-2 py-3 flex flex-col items-center gap-1.5 transition ${
                      method === m.id
                        ? m.color + ' bg-[#2A2A2A]'
                        : 'border-[#3A3A3A] text-[#555] hover:text-[#888]'
                    }`}>
                    <Icon size={18} />
                    <span className="text-xs font-medium">{m.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Split options */}
            <AnimatePresence>
              {method === 'split' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="bg-[#2A2A2A] rounded-xl p-3 flex flex-col gap-3 overflow-hidden">
                  <p className="text-[#888] text-xs">Dividi in quante parti?</p>
                  <div className="flex items-center gap-3 justify-center">
                    <button onClick={() => setSplitCount(c => Math.max(2, c - 1))}
                      className="w-8 h-8 rounded-lg bg-[#333] text-[#888] hover:text-[#F5F5DC] text-lg flex items-center justify-center">−</button>
                    <span className="text-[#F5F5DC] font-bold text-xl w-8 text-center">{splitCount}</span>
                    <button onClick={() => setSplitCount(c => Math.min(10, c + 1))}
                      className="w-8 h-8 rounded-lg bg-[#333] text-[#888] hover:text-[#F5F5DC] text-lg flex items-center justify-center">+</button>
                  </div>
                  <p className="text-[#D4AF37] text-sm text-center font-semibold">
                    {formatPrice(splitAmount)} a persona
                  </p>
                  <p className="text-[#555] text-xs text-center">
                    {splitPaid}/{splitCount} già pagato
                  </p>

                  {/* Per-split payment buttons */}
                  <div className="flex flex-col gap-2 mt-1">
                    {[...Array(splitCount - splitPaid)].map((_, i) => {
                      const idx = splitPaid + i + 1
                      return (
                        <div key={idx} className="flex gap-2">
                          <button onClick={() => { setMethod('cash'); }}
                            className="flex-1 py-2 rounded-lg bg-emerald-700/30 border border-emerald-600/40 text-emerald-400 text-xs hover:bg-emerald-700/50 transition">
                            Contanti
                          </button>
                          <button onClick={() => { setMethod('card'); }}
                            className="flex-1 py-2 rounded-lg bg-blue-700/30 border border-blue-600/40 text-blue-400 text-xs hover:bg-blue-700/50 transition">
                            Carta
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-auto flex flex-col gap-3">
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}

              <div className="flex justify-between items-center">
                <span className="text-[#888] text-sm">Da pagare</span>
                <span className="text-[#D4AF37] font-bold text-xl">{formatPrice(bill.total_amount)}</span>
              </div>

              {method && method !== 'split' && (
                <motion.button
                  onClick={() => handlePay(bill.total_amount)}
                  disabled={paying}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-[#c9a42e] transition">
                  {paying
                    ? <RefreshCw size={16} className="animate-spin" />
                    : <><CheckCircle2 size={16} /> Incassa {formatPrice(bill.total_amount)}</>
                  }
                </motion.button>
              )}

              {method === 'split' && splitPaid < splitCount && (
                <motion.button
                  onClick={() => handlePay(splitAmount, true, splitPaid + 1, splitCount)}
                  disabled={paying || !['cash','card'].includes(method)}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-purple-500 transition">
                  {paying
                    ? <RefreshCw size={16} className="animate-spin" />
                    : <>Incassa quota {splitPaid + 1}/{splitCount} · {formatPrice(splitAmount)}</>
                  }
                </motion.button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
