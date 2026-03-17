import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, UtensilsCrossed, Plus, Pencil, Trash2, RefreshCw, Check, X,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Clock, BookOpen, AlertTriangle, Calculator,
} from 'lucide-react'
import { menuAPI, recipesAPI, ingredientsAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'
import { useToast } from '../context/ToastContext'

// ─── Allergeni EU (14 obbligatori) ───────────────────────────
const ALLERGENS = [
  { id: 'glutine',    label: 'Glutine' },
  { id: 'crostacei',  label: 'Crostacei' },
  { id: 'uova',       label: 'Uova' },
  { id: 'pesce',      label: 'Pesce' },
  { id: 'arachidi',   label: 'Arachidi' },
  { id: 'soia',       label: 'Soia' },
  { id: 'latte',      label: 'Latte' },
  { id: 'fruttaGuscio', label: 'Frutta a guscio' },
  { id: 'sedano',     label: 'Sedano' },
  { id: 'senape',     label: 'Senape' },
  { id: 'sesamo',     label: 'Sesamo' },
  { id: 'solfiti',    label: 'Solfiti' },
  { id: 'lupini',     label: 'Lupini' },
  { id: 'molluschi',  label: 'Molluschi' },
]

// ─── Recipe Modal ─────────────────────────────────────────────
function RecipeModal({ item, onClose }) {
  const { toast } = useToast()
  const [recipe, setRecipe]           = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading]         = useState(true)
  const [selIngr, setSelIngr]         = useState('')
  const [qty, setQty]                 = useState('')
  const [saving, setSaving]           = useState(false)
  const [useCalc, setUseCalc]         = useState(false)
  const [calcTot, setCalcTot]         = useState('')
  const [calcPiatti, setCalcPiatti]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, i] = await Promise.all([recipesAPI.get(item.id), ingredientsAPI.list()])
      setRecipe(r.data)
      setIngredients(i.data)
    } finally { setLoading(false) }
  }, [item.id])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!selIngr || !qty) return
    setSaving(true)
    try {
      await recipesAPI.upsert(item.id, { ingredient_id: selIngr, quantity: parseFloat(qty) })
      setSelIngr(''); setQty('')
      load()
      toast({ type: 'success', title: 'Ingrediente aggiunto' })
    } catch { toast({ type: 'error', title: 'Errore' }) }
    finally { setSaving(false) }
  }

  const handleRemove = async (recipeId) => {
    try {
      await recipesAPI.remove(recipeId)
      load()
    } catch { toast({ type: 'error', title: 'Errore rimozione' }) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#222] border border-[#3A3A3A] rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#3A3A3A]">
          <BookOpen size={16} className="text-[#D4AF37]" />
          <div>
            <p className="text-[#F5F5DC] font-semibold text-sm">Ricetta: {item.name}</p>
            <p className="text-[#555] text-xs">Ingredienti per porzione</p>
          </div>
          <button onClick={onClose} className="ml-auto text-[#444] hover:text-[#888]"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex justify-center py-8"><RefreshCw size={16} className="animate-spin text-[#555]" /></div>
          ) : (
            <>
              {recipe.length === 0 && (
                <p className="text-[#555] text-xs text-center py-4">Nessun ingrediente nella ricetta</p>
              )}
              {recipe.map(r => (
                <div key={r.id} className="flex items-center gap-3 bg-[#1A1A1A] rounded-lg px-3 py-2">
                  <div className="flex-1">
                    <p className="text-[#F5F5DC] text-sm">{r.name}</p>
                    <p className="text-[#555] text-xs">{r.quantity} {r.unit} per porzione</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    r.current_stock <= 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    Stock: {parseFloat(r.current_stock).toFixed(2)} {r.unit}
                  </span>
                  <button onClick={() => handleRemove(r.id)} className="text-[#444] hover:text-red-400 transition">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              <div className="border-t border-[#2A2A2A] pt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-[#888] text-xs font-semibold">Aggiungi ingrediente</p>
                  <button onClick={() => { setUseCalc(p => !p); setCalcTot(''); setCalcPiatti('') }}
                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition ${useCalc ? 'border-[#D4AF37]/40 text-[#D4AF37] bg-[#D4AF37]/10' : 'border-[#3A3A3A] text-[#555] hover:border-[#555]'}`}>
                    <Calculator size={10} /> Calcolatore
                  </button>
                </div>
                <select value={selIngr} onChange={e => setSelIngr(e.target.value)}
                  className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60">
                  <option value="">Seleziona ingrediente...</option>
                  {ingredients.filter(i => !recipe.find(r => r.ingredient_id === i.id)).map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
                {useCalc ? (
                  <div className="bg-[#1A1A1A] border border-[#D4AF37]/20 rounded-lg p-3 flex flex-col gap-2">
                    <p className="text-[#D4AF37] text-xs font-semibold flex items-center gap-1"><Calculator size={10} /> Con X quantità faccio Y piatti</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[#555] text-xs mb-1">Quantità totale {selIngr ? `(${ingredients.find(i=>i.id===selIngr)?.unit})` : ''}</p>
                        <input type="number" step="0.001" value={calcTot} onChange={e => { setCalcTot(e.target.value); if (e.target.value && calcPiatti) setQty((parseFloat(e.target.value)/parseFloat(calcPiatti)).toFixed(4)) }}
                          placeholder="es. 5"
                          className="w-full bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
                      </div>
                      <div>
                        <p className="text-[#555] text-xs mb-1">N. piatti</p>
                        <input type="number" step="1" value={calcPiatti} onChange={e => { setCalcPiatti(e.target.value); if (calcTot && e.target.value) setQty((parseFloat(calcTot)/parseFloat(e.target.value)).toFixed(4)) }}
                          placeholder="es. 30"
                          className="w-full bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
                      </div>
                    </div>
                    {qty && calcTot && calcPiatti && (
                      <p className="text-emerald-400 text-xs text-center">
                        → <strong>{qty}</strong> {ingredients.find(i=>i.id===selIngr)?.unit ?? ''} per porzione
                      </p>
                    )}
                  </div>
                ) : (
                  <input type="number" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
                    placeholder="Quantità per porzione"
                    className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60" />
                )}
                <button onClick={handleAdd} disabled={saving || !selIngr || !qty}
                  className="w-full py-2 bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-40 hover:bg-[#c9a42e] transition">
                  {saving ? <RefreshCw size={12} className="animate-spin" /> : <><Plus size={12} /> Aggiungi</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Item Row ────────────────────────────────────────────────
function ItemRow({ item, onToggle, onEdit, onDelete }) {
  const [editing, setEditing]             = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showRecipe, setShowRecipe]       = useState(false)
  const [name, setName]                   = useState(item.name)
  const [price, setPrice]                 = useState(item.base_price)
  const [desc, setDesc]                   = useState(item.description ?? '')
  const [prep, setPrep]                   = useState(item.prep_time_mins ?? '')
  const [allergens, setAllergens]         = useState(item.allergens ?? [])
  const [saving, setSaving]               = useState(false)
  const { toast } = useToast()

  const toggleAllergen = (id) => setAllergens(prev =>
    prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
  )

  const handleSave = async () => {
    if (!name.trim() || !price) return
    setSaving(true)
    try {
      await onEdit(item.id, {
        name: name.trim(),
        base_price: parseFloat(price),
        description: desc.trim() || null,
        prep_time_mins: prep ? parseInt(prep) : null,
        allergens,
      })
      setEditing(false)
    } catch {
      toast({ type: 'error', title: 'Errore salvataggio' })
    } finally { setSaving(false) }
  }

  return (
    <>
      {showRecipe && <RecipeModal item={item} onClose={() => setShowRecipe(false)} />}
      <div className={`border-b border-[#2A2A2A] last:border-0 transition ${!item.is_available ? 'opacity-50' : ''}`}>
        {!editing ? (
          <div className="flex items-center gap-3 px-4 py-2.5">
            <button onClick={() => onToggle(item.id, !item.is_available)} className="flex-shrink-0">
              {item.is_available
                ? <ToggleRight size={18} className="text-emerald-400" />
                : <ToggleLeft size={18} className="text-[#444]" />}
            </button>
            <div className="flex-1 min-w-0">
              <span className="text-[#F5F5DC] text-sm">{item.name}</span>
              {item.description && <span className="text-[#555] text-xs ml-2 truncate">{item.description}</span>}
              {item.allergens?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.allergens.map(a => (
                    <span key={a} className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                      {ALLERGENS.find(x => x.id === a)?.label ?? a}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {item.prep_time_mins && (
              <span className="text-[#555] text-xs flex items-center gap-0.5">
                <Clock size={10} /> {item.prep_time_mins}m
              </span>
            )}
            <span className="text-[#D4AF37] text-sm font-semibold flex-shrink-0">{formatPrice(item.base_price)}</span>
            <button onClick={() => setShowRecipe(true)} className="text-[#444] hover:text-emerald-400 transition" title="Ricetta">
              <BookOpen size={13} />
            </button>
            <button onClick={() => setEditing(true)} className="text-[#444] hover:text-[#D4AF37] transition">
              <Pencil size={13} />
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => onDelete(item.id, item.name)}
                  className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md hover:bg-red-500/30 transition">
                  Sì, rimuovi
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-[#444] hover:text-[#888] transition">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-[#444] hover:text-red-400 transition shrink-0">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 flex flex-col gap-2 bg-[#1E1E1E]">
            <div className="grid grid-cols-2 gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome"
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Prezzo €"
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descrizione"
                className="col-span-2 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
              <input type="number" value={prep} onChange={e => setPrep(e.target.value)} placeholder="Prep min"
                className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
            </div>
            <div>
              <p className="text-[#555] text-xs mb-1.5 flex items-center gap-1"><AlertTriangle size={10} /> Allergeni</p>
              <div className="flex flex-wrap gap-1.5">
                {ALLERGENS.map(a => (
                  <button key={a.id} onClick={() => toggleAllergen(a.id)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition ${
                      allergens.includes(a.id)
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-transparent text-[#555] border-[#3A3A3A] hover:border-[#555]'
                    }`}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
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

// ─── New Item Form ────────────────────────────────────────────
function NewItemForm({ categoryId, onCreated, onCancel }) {
  const { toast } = useToast()
  const [name, setName]   = useState('')
  const [price, setPrice] = useState('')
  const [desc, setDesc]   = useState('')
  const [prep, setPrep]   = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !price) { toast({ type: 'warning', title: 'Nome e prezzo obbligatori' }); return }
    setSaving(true)
    try {
      await menuAPI.createItem({
        category_id: categoryId,
        name: name.trim(),
        base_price: parseFloat(price),
        description: desc.trim() || null,
        prep_time_mins: prep ? parseInt(prep) : null,
      })
      onCreated()
    } catch { toast({ type: 'error', title: 'Errore creazione' }) }
    finally { setSaving(false) }
  }

  return (
    <div className="px-4 py-3 bg-[#1E1E1E] border-b border-[#2A2A2A] flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome piatto *"
          className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
        <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Prezzo € *"
          className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descrizione (opz.)"
          className="col-span-2 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
        <input type="number" value={prep} onChange={e => setPrep(e.target.value)} placeholder="Prep min"
          className="bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-1.5 rounded-lg border border-[#3A3A3A] text-[#555] text-xs hover:text-[#888] transition">Annulla</button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-1.5 rounded-lg bg-[#D4AF37] text-[#1A1A1A] font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-40 hover:bg-[#c9a42e] transition">
          {saving ? <RefreshCw size={11} className="animate-spin" /> : <><Plus size={11} /> Aggiungi</>}
        </button>
      </div>
    </div>
  )
}

// ─── Category Card ────────────────────────────────────────────
function CategoryCard({ cat, onRefresh }) {
  const { toast } = useToast()
  const [expanded, setExpanded]   = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [name, setName]           = useState(cat.name)
  const [addingItem, setAddingItem] = useState(false)
  const [items, setItems]         = useState([])
  const [loadingItems, setLoadingItems] = useState(false)

  const loadItems = useCallback(async () => {
    setLoadingItems(true)
    try {
      const r = await menuAPI.allItemsAdmin(cat.id)
      setItems(r.data)
    } finally { setLoadingItems(false) }
  }, [cat.id])

  useEffect(() => { if (expanded) loadItems() }, [expanded, loadItems])

  const handleToggleCat = async () => {
    try {
      await (cat.is_active ? menuAPI.deleteCategory(cat.id) : menuAPI.updateCategory(cat.id, { is_active: true }))
      onRefresh()
    } catch { toast({ type: 'error', title: 'Errore' }) }
  }

  const handleRenameCat = async () => {
    if (!name.trim()) return
    try {
      await menuAPI.updateCategory(cat.id, { name: name.trim() })
      setEditingName(false)
      onRefresh()
      toast({ type: 'success', title: 'Categoria rinominata' })
    } catch { toast({ type: 'error', title: 'Errore' }) }
  }

  const handleToggleItem = async (id, isAvailable) => {
    try {
      await menuAPI.updateItem(id, { is_available: isAvailable })
      loadItems()
    } catch { toast({ type: 'error', title: 'Errore' }) }
  }

  const handleEditItem = async (id, data) => {
    await menuAPI.updateItem(id, data)
    await loadItems()
    toast({ type: 'success', title: 'Salvato' })
  }

  const handleDeleteItem = async (id, itemName) => {
    try {
      await menuAPI.deleteItem(id)
      loadItems()
      toast({ type: 'success', title: `"${itemName}" rimosso` })
    } catch { toast({ type: 'error', title: 'Errore rimozione' }) }
  }

  return (
    <div className={`bg-[#222] border rounded-2xl overflow-hidden ${cat.is_active ? 'border-[#3A3A3A]' : 'border-[#252525] opacity-60'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5">
        <button onClick={handleToggleCat} className="flex-shrink-0">
          {cat.is_active
            ? <ToggleRight size={20} className="text-emerald-400" />
            : <ToggleLeft size={20} className="text-[#444]" />}
        </button>

        {editingName ? (
          <div className="flex-1 flex items-center gap-2">
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleRenameCat(); if (e.key === 'Escape') setEditingName(false) }}
              className="flex-1 bg-[#2A2A2A] border border-[#D4AF37]/50 rounded-lg px-3 py-1 text-[#F5F5DC] text-sm outline-none" />
            <button onClick={handleRenameCat} className="text-emerald-400 hover:text-emerald-300"><Check size={15} /></button>
            <button onClick={() => { setName(cat.name); setEditingName(false) }} className="text-[#444] hover:text-[#888]"><X size={15} /></button>
          </div>
        ) : (
          <button onClick={() => setExpanded(p => !p)} className="flex-1 flex items-center gap-2 text-left">
            <span className="text-[#F5F5DC] font-semibold">{cat.name}</span>
            <span className="text-[#555] text-xs">{items.length > 0 ? `${items.filter(i => i.is_available).length}/${items.length} attivi` : ''}</span>
            {expanded ? <ChevronUp size={14} className="text-[#555] ml-auto" /> : <ChevronDown size={14} className="text-[#555] ml-auto" />}
          </button>
        )}

        {!editingName && (
          <button onClick={() => setEditingName(true)} className="text-[#444] hover:text-[#D4AF37] transition flex-shrink-0">
            <Pencil size={14} />
          </button>
        )}
      </div>

      {/* Items */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[#2A2A2A]">
            {loadingItems ? (
              <div className="flex justify-center py-4">
                <RefreshCw size={16} className="animate-spin text-[#555]" />
              </div>
            ) : (
              <>
                {items.map(item => (
                  <ItemRow key={item.id} item={item}
                    onToggle={handleToggleItem}
                    onEdit={handleEditItem}
                    onDelete={handleDeleteItem}
                  />
                ))}

                {addingItem ? (
                  <NewItemForm
                    categoryId={cat.id}
                    onCreated={() => { setAddingItem(false); loadItems() }}
                    onCancel={() => setAddingItem(false)}
                  />
                ) : (
                  <button onClick={() => setAddingItem(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[#555] hover:text-[#D4AF37] text-xs transition">
                    <Plus size={12} /> Aggiungi piatto
                  </button>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────
export default function MenuAdminPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [categories, setCategories] = useState([])
  const [loading, setLoading]       = useState(true)
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat]   = useState(false)
  const [savingCat, setSavingCat]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await menuAPI.allCategories()
      setCategories(r.data)
    } catch { toast({ type: 'error', title: 'Errore caricamento' }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreateCat = async () => {
    if (!newCatName.trim()) return
    setSavingCat(true)
    try {
      await menuAPI.createCategory({ name: newCatName.trim() })
      setNewCatName('')
      setAddingCat(false)
      load()
      toast({ type: 'success', title: 'Categoria creata' })
    } catch { toast({ type: 'error', title: 'Errore' }) }
    finally { setSavingCat(false) }
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <UtensilsCrossed size={17} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Gestione Menu</span>
        <span className="text-[#555] text-xs">{categories.filter(c => c.is_active).length} categorie attive</span>
        <button onClick={() => setAddingCat(p => !p)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:bg-[#c9a42e] transition">
          {addingCat ? <X size={13} /> : <Plus size={13} />} {addingCat ? 'Chiudi' : 'Nuova categoria'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw size={18} className="animate-spin text-[#555]" /></div>
        ) : (
          <>
            <AnimatePresence>
              {addingCat && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="bg-[#222] border border-[#3A3A3A] rounded-2xl p-4 flex items-center gap-3">
                  <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateCat(); if (e.key === 'Escape') setAddingCat(false) }}
                    placeholder="Nome categoria" autoFocus
                    className="flex-1 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm outline-none focus:border-[#D4AF37]/60 transition" />
                  <button onClick={handleCreateCat} disabled={savingCat}
                    className="px-4 py-2 bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm rounded-lg flex items-center gap-1.5 disabled:opacity-40 hover:bg-[#c9a42e] transition">
                    {savingCat ? <RefreshCw size={13} className="animate-spin" /> : <><Check size={13} /> Crea</>}
                  </button>
                  <button onClick={() => setAddingCat(false)} className="text-[#444] hover:text-[#888]"><X size={16} /></button>
                </motion.div>
              )}
            </AnimatePresence>

            {categories.length === 0 && !addingCat && (
              <div className="flex flex-col items-center gap-3 py-20">
                <UtensilsCrossed size={40} className="text-[#333]" />
                <p className="text-[#555] text-sm">Nessuna categoria ancora</p>
                <button onClick={() => setAddingCat(true)} className="text-[#D4AF37] text-sm hover:underline">Crea la prima</button>
              </div>
            )}

            {categories.map(cat => (
              <CategoryCard key={cat.id} cat={cat} onRefresh={load} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
