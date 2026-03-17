import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Package, Plus, Pencil, RefreshCw, Check, X,
  ArrowUp, ArrowDown, AlertTriangle, TrendingDown, History,
} from 'lucide-react'
import { ingredientsAPI, inventoryAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

const UNITS = ['kg', 'g', 'lt', 'ml', 'pz', 'bt', 'sc']

// ─── Stock Adjust Modal ───────────────────────────────────────
function AdjustModal({ ingredient, onClose, onDone }) {
  const { toast } = useToast()
  const [type, setType]   = useState('in')
  const [qty, setQty]     = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handle = async () => {
    if (!qty || parseFloat(qty) <= 0) return
    setSaving(true)
    try {
      await ingredientsAPI.adjust(ingredient.id, { type, quantity: parseFloat(qty), notes: notes || undefined })
      toast({ type: 'success', title: type === 'in' ? 'Stock aggiunto' : type === 'out' ? 'Stock rimosso' : 'Stock rettificato' })
      onDone()
    } catch { toast({ type: 'error', title: 'Errore' }) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#222] border border-[#3A3A3A] rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#3A3A3A]">
          <Package size={15} className="text-[#D4AF37]" />
          <p className="text-[#F5F5DC] font-semibold text-sm flex-1">{ingredient.name}</p>
          <p className="text-[#555] text-xs">Stock: {parseFloat(ingredient.current_stock).toFixed(3)} {ingredient.unit}</p>
          <button onClick={onClose} className="text-[#444] hover:text-[#888]"><X size={15} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {[['in', 'Carico', 'text-emerald-400'], ['out', 'Scarico', 'text-red-400'], ['adjustment', 'Rettifica', 'text-blue-400']].map(([v, l, c]) => (
              <button key={v} onClick={() => setType(v)}
                className={`py-2 rounded-lg border text-xs font-semibold transition ${type === v ? `border-current ${c} bg-current/10` : 'border-[#3A3A3A] text-[#555] hover:border-[#555]'}`}>
                {l}
              </button>
            ))}
          </div>
          <input type="number" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
            placeholder={`Quantità (${ingredient.unit})`} autoFocus
            className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note (opz.)"
            className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
          <button onClick={handle} disabled={saving || !qty}
            className="py-2 rounded-lg bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-[#c9a42e] transition">
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <><Check size={13} /> Conferma</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Movements Modal ──────────────────────────────────────────
function MovementsModal({ ingredient, onClose }) {
  const [movements, setMovements] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    ingredientsAPI.movements(ingredient.id)
      .then(r => setMovements(r.data))
      .finally(() => setLoading(false))
  }, [ingredient.id])

  const typeColor = { in: 'text-emerald-400', out: 'text-red-400', adjustment: 'text-blue-400' }
  const typeLabel = { in: 'Carico', out: 'Scarico', adjustment: 'Rettifica' }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#222] border border-[#3A3A3A] rounded-2xl w-full max-w-md max-h-[75vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#3A3A3A]">
          <History size={15} className="text-[#D4AF37]" />
          <p className="text-[#F5F5DC] font-semibold text-sm flex-1">Movimenti: {ingredient.name}</p>
          <button onClick={onClose} className="text-[#444] hover:text-[#888]"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {loading ? (
            <div className="flex justify-center py-8"><RefreshCw size={16} className="animate-spin text-[#555]" /></div>
          ) : movements.length === 0 ? (
            <p className="text-[#555] text-xs text-center py-8">Nessun movimento registrato</p>
          ) : movements.map(m => (
            <div key={m.id} className="flex items-center gap-3 bg-[#1A1A1A] rounded-lg px-3 py-2">
              <span className={`text-xs font-semibold w-16 ${typeColor[m.type]}`}>{typeLabel[m.type]}</span>
              <span className={`text-sm font-mono ${m.type === 'out' ? 'text-red-400' : 'text-emerald-400'}`}>
                {m.type === 'out' ? '-' : '+'}{Math.abs(m.quantity)} {ingredient.unit}
              </span>
              <div className="flex-1 text-right">
                <p className="text-[#555] text-xs">{m.created_by_name ?? 'Sistema'}</p>
                <p className="text-[#444] text-xs">{new Date(m.created_at).toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Ingredient Row ───────────────────────────────────────────
function IngredientRow({ ingr, suppliers, onRefresh }) {
  const { toast } = useToast()
  const [editing, setEditing]     = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [history, setHistory]     = useState(false)
  const [name, setName]           = useState(ingr.name)
  const [unit, setUnit]           = useState(ingr.unit)
  const [minStock, setMinStock]   = useState(ingr.min_stock)
  const [cost, setCost]           = useState(ingr.cost_per_unit)
  const [suppId, setSuppId]       = useState(ingr.supplier_id ?? '')
  const [saving, setSaving]       = useState(false)

  const isLow = ingr.low_stock
  const pct   = ingr.min_stock > 0 ? Math.min(100, (ingr.current_stock / ingr.min_stock) * 100) : 100

  const handleSave = async () => {
    setSaving(true)
    try {
      await ingredientsAPI.update(ingr.id, {
        name, unit, min_stock: parseFloat(minStock), cost_per_unit: parseFloat(cost),
        supplier_id: suppId || null,
      })
      setEditing(false)
      onRefresh()
      toast({ type: 'success', title: 'Salvato' })
    } catch { toast({ type: 'error', title: 'Errore' }) }
    finally { setSaving(false) }
  }

  return (
    <>
      {adjusting && <AdjustModal ingredient={ingr} onClose={() => setAdjusting(false)} onDone={() => { setAdjusting(false); onRefresh() }} />}
      {history && <MovementsModal ingredient={ingr} onClose={() => setHistory(false)} />}

      <div className={`bg-[#222] border rounded-xl overflow-hidden ${isLow ? 'border-amber-500/40' : 'border-[#3A3A3A]'}`}>
        {!editing ? (
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              {isLow && <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <span className="text-[#F5F5DC] text-sm font-medium">{ingr.name}</span>
                {ingr.supplier_name && <span className="text-[#555] text-xs ml-2">{ingr.supplier_name}</span>}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-bold ${isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {parseFloat(ingr.current_stock).toFixed(3)} {ingr.unit}
                </p>
                {ingr.min_stock > 0 && (
                  <p className="text-[#555] text-xs">min: {parseFloat(ingr.min_stock).toFixed(3)}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setHistory(true)} className="text-[#444] hover:text-[#888] transition p-1" title="Movimenti">
                  <History size={13} />
                </button>
                <button onClick={() => setAdjusting(true)} className="text-[#444] hover:text-emerald-400 transition p-1" title="Aggiusta stock">
                  <ArrowUp size={13} />
                </button>
                <button onClick={() => setEditing(true)} className="text-[#444] hover:text-[#D4AF37] transition p-1">
                  <Pencil size={13} />
                </button>
              </div>
            </div>
            {ingr.min_stock > 0 && (
              <div className="mt-2 h-1 bg-[#2A2A2A] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct < 50 ? 'bg-red-500' : pct < 100 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 bg-[#1E1E1E] flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome"
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
              <select value={unit} onChange={e => setUnit(e.target.value)}
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" step="0.001" value={minStock} onChange={e => setMinStock(e.target.value)} placeholder="Stock minimo"
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
              <input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} placeholder="Costo/unità €"
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
            </div>
            <select value={suppId} onChange={e => setSuppId(e.target.value)}
              className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60">
              <option value="">Nessun fornitore</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex-1 py-1.5 rounded-lg border border-[#3A3A3A] text-[#555] text-xs hover:text-[#888] transition">Annulla</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-1.5 rounded-lg bg-[#D4AF37] text-[#1A1A1A] font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-40 hover:bg-[#c9a42e] transition">
                {saving ? <RefreshCw size={11} className="animate-spin" /> : <><Check size={11} /> Salva</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function IngredientsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [ingredients, setIngredients] = useState([])
  const [suppliers, setSuppliers]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [adding, setAdding]           = useState(false)
  const [filter, setFilter]           = useState('all') // all | low
  const [newName, setNewName]         = useState('')
  const [newUnit, setNewUnit]         = useState('kg')
  const [newStock, setNewStock]       = useState('')
  const [newMin, setNewMin]           = useState('')
  const [newCost, setNewCost]         = useState('')
  const [saving, setSaving]           = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ingr, supp] = await Promise.all([
        ingredientsAPI.list(),
        inventoryAPI.suppliers(),
      ])
      setIngredients(ingr.data)
      setSuppliers(supp.data)
    } catch { toast({ type: 'error', title: 'Errore caricamento' }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await ingredientsAPI.create({
        name: newName.trim(), unit: newUnit,
        current_stock: parseFloat(newStock) || 0,
        min_stock: parseFloat(newMin) || 0,
        cost_per_unit: parseFloat(newCost) || 0,
      })
      setNewName(''); setNewUnit('kg'); setNewStock(''); setNewMin(''); setNewCost('')
      setAdding(false)
      load()
      toast({ type: 'success', title: 'Ingrediente creato' })
    } catch { toast({ type: 'error', title: 'Errore' }) }
    finally { setSaving(false) }
  }

  const visible = filter === 'low'
    ? ingredients.filter(i => i.low_stock)
    : ingredients

  const lowCount = ingredients.filter(i => i.low_stock).length

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <Package size={17} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Ingredienti</span>
        {lowCount > 0 && (
          <span className="flex items-center gap-1 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
            <AlertTriangle size={11} /> {lowCount} sotto scorta
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setFilter(f => f === 'low' ? 'all' : 'low')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${filter === 'low' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'border border-[#3A3A3A] text-[#555] hover:text-[#888]'}`}>
            <TrendingDown size={12} /> Sotto scorta
          </button>
          <button onClick={() => setAdding(p => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:bg-[#c9a42e] transition">
            {adding ? <X size={13} /> : <Plus size={13} />} {adding ? 'Chiudi' : 'Nuovo'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw size={18} className="animate-spin text-[#555]" /></div>
        ) : (
          <>
            <AnimatePresence>
              {adding && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="bg-[#222] border border-[#D4AF37]/30 rounded-2xl p-4 flex flex-col gap-2">
                  <p className="text-[#888] text-xs font-semibold">Nuovo ingrediente</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome *" autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleCreate()}
                      className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
                    <select value={newUnit} onChange={e => setNewUnit(e.target.value)}
                      className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60">
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" step="0.001" value={newStock} onChange={e => setNewStock(e.target.value)} placeholder="Stock iniziale"
                      className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
                    <input type="number" step="0.001" value={newMin} onChange={e => setNewMin(e.target.value)} placeholder="Stock minimo"
                      className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
                    <input type="number" step="0.01" value={newCost} onChange={e => setNewCost(e.target.value)} placeholder="Costo €/unità"
                      className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-lg border border-[#3A3A3A] text-[#555] text-xs hover:text-[#888] transition">Annulla</button>
                    <button onClick={handleCreate} disabled={saving || !newName.trim()}
                      className="flex-1 py-2 rounded-lg bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 hover:bg-[#c9a42e] transition">
                      {saving ? <RefreshCw size={13} className="animate-spin" /> : <><Check size={13} /> Crea</>}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {visible.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-20">
                <Package size={40} className="text-[#333]" />
                <p className="text-[#555] text-sm">
                  {filter === 'low' ? 'Nessun ingrediente sotto scorta' : 'Nessun ingrediente ancora'}
                </p>
                {filter === 'all' && (
                  <button onClick={() => setAdding(true)} className="text-[#D4AF37] text-sm hover:underline">Aggiungi il primo</button>
                )}
              </div>
            )}

            {visible.map(ingr => (
              <IngredientRow key={ingr.id} ingr={ingr} suppliers={suppliers} onRefresh={load} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
