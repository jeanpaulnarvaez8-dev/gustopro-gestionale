import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, UtensilsCrossed, Plus, Pencil, Trash2, RefreshCw, Check, X,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Clock,
} from 'lucide-react'
import { menuAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'
import { useToast } from '../context/ToastContext'

// ─── Item Row ────────────────────────────────────────────────
function ItemRow({ item, onToggle, onEdit, onDelete }) {
  const [editing, setEditing]   = useState(false)
  const [name, setName]         = useState(item.name)
  const [price, setPrice]       = useState(item.base_price)
  const [desc, setDesc]         = useState(item.description ?? '')
  const [prep, setPrep]         = useState(item.prep_time_mins ?? '')
  const [saving, setSaving]     = useState(false)
  const { toast } = useToast()

  const handleSave = async () => {
    if (!name.trim() || !price) return
    setSaving(true)
    try {
      await onEdit(item.id, {
        name: name.trim(),
        base_price: parseFloat(price),
        description: desc.trim() || null,
        prep_time_mins: prep ? parseInt(prep) : null,
      })
      setEditing(false)
    } catch {
      toast({ type: 'error', title: 'Errore salvataggio' })
    } finally { setSaving(false) }
  }

  return (
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
          </div>
          {item.prep_time_mins && (
            <span className="text-[#555] text-xs flex items-center gap-0.5">
              <Clock size={10} /> {item.prep_time_mins}m
            </span>
          )}
          <span className="text-[#D4AF37] text-sm font-semibold flex-shrink-0">{formatPrice(item.base_price)}</span>
          <button onClick={() => setEditing(true)} className="text-[#444] hover:text-[#D4AF37] transition">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(item.id, item.name)} className="text-[#444] hover:text-red-400 transition">
            <Trash2 size={13} />
          </button>
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
    if (!window.confirm(`Disattivare "${itemName}"?`)) return
    try {
      await menuAPI.deleteItem(id)
      loadItems()
      toast({ type: 'success', title: 'Disattivato' })
    } catch { toast({ type: 'error', title: 'Errore' }) }
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
