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
import { useToast } from '../context/ToastContext'
import { Card, Badge, Button, StatusDot } from '../components/v2'

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
          color={data.avg_discrepancy_pct > 5 ? 'text-[var(--color-err)]' : 'text-[var(--color-ok)]'} />
        <StatCard label="Perdite settimana" value={formatPrice(data.loss_week)}
          color="text-[var(--color-warn)]" />
        <StatCard label="Scarti oggi" value={formatPrice(data.spoilage_today)}
          color="text-[var(--color-terracotta)]" />
        <StatCard label="Scarti settimana" value={formatPrice(data.spoilage_week)}
          color="text-[var(--color-err)]" />
      </div>

      {/* Top loss items */}
      {data.top_loss_items?.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border-strong)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border-strong)]">
            <h3 className="text-[var(--color-text)] text-sm font-semibold">Top 5 articoli con perdite (30 giorni)</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-soft)]">
                <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Articolo</th>
                <th className="text-right px-4 py-2 text-[var(--color-text-3)] text-xs">Perdita €</th>
                <th className="text-right px-4 py-2 text-[var(--color-text-3)] text-xs">Occorrenze</th>
              </tr>
            </thead>
            <tbody>
              {data.top_loss_items.map((item) => (
                <tr key={`loss-${item.item_name}`} className="border-b border-[var(--color-border-soft)] last:border-0">
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{item.item_name}</td>
                  <td className="px-4 py-2.5 text-[var(--color-err)] text-right font-semibold">{formatPrice(item.total_loss)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-2)] text-right">{item.occurrences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent alerts */}
      {data.recent_alerts?.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border-strong)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border-strong)] flex items-center gap-2">
            <AlertTriangle size={14} className="text-[var(--color-warn)]" />
            <h3 className="text-[var(--color-text)] text-sm font-semibold">Alert discrepanze recenti (&gt;5%)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-soft)]">
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Articolo</th>
                  <th className="text-right px-4 py-2 text-[var(--color-text-3)] text-xs">Ordinato</th>
                  <th className="text-right px-4 py-2 text-[var(--color-text-3)] text-xs">Ricevuto</th>
                  <th className="text-right px-4 py-2 text-[var(--color-text-3)] text-xs">Δ%</th>
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Fornitore</th>
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Data</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_alerts.map((a) => (
                  <tr key={`alert-${a.item_name}-${a.received_at}`} className="border-b border-[var(--color-border-soft)] last:border-0">
                    <td className="px-4 py-2.5 text-[var(--color-text)]">{a.item_name}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-2)] text-right">{a.qty_ordered} {a.unit}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-2)] text-right">{a.qty_received} {a.unit}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${a.discrepancy_pct < 0 ? 'text-[var(--color-err)]' : 'text-[var(--color-ok)]'}`}>
                      {a.discrepancy_pct > 0 ? '+' : ''}{a.discrepancy_pct}%
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-2)] text-xs">{a.supplier_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-3)] text-xs">{formatDatetime(a.received_at)}</td>
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
        <span className="text-[var(--color-text-2)] text-xs">{pos.length} ordini</span>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-gold)] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:brightness-110 transition">
          <Plus size={13} /> Nuovo PO
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border-strong)] overflow-hidden">
          {pos.length === 0 ? (
            <p className="text-[var(--color-text-3)] text-xs text-center py-10">Nessun ordine d'acquisto</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-soft)]">
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Fornitore</th>
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Stato</th>
                  <th className="text-right px-4 py-2 text-[var(--color-text-3)] text-xs">Articoli</th>
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Data prevista</th>
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Creato</th>
                </tr>
              </thead>
              <tbody>
                {pos.map(po => (
                  <tr key={po.id} className="border-b border-[var(--color-border-soft)] last:border-0">
                    <td className="px-4 py-2.5 text-[var(--color-text)] font-medium">{po.supplier_name}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={po.status} />
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-2)] text-right">{po.items?.length ?? 0}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-2)] text-xs">{formatDate(po.expected_date)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-3)] text-xs">{formatDatetime(po.created_at)}</td>
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
  const makeEmptyPOItem = () => ({ _uid: crypto.randomUUID(), item_name: '', qty_ordered: 1, unit: 'kg', unit_cost: 0 })
  const [items, setItems] = useState([makeEmptyPOItem()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const addItem = () => setItems(prev => [...prev, makeEmptyPOItem()])
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i, field, val) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))

  const submit = async () => {
    if (!supplierName.trim()) { setError('Nome fornitore obbligatorio'); return }
    if (items.some(it => !it.item_name.trim())) { setError('Tutti gli articoli devono avere un nome'); return }
    if (items.some(it => it.qty_ordered <= 0)) { setError('Le quantità devono essere maggiori di 0'); return }
    if (items.some(it => it.unit_cost < 0)) { setError('I prezzi non possono essere negativi'); return }
    setSaving(true)
    setError(null)
    try {
      await inventoryAPI.createPO({ supplier_name: supplierName, expected_date: expectedDate || null, notes, items })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
        className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-2xl w-full max-w-xl mt-10 mb-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-strong)]">
          <h3 className="text-[var(--color-text)] font-semibold">Nuovo Ordine d'Acquisto</h3>
          <button onClick={onClose} className="text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {/* Supplier */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[var(--color-text-2)] text-xs">Fornitore *</label>
            {suppliers.length > 0 ? (
              <select value={supplierName} onChange={e => setSupplierName(e.target.value)}
                className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm">
                <option value="">— seleziona o digita —</option>
                {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            ) : null}
            <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
              placeholder="Nome fornitore"
              className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm placeholder-[#555]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--color-text-2)] text-xs">Data prevista consegna</label>
              <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--color-text-2)] text-xs">Note</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opzionale"
                className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm placeholder-[#555]" />
            </div>
          </div>

          {/* Items */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[var(--color-text-2)] text-xs">Articoli *</label>
              <button onClick={addItem} className="text-[var(--color-gold)] text-xs flex items-center gap-1 hover:text-[#c9a42e]">
                <Plus size={12} /> Aggiungi
              </button>
            </div>
            {items.map((it, i) => (
              <div key={it._uid || `po-item-${i}`} className="grid grid-cols-12 gap-2 items-center">
                <input value={it.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)}
                  placeholder="Nome articolo"
                  className="col-span-4 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-2 py-1.5 text-[var(--color-text)] text-xs placeholder-[#555]" />
                <input type="number" value={it.qty_ordered} onChange={e => updateItem(i, 'qty_ordered', parseFloat(e.target.value) || 0)}
                  className="col-span-2 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-2 py-1.5 text-[var(--color-text)] text-xs text-center" />
                <select value={it.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                  className="col-span-2 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-2 py-1.5 text-[var(--color-text)] text-xs">
                  {['kg','g','l','ml','pz','cf'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input type="number" step="0.01" value={it.unit_cost} onChange={e => updateItem(i, 'unit_cost', parseFloat(e.target.value) || 0)}
                  placeholder="€/u"
                  className="col-span-3 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-2 py-1.5 text-[var(--color-text)] text-xs placeholder-[#555]" />
                <button onClick={() => removeItem(i)} disabled={items.length === 1}
                  className="col-span-1 text-[var(--color-text-3)] hover:text-[var(--color-err)] disabled:opacity-30 flex justify-center">
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-2 text-[var(--color-text-3)] text-[10px] px-0.5">
              <span className="col-span-4">Articolo</span>
              <span className="col-span-2 text-center">Qtà</span>
              <span className="col-span-2 text-center">Unità</span>
              <span className="col-span-3">€/unità</span>
            </div>
          </div>

          {error && <p className="text-[var(--color-err)] text-xs">{error}</p>}

          <button onClick={submit} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[var(--color-gold)] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:brightness-110 transition">
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
        <span className="text-[var(--color-text-2)] text-xs">{receipts.length} ricevimenti</span>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-gold)] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:brightness-110 transition">
          <Plus size={13} /> Nuovo ricevimento
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border-strong)] overflow-hidden">
          {receipts.length === 0 ? (
            <p className="text-[var(--color-text-3)] text-xs text-center py-10">Nessun ricevimento</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-soft)]">
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Data</th>
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Fornitore</th>
                  <th className="text-right px-4 py-2 text-[var(--color-text-3)] text-xs">Articoli</th>
                  <th className="text-right px-4 py-2 text-[var(--color-text-3)] text-xs">Δ% medio</th>
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Ricevuto da</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id} className="border-b border-[var(--color-border-soft)] last:border-0">
                    <td className="px-4 py-2.5 text-[var(--color-text-2)] text-xs">{formatDatetime(r.received_at)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text)]">{r.supplier_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-2)] text-right">{r.item_count}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold text-xs ${
                      parseFloat(r.avg_discrepancy_pct) > 5 ? 'text-[var(--color-err)]' : 'text-[var(--color-ok)]'
                    }`}>
                      {r.avg_discrepancy_pct ?? 0}%
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-3)] text-xs">{r.received_by_name ?? '—'}</td>
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
  const { toast } = useToast()
  const [selectedPO, setSelectedPO] = useState(null)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const barcodeRef = useRef(null)

  function emptyItem() {
    return { _uid: crypto.randomUUID(), item_name: '', barcode: '', qty_ordered: 0, qty_received: 0, unit: 'kg', unit_cost: 0, batch_no: '', expiry_date: '' }
  }

  const addItem = () => setItems(prev => [...prev, emptyItem()])
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i, field, val) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))

  const handleBarcode = async () => {
    const code = barcodeInput.trim()
    if (!code) return
    try {
      const res = await inventoryAPI.barcode(code)
      const found = res.data  // now a single object or null
      if (found?.item_name) {
        setItems(prev => [...prev, {
          _uid: crypto.randomUUID(),
          item_name: found.item_name,
          barcode: code,
          qty_ordered: found.qty_ordered ?? 0,
          qty_received: found.qty_ordered ?? 0,
          unit: found.unit || 'pz',
          unit_cost: found.unit_cost || 0,
          batch_no: '', expiry_date: '',
        }])
        if (found.source === 'openfoodfacts') {
          toast({ type: 'info', title: `Trovato: ${found.item_name}${found.brand ? ` (${found.brand})` : ''}`, message: 'Da Open Food Facts — verifica prezzo e unità' })
        }
      } else {
        setItems(prev => [...prev, { ...emptyItem(), barcode: code }])
        toast({ type: 'warning', title: 'Prodotto non trovato', message: 'Barcode sconosciuto — inserisci manualmente' })
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
        className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-2xl w-full max-w-2xl mt-6 mb-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-strong)]">
          <h3 className="text-[var(--color-text)] font-semibold">Registra Ricevimento Merce</h3>
          <button onClick={onClose} className="text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {/* PO selector */}
          {pendingPOs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--color-text-2)] text-xs">Collega a un ordine d'acquisto (opzionale)</label>
              <select onChange={e => handlePOSelect(e.target.value)}
                className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm">
                <option value="">— nessun PO —</option>
                {pendingPOs.map(po => (
                  <option key={po.id} value={po.id}>{po.supplier_name} ({formatDate(po.expected_date)})</option>
                ))}
              </select>
            </div>
          )}

          {/* Barcode scanner */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[var(--color-text-2)] text-xs flex items-center gap-1"><Barcode size={12} /> Scansione barcode</label>
            <div className="flex gap-2">
              <input ref={barcodeRef} value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBarcode()}
                placeholder="Scansiona o digita barcode + Invio"
                className="flex-1 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm placeholder-[#555]" />
              <button onClick={handleBarcode}
                className="px-3 py-2 bg-[#333] rounded-lg text-[var(--color-text-2)] hover:text-[var(--color-text)] transition">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Items table */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[var(--color-text-2)] text-xs">Articoli ricevuti *</label>
              <button onClick={addItem} className="text-[var(--color-gold)] text-xs flex items-center gap-1 hover:text-[#c9a42e]">
                <Plus size={12} /> Aggiungi riga
              </button>
            </div>
            {items.map((it, i) => (
              <div key={it._uid || `receipt-item-${i}`} className="grid grid-cols-12 gap-1.5 items-center">
                <input value={it.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)}
                  placeholder="Articolo"
                  className="col-span-3 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-2 py-1.5 text-[var(--color-text)] text-xs placeholder-[#555]" />
                <input type="number" step="0.01" value={it.qty_ordered} onChange={e => updateItem(i, 'qty_ordered', parseFloat(e.target.value) || 0)}
                  placeholder="Ord."
                  className="col-span-2 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-2 py-1.5 text-[var(--color-text-2)] text-xs text-center" />
                <input type="number" step="0.01" value={it.qty_received} onChange={e => updateItem(i, 'qty_received', parseFloat(e.target.value) || 0)}
                  placeholder="Ric."
                  className={`col-span-2 bg-[var(--color-surface-2)] border rounded-lg px-2 py-1.5 text-xs text-center font-semibold ${
                    it.qty_ordered > 0 && Math.abs((it.qty_received - it.qty_ordered) / it.qty_ordered) > 0.05
                      ? 'border-red-500/60 text-[var(--color-err)]'
                      : 'border-[var(--color-border-strong)] text-[var(--color-text)]'
                  }`} />
                <select value={it.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                  className="col-span-2 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-1 py-1.5 text-[var(--color-text)] text-xs">
                  {['kg','g','l','ml','pz','cf'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input type="date" value={it.expiry_date} onChange={e => updateItem(i, 'expiry_date', e.target.value)}
                  className="col-span-2 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-2 py-1.5 text-[var(--color-text-3)] text-xs" />
                <button onClick={() => removeItem(i)} disabled={items.length === 1}
                  className="col-span-1 text-[var(--color-text-3)] hover:text-[var(--color-err)] disabled:opacity-30 flex justify-center">
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-1.5 text-[var(--color-text-3)] text-[10px] px-0.5">
              <span className="col-span-3">Articolo</span>
              <span className="col-span-2 text-center">Ord.</span>
              <span className="col-span-2 text-center">Ric.</span>
              <span className="col-span-2 text-center">Unità</span>
              <span className="col-span-2">Scadenza</span>
            </div>
            <p className="text-[var(--color-text-3)] text-[10px]">I campi con bordo rosso indicano discrepanza &gt;5%</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[var(--color-text-2)] text-xs">Note</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opzionale"
              className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm placeholder-[#555]" />
          </div>

          {error && <p className="text-[var(--color-err)] text-xs">{error}</p>}

          <button onClick={submit} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[var(--color-gold)] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:brightness-110 transition">
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
        <span className="text-[var(--color-text-2)] text-xs">{log.length} voci</span>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-gold)] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:brightness-110 transition">
          <Plus size={13} /> Registra scarto
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border-strong)] overflow-hidden">
          {log.length === 0 ? (
            <p className="text-[var(--color-text-3)] text-xs text-center py-10">Nessuno scarto registrato</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-soft)]">
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Articolo</th>
                  <th className="text-right px-4 py-2 text-[var(--color-text-3)] text-xs">Qtà</th>
                  <th className="text-right px-4 py-2 text-[var(--color-text-3)] text-xs">Valore €</th>
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Motivo</th>
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Logged da</th>
                  <th className="text-left px-4 py-2 text-[var(--color-text-3)] text-xs">Data</th>
                </tr>
              </thead>
              <tbody>
                {log.map(s => (
                  <tr key={s.id} className="border-b border-[var(--color-border-soft)] last:border-0">
                    <td className="px-4 py-2.5 text-[var(--color-text)] font-medium">{s.item_name}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-2)] text-right">{s.qty} {s.unit}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${parseFloat(s.total_value) > 200 ? 'text-[var(--color-err)]' : 'text-[var(--color-warn)]'}`}>
                      {formatPrice(s.total_value)}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-2)] text-xs">{s.reason ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-3)] text-xs">{s.logged_by_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-3)] text-xs">{formatDatetime(s.logged_at)}</td>
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
    if (!form.item_name.trim()) { setError('Nome articolo obbligatorio'); return }
    if (!form.qty || parseFloat(form.qty) <= 0) { setError('La quantità deve essere maggiore di 0'); return }
    if (parseFloat(form.unit_cost) < 0) { setError('Il costo non può essere negativo'); return }
    setSaving(true)
    setError(null)
    try {
      await inventoryAPI.createSpoilage({ ...form, qty: parseFloat(form.qty) })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-strong)]">
          <h3 className="text-[var(--color-text)] font-semibold">Registra Scarto</h3>
          <button onClick={onClose} className="text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <Field label="Articolo *">
            <input value={form.item_name} onChange={e => update('item_name', e.target.value)}
              placeholder="Nome articolo"
              className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm placeholder-[#555]" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Quantità *">
              <input type="number" step="0.01" value={form.qty} onChange={e => update('qty', e.target.value)}
                className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm" />
            </Field>
            <Field label="Unità">
              <select value={form.unit} onChange={e => update('unit', e.target.value)}
                className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm">
                {['kg','g','l','ml','pz','cf'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="€/unità">
              <input type="number" step="0.01" value={form.unit_cost} onChange={e => update('unit_cost', e.target.value)}
                className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm" />
            </Field>
          </div>
          <Field label="Motivo">
            <input value={form.reason} onChange={e => update('reason', e.target.value)}
              placeholder="Scaduto, danneggiato..."
              className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm placeholder-[#555]" />
          </Field>

          {parseFloat(form.qty) * parseFloat(form.unit_cost) > 200 && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="text-[var(--color-warn)] shrink-0" />
              <span className="text-[var(--color-warn)] text-xs">Valore &gt;€200 — verrà inviato alert ai manager</span>
            </div>
          )}

          {error && <p className="text-[var(--color-err)] text-xs">{error}</p>}

          <button onClick={submit} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[var(--color-gold)] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:brightness-110 transition mt-1">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <><Check size={14} /> Registra scarto</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── HELPERS (v2 design system) ─────────────────────────────────
function Spinner() {
  return (
    <div className="flex justify-center items-center py-10 gap-2 text-[var(--color-text-2)]">
      <StatusDot tone="gold" size="sm" pulse />
      <span className="text-sm serif italic">Caricamento…</span>
    </div>
  )
}

function StatCard({ label, value, color = 'text-[var(--color-gold)]' }) {
  return (
    <Card variant="elevated" padding="md" className="flex flex-col gap-2">
      <span className="text-[var(--color-text-3)] text-xs uppercase tracking-wide font-semibold">
        {label}
      </span>
      <span className={`text-2xl font-bold tnum ${color}`}>{value}</span>
    </Card>
  )
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}

// Mappa stato PO → tone Badge v2
const PO_STATUS_TONE = {
  pending:   'warn',
  received:  'ok',
  cancelled: 'err',
}

function StatusBadge({ status }) {
  const tone = PO_STATUS_TONE[status] || 'neutral'
  return (
    <Badge tone={tone} size="sm">
      {status}
    </Badge>
  )
}

// ── PAGE ──────────────────────────────────────────────────────
export default function InventoryPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('kpis')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[var(--color-surface-2)] border-b border-[var(--color-border-strong)] px-4 sm:px-5 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/tables')}
          aria-label="Indietro"
          className="!p-2 !min-h-0 !rounded-lg"
        >
          <ArrowLeft size={18} />
        </Button>
        <Package size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-lg sm:text-xl font-bold text-[var(--color-text)] tracking-tight">
          Inventario
        </h1>
      </header>

      {/* Tabs (mobile-scroll, no overflow) */}
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border-strong)] px-2 sm:px-5 flex gap-0 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap min-h-[44px] ${
                active
                  ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                  : 'border-transparent text-[var(--color-text-3)] hover:text-[var(--color-text-2)]'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {tab === 'kpis'     && <KpisTab />}
        {tab === 'po'       && <POTab />}
        {tab === 'receipts' && <ReceiptsTab />}
        {tab === 'spoilage' && <SpoilageTab />}
      </div>
    </div>
  )
}
