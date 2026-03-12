import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Package, Truck, ClipboardList, Trash2,
  Plus, Search, ChevronRight, Check, AlertTriangle,
  RefreshCw, Barcode, X
} from 'lucide-react'
import { inventoryAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'

const TABS = [
  { id: 'kpis',       label: 'Panoramica',  icon: Package },
  { id: 'po',         label: 'Ordini PO',   icon: ClipboardList },
  { id: 'receipts',   label: 'Ricevimenti', icon: Truck },
  { id: 'spoilage',   label: 'Scarti',      icon: Trash2 },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function formatDatetime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ── KPI CARDS ────────────────────────────────────────────────
function KpisTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    inventoryAPI.kpis()
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />
  if (!data) return null

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Discrepanza media" value={`${data.avg_discrepancy_pct?.toFixed(1)}%`}
          color={data.avg_discrepancy_pct > 5 ? 'text-red-400' : 'text-emerald-400'} />
        <StatCard label="Perdite settimana" value={formatPrice(data.loss_week)}
          color="text-amber-400" />
        <StatCard label="Scarti oggi" value={formatPrice(data.spoilage_today)}
          color="text-orange-400" />
        <StatCard label="Scarti settimana" value={formatPrice(data.spoilage_week)}
          color="text-red-400" />
      </div>

      {/* Top loss items */}
      {data.top_loss_items?.length > 0 && (
        <div className="bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#3A3A3A]">
            <h3 className="text-[#F5F5DC] text-sm font-semibold">Top 5 articoli con perdite (30 giorni)</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2E2E2E]">
                <th className="text-left px-4 py-2 text-[#555] text-xs">Articolo</th>
                <th className="text-right px-4 py-2 text-[#555] text-xs">Perdita €</th>
                <th className="text-right px-4 py-2 text-[#555] text-xs">Occorrenze</th>
              </tr>
            </thead>
            <tbody>
              {data.top_loss_items.map((item, i) => (
                <tr key={i} className="border-b border-[#2A2A2A] last:border-0">
                  <td className="px-4 py-2.5 text-[#F5F5DC]">{item.item_name}</td>
                  <td className="px-4 py-2.5 text-red-400 text-right font-semibold">{formatPrice(item.total_loss)}</td>
                  <td className="px-4 py-2.5 text-[#888] text-right">{item.occurrences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent alerts */}
      {data.recent_alerts?.length > 0 && (
        <div className="bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#3A3A3A] flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" />
            <h3 className="text-[#F5F5DC] text-sm font-semibold">Alert discrepanze recenti (&gt;5%)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2E2E2E]">
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Articolo</th>
                  <th className="text-right px-4 py-2 text-[#555] text-xs">Ordinato</th>
                  <th className="text-right px-4 py-2 text-[#555] text-xs">Ricevuto</th>
                  <th className="text-right px-4 py-2 text-[#555] text-xs">Δ%</th>
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Fornitore</th>
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Data</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_alerts.map((a, i) => (
                  <tr key={i} className="border-b border-[#2A2A2A] last:border-0">
                    <td className="px-4 py-2.5 text-[#F5F5DC]">{a.item_name}</td>
                    <td className="px-4 py-2.5 text-[#888] text-right">{a.qty_ordered} {a.unit}</td>
                    <td className="px-4 py-2.5 text-[#888] text-right">{a.qty_received} {a.unit}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${a.discrepancy_pct < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {a.discrepancy_pct > 0 ? '+' : ''}{a.discrepancy_pct}%
                    </td>
                    <td className="px-4 py-2.5 text-[#888] text-xs">{a.supplier_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[#555] text-xs">{formatDatetime(a.received_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PURCHASE ORDERS ───────────────────────────────────────────
function POTab() {
  const [pos, setPOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [suppliers, setSuppliers] = useState([])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([inventoryAPI.listPOs(), inventoryAPI.suppliers()])
      .then(([poRes, supRes]) => {
        setPOs(poRes.data)
        setSuppliers(supRes.data)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[#888] text-xs">{pos.length} ordini</span>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:bg-[#c9a42e] transition">
          <Plus size={13} /> Nuovo PO
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
          {pos.length === 0 ? (
            <p className="text-[#555] text-xs text-center py-10">Nessun ordine d'acquisto</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2E2E2E]">
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Fornitore</th>
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Stato</th>
                  <th className="text-right px-4 py-2 text-[#555] text-xs">Articoli</th>
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Data prevista</th>
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Creato</th>
                </tr>
              </thead>
              <tbody>
                {pos.map(po => (
                  <tr key={po.id} className="border-b border-[#2A2A2A] last:border-0">
                    <td className="px-4 py-2.5 text-[#F5F5DC] font-medium">{po.supplier_name}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={po.status} />
                    </td>
                    <td className="px-4 py-2.5 text-[#888] text-right">{po.items?.length ?? 0}</td>
                    <td className="px-4 py-2.5 text-[#888] text-xs">{formatDate(po.expected_date)}</td>
                    <td className="px-4 py-2.5 text-[#555] text-xs">{formatDatetime(po.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <POForm suppliers={suppliers} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
        )}
      </AnimatePresence>
    </div>
  )
}

function POForm({ suppliers, onClose, onSaved }) {
  const [supplierName, setSupplierName] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ item_name: '', qty_ordered: 1, unit: 'kg', unit_cost: 0 }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const addItem = () => setItems(prev => [...prev, { item_name: '', qty_ordered: 1, unit: 'kg', unit_cost: 0 }])
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i, field, val) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))

  const submit = async () => {
    if (!supplierName.trim() || items.some(it => !it.item_name.trim())) {
      setError('Fornitore e nome articoli obbligatori')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await inventoryAPI.createPO({ supplier_name: supplierName, expected_date: expectedDate || null, notes, items })
      onSaved()
    } catch {
      setError('Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
        className="bg-[#222] border border-[#3A3A3A] rounded-2xl w-full max-w-xl mt-10 mb-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3A3A3A]">
          <h3 className="text-[#F5F5DC] font-semibold">Nuovo Ordine d'Acquisto</h3>
          <button onClick={onClose} className="text-[#555] hover:text-[#888]"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {/* Supplier */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#888] text-xs">Fornitore *</label>
            {suppliers.length > 0 ? (
              <select value={supplierName} onChange={e => setSupplierName(e.target.value)}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm">
                <option value="">— seleziona o digita —</option>
                {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            ) : null}
            <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
              placeholder="Nome fornitore"
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[#888] text-xs">Data prevista consegna</label>
              <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[#888] text-xs">Note</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opzionale"
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]" />
            </div>
          </div>

          {/* Items */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[#888] text-xs">Articoli *</label>
              <button onClick={addItem} className="text-[#D4AF37] text-xs flex items-center gap-1 hover:text-[#c9a42e]">
                <Plus size={12} /> Aggiungi
              </button>
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input value={it.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)}
                  placeholder="Nome articolo"
                  className="col-span-4 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-xs placeholder-[#555]" />
                <input type="number" value={it.qty_ordered} onChange={e => updateItem(i, 'qty_ordered', parseFloat(e.target.value) || 0)}
                  className="col-span-2 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-xs text-center" />
                <select value={it.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                  className="col-span-2 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-xs">
                  {['kg','g','l','ml','pz','cf'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input type="number" step="0.01" value={it.unit_cost} onChange={e => updateItem(i, 'unit_cost', parseFloat(e.target.value) || 0)}
                  placeholder="€/u"
                  className="col-span-3 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-xs placeholder-[#555]" />
                <button onClick={() => removeItem(i)} disabled={items.length === 1}
                  className="col-span-1 text-[#555] hover:text-red-400 disabled:opacity-30 flex justify-center">
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-2 text-[#555] text-[10px] px-0.5">
              <span className="col-span-4">Articolo</span>
              <span className="col-span-2 text-center">Qtà</span>
              <span className="col-span-2 text-center">Unità</span>
              <span className="col-span-3">€/unità</span>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button onClick={submit} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-[#c9a42e] transition">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <><Check size={14} /> Crea PO</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── GOODS RECEIPTS ────────────────────────────────────────────
function ReceiptsTab() {
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [pos, setPOs] = useState([])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([inventoryAPI.listReceipts(), inventoryAPI.listPOs()])
      .then(([rRes, poRes]) => {
        setReceipts(rRes.data)
        setPOs(poRes.data.filter(p => p.status === 'pending'))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[#888] text-xs">{receipts.length} ricevimenti</span>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:bg-[#c9a42e] transition">
          <Plus size={13} /> Nuovo ricevimento
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
          {receipts.length === 0 ? (
            <p className="text-[#555] text-xs text-center py-10">Nessun ricevimento</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2E2E2E]">
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Data</th>
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Fornitore</th>
                  <th className="text-right px-4 py-2 text-[#555] text-xs">Articoli</th>
                  <th className="text-right px-4 py-2 text-[#555] text-xs">Δ% medio</th>
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Ricevuto da</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id} className="border-b border-[#2A2A2A] last:border-0">
                    <td className="px-4 py-2.5 text-[#888] text-xs">{formatDatetime(r.received_at)}</td>
                    <td className="px-4 py-2.5 text-[#F5F5DC]">{r.supplier_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[#888] text-right">{r.item_count}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold text-xs ${
                      parseFloat(r.avg_discrepancy_pct) > 5 ? 'text-red-400' : 'text-emerald-400'
                    }`}>
                      {r.avg_discrepancy_pct ?? 0}%
                    </td>
                    <td className="px-4 py-2.5 text-[#555] text-xs">{r.received_by_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <ReceiptForm pendingPOs={pos} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
        )}
      </AnimatePresence>
    </div>
  )
}

function ReceiptForm({ pendingPOs, onClose, onSaved }) {
  const [selectedPO, setSelectedPO] = useState(null)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const barcodeRef = useRef(null)

  function emptyItem() {
    return { item_name: '', barcode: '', qty_ordered: 0, qty_received: 0, unit: 'kg', unit_cost: 0, batch_no: '', expiry_date: '' }
  }

  const addItem = () => setItems(prev => [...prev, emptyItem()])
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i, field, val) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))

  const handleBarcode = async () => {
    const code = barcodeInput.trim()
    if (!code) return
    try {
      const res = await inventoryAPI.barcode(code)
      if (res.data.length > 0) {
        const found = res.data[0]
        setItems(prev => [...prev, {
          item_name: found.item_name,
          barcode: code,
          qty_ordered: found.qty_ordered,
          qty_received: found.qty_ordered,
          unit: found.unit,
          unit_cost: found.unit_cost,
          batch_no: '', expiry_date: '',
        }])
      } else {
        setItems(prev => [...prev, { ...emptyItem(), barcode: code }])
      }
    } catch {
      setItems(prev => [...prev, { ...emptyItem(), barcode: code }])
    }
    setBarcodeInput('')
    barcodeRef.current?.focus()
  }

  const handlePOSelect = (poId) => {
    const po = pendingPOs.find(p => p.id === poId)
    if (!po) { setSelectedPO(null); setItems([emptyItem()]); return }
    setSelectedPO(po)
    setItems(po.items.map(it => ({
      item_name: it.item_name,
      barcode: it.barcode || '',
      po_item_id: it.id,
      qty_ordered: it.qty_ordered,
      qty_received: it.qty_ordered,
      unit: it.unit,
      unit_cost: it.unit_cost,
      batch_no: '', expiry_date: '',
    })))
  }

  const submit = async () => {
    if (items.some(it => !it.item_name.trim())) {
      setError('Tutti gli articoli devono avere un nome')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await inventoryAPI.createReceipt({ po_id: selectedPO?.id || null, notes, items })
      onSaved()
    } catch {
      setError('Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
        className="bg-[#222] border border-[#3A3A3A] rounded-2xl w-full max-w-2xl mt-6 mb-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3A3A3A]">
          <h3 className="text-[#F5F5DC] font-semibold">Registra Ricevimento Merce</h3>
          <button onClick={onClose} className="text-[#555] hover:text-[#888]"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {/* PO selector */}
          {pendingPOs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[#888] text-xs">Collega a un ordine d'acquisto (opzionale)</label>
              <select onChange={e => handlePOSelect(e.target.value)}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm">
                <option value="">— nessun PO —</option>
                {pendingPOs.map(po => (
                  <option key={po.id} value={po.id}>{po.supplier_name} ({formatDate(po.expected_date)})</option>
                ))}
              </select>
            </div>
          )}

          {/* Barcode scanner */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#888] text-xs flex items-center gap-1"><Barcode size={12} /> Scansione barcode</label>
            <div className="flex gap-2">
              <input ref={barcodeRef} value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBarcode()}
                placeholder="Scansiona o digita barcode + Invio"
                className="flex-1 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]" />
              <button onClick={handleBarcode}
                className="px-3 py-2 bg-[#333] rounded-lg text-[#888] hover:text-[#F5F5DC] transition">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Items table */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[#888] text-xs">Articoli ricevuti *</label>
              <button onClick={addItem} className="text-[#D4AF37] text-xs flex items-center gap-1 hover:text-[#c9a42e]">
                <Plus size={12} /> Aggiungi riga
              </button>
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                <input value={it.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)}
                  placeholder="Articolo"
                  className="col-span-3 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-xs placeholder-[#555]" />
                <input type="number" step="0.01" value={it.qty_ordered} onChange={e => updateItem(i, 'qty_ordered', parseFloat(e.target.value) || 0)}
                  placeholder="Ord."
                  className="col-span-2 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#888] text-xs text-center" />
                <input type="number" step="0.01" value={it.qty_received} onChange={e => updateItem(i, 'qty_received', parseFloat(e.target.value) || 0)}
                  placeholder="Ric."
                  className={`col-span-2 bg-[#2A2A2A] border rounded-lg px-2 py-1.5 text-xs text-center font-semibold ${
                    it.qty_ordered > 0 && Math.abs((it.qty_received - it.qty_ordered) / it.qty_ordered) > 0.05
                      ? 'border-red-500/60 text-red-400'
                      : 'border-[#3A3A3A] text-[#F5F5DC]'
                  }`} />
                <select value={it.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                  className="col-span-2 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-1 py-1.5 text-[#F5F5DC] text-xs">
                  {['kg','g','l','ml','pz','cf'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input type="date" value={it.expiry_date} onChange={e => updateItem(i, 'expiry_date', e.target.value)}
                  className="col-span-2 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#555] text-xs" />
                <button onClick={() => removeItem(i)} disabled={items.length === 1}
                  className="col-span-1 text-[#555] hover:text-red-400 disabled:opacity-30 flex justify-center">
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-1.5 text-[#555] text-[10px] px-0.5">
              <span className="col-span-3">Articolo</span>
              <span className="col-span-2 text-center">Ord.</span>
              <span className="col-span-2 text-center">Ric.</span>
              <span className="col-span-2 text-center">Unità</span>
              <span className="col-span-2">Scadenza</span>
            </div>
            <p className="text-[#555] text-[10px]">I campi con bordo rosso indicano discrepanza &gt;5%</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[#888] text-xs">Note</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opzionale"
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]" />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button onClick={submit} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-[#c9a42e] transition">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <><Check size={14} /> Registra ricevimento</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── SPOILAGE ──────────────────────────────────────────────────
function SpoilageTab() {
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    inventoryAPI.listSpoilage().then(r => setLog(r.data)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[#888] text-xs">{log.length} voci</span>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:bg-[#c9a42e] transition">
          <Plus size={13} /> Registra scarto
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-[#222] rounded-xl border border-[#3A3A3A] overflow-hidden">
          {log.length === 0 ? (
            <p className="text-[#555] text-xs text-center py-10">Nessuno scarto registrato</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2E2E2E]">
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Articolo</th>
                  <th className="text-right px-4 py-2 text-[#555] text-xs">Qtà</th>
                  <th className="text-right px-4 py-2 text-[#555] text-xs">Valore €</th>
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Motivo</th>
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Logged da</th>
                  <th className="text-left px-4 py-2 text-[#555] text-xs">Data</th>
                </tr>
              </thead>
              <tbody>
                {log.map(s => (
                  <tr key={s.id} className="border-b border-[#2A2A2A] last:border-0">
                    <td className="px-4 py-2.5 text-[#F5F5DC] font-medium">{s.item_name}</td>
                    <td className="px-4 py-2.5 text-[#888] text-right">{s.qty} {s.unit}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${parseFloat(s.total_value) > 200 ? 'text-red-400' : 'text-amber-400'}`}>
                      {formatPrice(s.total_value)}
                    </td>
                    <td className="px-4 py-2.5 text-[#888] text-xs">{s.reason ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[#555] text-xs">{s.logged_by_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[#555] text-xs">{formatDatetime(s.logged_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <SpoilageForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
        )}
      </AnimatePresence>
    </div>
  )
}

function SpoilageForm({ onClose, onSaved }) {
  const [form, setForm] = useState({ item_name: '', qty: '', unit: 'kg', unit_cost: 0, reason: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, val) => setForm(prev => ({ ...prev, [field]: val }))

  const submit = async () => {
    if (!form.item_name.trim() || !form.qty) {
      setError('Articolo e quantità obbligatori')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await inventoryAPI.createSpoilage({ ...form, qty: parseFloat(form.qty) })
      onSaved()
    } catch {
      setError('Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="bg-[#222] border border-[#3A3A3A] rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3A3A3A]">
          <h3 className="text-[#F5F5DC] font-semibold">Registra Scarto</h3>
          <button onClick={onClose} className="text-[#555] hover:text-[#888]"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <Field label="Articolo *">
            <input value={form.item_name} onChange={e => update('item_name', e.target.value)}
              placeholder="Nome articolo"
              className="w-full bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Quantità *">
              <input type="number" step="0.01" value={form.qty} onChange={e => update('qty', e.target.value)}
                className="w-full bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm" />
            </Field>
            <Field label="Unità">
              <select value={form.unit} onChange={e => update('unit', e.target.value)}
                className="w-full bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm">
                {['kg','g','l','ml','pz','cf'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="€/unità">
              <input type="number" step="0.01" value={form.unit_cost} onChange={e => update('unit_cost', e.target.value)}
                className="w-full bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm" />
            </Field>
          </div>
          <Field label="Motivo">
            <input value={form.reason} onChange={e => update('reason', e.target.value)}
              placeholder="Scaduto, danneggiato..."
              className="w-full bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#555]" />
          </Field>

          {parseFloat(form.qty) * parseFloat(form.unit_cost) > 200 && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="text-amber-400 shrink-0" />
              <span className="text-amber-400 text-xs">Valore &gt;€200 — verrà inviato alert ai manager</span>
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button onClick={submit} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-[#c9a42e] transition mt-1">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <><Check size={14} /> Registra scarto</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── HELPERS ───────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <RefreshCw size={18} className="animate-spin text-[#555]" />
    </div>
  )
}

function StatCard({ label, value, color = 'text-[#D4AF37]' }) {
  return (
    <div className="bg-[#222] rounded-xl border border-[#3A3A3A] p-4 flex flex-col gap-2">
      <span className="text-[#555] text-xs uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[#888] text-xs">{label}</label>
      {children}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending:  'bg-amber-500/20 text-amber-400',
    received: 'bg-emerald-500/20 text-emerald-400',
    cancelled:'bg-red-500/20 text-red-400',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[status] ?? 'bg-[#333] text-[#888]'}`}>
      {status}
    </span>
  )
}

// ── PAGE ──────────────────────────────────────────────────────
export default function InventoryPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('kpis')

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/tables')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <Package size={18} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Inventario</span>
      </header>

      {/* Tabs */}
      <div className="bg-[#222] border-b border-[#3A3A3A] px-5 flex gap-0">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition ${
                tab === t.id
                  ? 'border-[#D4AF37] text-[#D4AF37]'
                  : 'border-transparent text-[#555] hover:text-[#888]'
              }`}>
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'kpis'     && <KpisTab />}
        {tab === 'po'       && <POTab />}
        {tab === 'receipts' && <ReceiptsTab />}
        {tab === 'spoilage' && <SpoilageTab />}
      </div>
    </div>
  )
}
