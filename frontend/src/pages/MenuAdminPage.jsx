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
import { Card, Badge, Button, Modal } from '../components/v2'

const ALLERGENS = [
  { id: 'glutine',      label: 'Glutine' },
  { id: 'crostacei',    label: 'Crostacei' },
  { id: 'uova',         label: 'Uova' },
  { id: 'pesce',        label: 'Pesce' },
  { id: 'arachidi',     label: 'Arachidi' },
  { id: 'soia',         label: 'Soia' },
  { id: 'latte',        label: 'Latte' },
  { id: 'fruttaGuscio', label: 'Frutta a guscio' },
  { id: 'sedano',       label: 'Sedano' },
  { id: 'senape',       label: 'Senape' },
  { id: 'sesamo',       label: 'Sesamo' },
  { id: 'solfiti',      label: 'Solfiti' },
  { id: 'lupini',       label: 'Lupini' },
  { id: 'molluschi',    label: 'Molluschi' },
]

const inputCls = 'bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-3)] outline-none transition'

// ─── Recipe Modal ────────────────────────────────────────────────────────────
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
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`Ricetta: ${item.name}`}
      description="Ingredienti per porzione"
    >
      <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
          </div>
        ) : (
          <>
            {recipe.length === 0 && (
              <p className="text-[var(--color-text-3)] text-sm text-center py-4">Nessun ingrediente nella ricetta</p>
            )}
            {recipe.map(r => (
              <div key={r.id} className="flex items-center gap-3 bg-[var(--color-surface-2)] rounded-lg px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--color-text)] text-sm font-semibold">{r.name}</p>
                  <p className="text-[var(--color-text-3)] text-xs tnum">{r.quantity} {r.unit} per porzione</p>
                </div>
                <Badge tone={r.current_stock <= 0 ? 'err' : 'ok'} size="sm">
                  Stock: {parseFloat(r.current_stock).toFixed(2)} {r.unit}
                </Badge>
                <button
                  onClick={() => handleRemove(r.id)}
                  className="text-[var(--color-text-3)] hover:text-[var(--color-err)] hover:bg-[var(--color-err-soft)] transition p-1.5 rounded-lg"
                  aria-label="Rimuovi"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            <div className="border-t border-[var(--color-border-soft)] pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider">Aggiungi ingrediente</p>
                <button
                  onClick={() => { setUseCalc(p => !p); setCalcTot(''); setCalcPiatti('') }}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition ${
                    useCalc
                      ? 'border-[var(--color-gold-ring)] text-[var(--color-gold)] bg-[var(--color-gold-soft)]'
                      : 'border-[var(--color-border-strong)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]'
                  }`}
                >
                  <Calculator size={10} /> Calcolatore
                </button>
              </div>
              <select value={selIngr} onChange={e => setSelIngr(e.target.value)} className={inputCls}>
                <option value="">Seleziona ingrediente…</option>
                {ingredients.filter(i => !recipe.find(r => r.ingredient_id === i.id)).map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                ))}
              </select>
              {useCalc ? (
                <Card variant="outline" padding="md" className="border-[var(--color-gold-ring)] flex flex-col gap-2">
                  <p className="text-[var(--color-gold)] text-xs font-semibold flex items-center gap-1">
                    <Calculator size={10} /> Con X quantità faccio Y piatti
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[var(--color-text-3)] text-xs mb-1">Quantità totale {selIngr ? `(${ingredients.find(i=>i.id===selIngr)?.unit})` : ''}</p>
                      <input
                        type="number" step="0.001"
                        value={calcTot}
                        onChange={e => { setCalcTot(e.target.value); if (e.target.value && calcPiatti) setQty((parseFloat(e.target.value)/parseFloat(calcPiatti)).toFixed(4)) }}
                        placeholder="es. 5"
                        className={`${inputCls} w-full tnum`}
                      />
                    </div>
                    <div>
                      <p className="text-[var(--color-text-3)] text-xs mb-1">N. piatti</p>
                      <input
                        type="number" step="1"
                        value={calcPiatti}
                        onChange={e => { setCalcPiatti(e.target.value); if (calcTot && e.target.value) setQty((parseFloat(calcTot)/parseFloat(e.target.value)).toFixed(4)) }}
                        placeholder="es. 30"
                        className={`${inputCls} w-full tnum`}
                      />
                    </div>
                  </div>
                  {qty && calcTot && calcPiatti && (
                    <p className="text-[var(--color-ok)] text-xs text-center font-semibold">
                      → <strong>{qty}</strong> {ingredients.find(i=>i.id===selIngr)?.unit ?? ''} per porzione
                    </p>
                  )}
                </Card>
              ) : (
                <input
                  type="number" step="0.001"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  placeholder="Quantità per porzione"
                  className={`${inputCls} tnum`}
                />
              )}
              <Button
                fullWidth
                loading={saving}
                disabled={!selIngr || !qty}
                leftIcon={<Plus size={12} />}
                onClick={handleAdd}
              >
                Aggiungi
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ─── Item Row ────────────────────────────────────────────────────────────────
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
      <div className={`border-b border-[var(--color-border-soft)] last:border-0 transition ${!item.is_available ? 'opacity-50' : ''}`}>
        {!editing ? (
          <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
            <button onClick={() => onToggle(item.id, !item.is_available)} className="flex-shrink-0">
              {item.is_available
                ? <ToggleRight size={18} className="text-[var(--color-ok)]" />
                : <ToggleLeft size={18} className="text-[var(--color-text-3)]" />}
            </button>
            <div className="flex-1 min-w-0">
              <span className="text-[var(--color-text)] text-sm font-semibold">{item.name}</span>
              {item.description && <span className="text-[var(--color-text-3)] text-xs ml-2 truncate">{item.description}</span>}
              {item.allergens?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.allergens.map(a => (
                    <Badge key={a} tone="warn" size="sm">
                      {ALLERGENS.find(x => x.id === a)?.label ?? a}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {item.prep_time_mins && (
              <span className="text-[var(--color-text-3)] text-xs flex items-center gap-0.5 tnum">
                <Clock size={11} /> {item.prep_time_mins}m
              </span>
            )}
            <span className="text-[var(--color-gold)] text-sm font-bold flex-shrink-0 tnum">{formatPrice(item.base_price)}</span>
            <button
              onClick={() => setShowRecipe(true)}
              className="text-[var(--color-text-3)] hover:text-[var(--color-ok)] hover:bg-[var(--color-ok-soft)] transition p-1.5 rounded-lg"
              title="Ricetta"
            >
              <BookOpen size={13} />
            </button>
            <button
              onClick={() => setEditing(true)}
              className="text-[var(--color-text-3)] hover:text-[var(--color-gold)] hover:bg-[var(--color-gold-soft)] transition p-1.5 rounded-lg"
              title="Modifica"
            >
              <Pencil size={13} />
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onDelete(item.id, item.name)}
                  className="text-xs bg-[var(--color-err-soft)] text-[var(--color-err)] border border-[var(--color-err)]/30 px-2 py-1 rounded-md hover:brightness-125 font-semibold transition"
                >
                  Sì, rimuovi
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-[var(--color-text-3)] hover:text-[var(--color-text)] transition p-1">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-[var(--color-text-3)] hover:text-[var(--color-err)] hover:bg-[var(--color-err-soft)] transition shrink-0 p-1.5 rounded-lg"
                title="Elimina"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 flex flex-col gap-2 bg-[var(--color-surface-2)]">
            <div className="grid grid-cols-2 gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome" className={inputCls} />
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Prezzo €" className={`${inputCls} tnum`} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descrizione" className={`${inputCls} col-span-2`} />
              <input type="number" value={prep} onChange={e => setPrep(e.target.value)} placeholder="Prep min" className={`${inputCls} tnum`} />
            </div>
            <div>
              <p className="text-[var(--color-text-3)] text-xs mb-1.5 flex items-center gap-1 uppercase tracking-wider font-semibold">
                <AlertTriangle size={10} /> Allergeni
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ALLERGENS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => toggleAllergen(a.id)}
                    className={`text-xs px-2 py-1 rounded-full border transition font-semibold ${
                      allergens.includes(a.id)
                        ? 'bg-[var(--color-warn-soft)] text-[var(--color-warn)] border-[var(--color-warn)]/40'
                        : 'bg-transparent text-[var(--color-text-3)] border-[var(--color-border-strong)] hover:border-[var(--color-text-3)]'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" fullWidth onClick={() => setEditing(false)}>Annulla</Button>
              <Button size="sm" fullWidth loading={saving} leftIcon={<Check size={11} />} onClick={handleSave}>Salva</Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── New Item Form ───────────────────────────────────────────────────────────
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
    <div className="px-4 py-3 bg-[var(--color-surface-2)] border-b border-[var(--color-border-soft)] flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome piatto *" className={inputCls} />
        <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Prezzo € *" className={`${inputCls} tnum`} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descrizione (opz.)" className={`${inputCls} col-span-2`} />
        <input type="number" value={prep} onChange={e => setPrep(e.target.value)} placeholder="Prep min" className={`${inputCls} tnum`} />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" fullWidth onClick={onCancel}>Annulla</Button>
        <Button size="sm" fullWidth loading={saving} leftIcon={<Plus size={11} />} onClick={handleSave}>Aggiungi</Button>
      </div>
    </div>
  )
}

// ─── Category Card ───────────────────────────────────────────────────────────
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
    <Card padding="none" className={`overflow-hidden ${!cat.is_active ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-[var(--color-surface-2)]">
        <button onClick={handleToggleCat} className="flex-shrink-0">
          {cat.is_active
            ? <ToggleRight size={20} className="text-[var(--color-ok)]" />
            : <ToggleLeft size={20} className="text-[var(--color-text-3)]" />}
        </button>

        {editingName ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleRenameCat(); if (e.key === 'Escape') setEditingName(false) }}
              className={`${inputCls} flex-1 border-[var(--color-gold-ring)]`}
            />
            <button onClick={handleRenameCat} className="text-[var(--color-ok)] p-1"><Check size={16} /></button>
            <button onClick={() => { setName(cat.name); setEditingName(false) }} className="text-[var(--color-text-3)] hover:text-[var(--color-text)] p-1"><X size={16} /></button>
          </div>
        ) : (
          <button onClick={() => setExpanded(p => !p)} className="flex-1 flex items-center gap-2 text-left">
            <span className="serif text-[var(--color-text)] font-bold text-base tracking-tight">{cat.name}</span>
            <span className="text-[var(--color-text-3)] text-xs tnum">
              {items.length > 0 ? `${items.filter(i => i.is_available).length}/${items.length} attivi` : ''}
            </span>
            {expanded ? <ChevronUp size={14} className="text-[var(--color-text-3)] ml-auto" /> : <ChevronDown size={14} className="text-[var(--color-text-3)] ml-auto" />}
          </button>
        )}

        {!editingName && (
          <button onClick={() => setEditingName(true)} className="text-[var(--color-text-3)] hover:text-[var(--color-gold)] transition flex-shrink-0 p-1">
            <Pencil size={14} />
          </button>
        )}
      </div>

      {/* Items */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[var(--color-border-soft)]"
          >
            {loadingItems ? (
              <div className="flex justify-center py-4">
                <RefreshCw size={16} className="animate-spin text-[var(--color-gold)]" />
              </div>
            ) : (
              <>
                {items.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
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
                  <button
                    onClick={() => setAddingItem(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-3 text-[var(--color-text-3)] hover:text-[var(--color-gold)] text-xs font-semibold transition"
                  >
                    <Plus size={12} /> Aggiungi piatto
                  </button>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
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
  }, []) // eslint-disable-line

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
    <div className="min-h-screen flex flex-col">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <UtensilsCrossed size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">Gestione menu</h1>
        <Badge tone="neutral" size="sm">{categories.filter(c => c.is_active).length} categorie</Badge>
        <Button
          size="sm"
          leftIcon={addingCat ? <X size={13} /> : <Plus size={13} />}
          onClick={() => setAddingCat(p => !p)}
          className="ml-auto"
        >
          {addingCat ? 'Chiudi' : 'Nuova categoria'}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-3 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento menu…</span>
          </div>
        ) : (
          <>
            <AnimatePresence>
              {addingCat && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <Card padding="md" className="flex items-center gap-3">
                    <input
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateCat(); if (e.key === 'Escape') setAddingCat(false) }}
                      placeholder="Nome categoria"
                      autoFocus
                      className={`${inputCls} flex-1`}
                    />
                    <Button loading={savingCat} leftIcon={<Check size={13} />} onClick={handleCreateCat}>
                      Crea
                    </Button>
                    <button onClick={() => setAddingCat(false)} className="text-[var(--color-text-3)] hover:text-[var(--color-text)] p-2">
                      <X size={16} />
                    </button>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {categories.length === 0 && !addingCat && (
              <div className="flex flex-col items-center gap-3 py-20 text-[var(--color-text-3)]">
                <UtensilsCrossed size={48} className="text-[var(--color-text-3)]/40" />
                <p className="serif text-[var(--color-text-2)] text-base font-bold">Nessuna categoria ancora</p>
                <button onClick={() => setAddingCat(true)} className="text-[var(--color-gold)] text-sm hover:underline font-semibold">
                  Crea la prima
                </button>
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
