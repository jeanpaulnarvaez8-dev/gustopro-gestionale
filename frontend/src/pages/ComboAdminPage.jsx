import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, BookOpen, Plus, Trash2, Pencil, RefreshCw, Check, X,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { comboAPI, menuAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'
import { useToast } from '../context/ToastContext'

// ─── Inline field editor ─────────────────────────────────────
function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[#555] text-[10px] uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[#1A1A1A] border border-[#3A3A3A] rounded-lg px-3 py-2 text-[#F5F5DC] text-sm placeholder-[#444] outline-none focus:border-[#D4AF37]/60 transition"
      />
    </div>
  )
}

// ─── New Combo Form ──────────────────────────────────────────
function NewComboForm({ allItems, onCreated, onCancel }) {
  const { toast } = useToast()
  const [name, setName]         = useState('')
  const [price, setPrice]       = useState('')
  const [description, setDesc]  = useState('')
  const [courses, setCourses]   = useState([
    { name: 'Primo', min_choices: 1, max_choices: 1, items: [] },
    { name: 'Secondo', min_choices: 1, max_choices: 1, items: [] },
  ])
  const [saving, setSaving] = useState(false)

  const addCourse = () => setCourses(p => [...p, { name: '', min_choices: 1, max_choices: 1, items: [] }])
  const removeCourse = (i) => setCourses(p => p.filter((_, idx) => idx !== i))
  const updateCourse = (i, field, val) => setCourses(p => p.map((c, idx) => idx === i ? { ...c, [field]: val } : c))

  const toggleItem = (courseIdx, menuItemId) => {
    setCourses(p => p.map((c, i) => {
      if (i !== courseIdx) return c
      const has = c.items.some(it => it.menu_item_id === menuItemId)
      return {
        ...c,
        items: has
          ? c.items.filter(it => it.menu_item_id !== menuItemId)
          : [...c.items, { menu_item_id: menuItemId, price_supplement: 0 }],
      }
    }))
  }

  const updateSupplement = (courseIdx, menuItemId, val) => {
    setCourses(p => p.map((c, i) => {
      if (i !== courseIdx) return c
      return { ...c, items: c.items.map(it => it.menu_item_id === menuItemId ? { ...it, price_supplement: parseFloat(val) || 0 } : it) }
    }))
  }

  const handleSave = async () => {
    if (!name.trim()) { toast({ type: 'warning', title: 'Nome obbligatorio' }); return }
    if (!price || parseFloat(price) < 0) { toast({ type: 'warning', title: 'Prezzo non valido' }); return }
    setSaving(true)
    try {
      await comboAPI.create({
        name: name.trim(),
        price: parseFloat(price),
        description: description.trim() || null,
        courses: courses.map(c => ({
          name: c.name,
          min_choices: parseInt(c.min_choices) || 1,
          max_choices: parseInt(c.max_choices) || 1,
          items: c.items,
        })),
      })
      toast({ type: 'success', title: `${name} creato` })
      onCreated()
    } catch {
      toast({ type: 'error', title: 'Errore creazione' })
    } finally { setSaving(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#222] border border-[#3A3A3A] rounded-2xl p-5 flex flex-col gap-5">
      <h3 className="text-[#F5F5DC] font-bold flex items-center gap-2">
        <Plus size={16} className="text-[#D4AF37]" /> Nuovo Menù Fisso
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" value={name} onChange={setName} placeholder="es. Menù del giorno" />
        <Field label="Prezzo (€)" value={price} onChange={setPrice} type="number" placeholder="15.00" />
      </div>
      <Field label="Descrizione" value={description} onChange={setDesc} placeholder="Antipasto + primo + secondo + dolce…" />

      {/* Courses */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[#888] text-xs uppercase tracking-wider font-medium">Portate</span>
          <button onClick={addCourse}
            className="flex items-center gap-1 text-xs text-[#D4AF37] hover:text-[#c9a42e] transition">
            <Plus size={12} /> Aggiungi portata
          </button>
        </div>

        {courses.map((course, ci) => (
          <div key={ci} className="bg-[#2A2A2A] rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input value={course.name} onChange={e => updateCourse(ci, 'name', e.target.value)}
                placeholder="Nome portata"
                className="flex-1 bg-[#1A1A1A] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[#F5F5DC] text-sm placeholder-[#444] outline-none focus:border-[#D4AF37]/60 transition" />
              <div className="flex items-center gap-1 text-xs text-[#555]">
                <span>min</span>
                <input type="number" value={course.min_choices} onChange={e => updateCourse(ci, 'min_choices', e.target.value)}
                  min="1" max="10"
                  className="w-12 bg-[#1A1A1A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-sm text-center outline-none focus:border-[#D4AF37]/60 transition" />
                <span>max</span>
                <input type="number" value={course.max_choices} onChange={e => updateCourse(ci, 'max_choices', e.target.value)}
                  min="1" max="10"
                  className="w-12 bg-[#1A1A1A] border border-[#3A3A3A] rounded-lg px-2 py-1.5 text-[#F5F5DC] text-sm text-center outline-none focus:border-[#D4AF37]/60 transition" />
              </div>
              {courses.length > 1 && (
                <button onClick={() => removeCourse(ci)} className="text-[#444] hover:text-red-400 transition">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Item checkboxes */}
            <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto">
              {allItems.map(item => {
                const isSelected = course.items.some(it => it.menu_item_id === item.id)
                const entry = course.items.find(it => it.menu_item_id === item.id)
                return (
                  <div key={item.id} className="flex items-center gap-1.5">
                    <button onClick={() => toggleItem(ci, item.id)}
                      className={`flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-lg border text-left transition ${
                        isSelected
                          ? 'border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#F5F5DC]'
                          : 'border-[#333] text-[#555] hover:text-[#888]'
                      }`}>
                      <div className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center transition ${
                        isSelected ? 'bg-[#D4AF37] border-[#D4AF37]' : 'border-[#444]'
                      }`}>
                        {isSelected && <Check size={8} className="text-[#1A1A1A]" />}
                      </div>
                      <span className="text-[10px] truncate">{item.name}</span>
                    </button>
                    {isSelected && (
                      <input type="number" value={entry?.price_supplement || ''} onChange={e => updateSupplement(ci, item.id, e.target.value)}
                        placeholder="+€"
                        className="w-14 bg-[#1A1A1A] border border-[#3A3A3A] rounded px-1.5 py-1 text-[#888] text-[10px] text-right outline-none focus:border-[#D4AF37]/60 transition" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-[#3A3A3A] text-[#888] text-sm hover:text-[#F5F5DC] hover:border-[#555] transition">
          Annulla
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-2 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-[#c9a42e] transition">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <><Check size={14} /> Crea Menù</>}
        </button>
      </div>
    </motion.div>
  )
}

// ─── Combo Card ──────────────────────────────────────────────
function ComboCard({ combo, allItems, onRefresh }) {
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing]   = useState(false)
  const [name, setName]         = useState(combo.name)
  const [price, setPrice]       = useState(combo.price)
  const [description, setDesc]  = useState(combo.description ?? '')
  const [saving, setSaving]     = useState(false)

  const handleToggleActive = async () => {
    try {
      await comboAPI.update(combo.id, { is_active: !combo.is_active })
      toast({ type: 'success', title: combo.is_active ? 'Disattivato' : 'Attivato' })
      onRefresh()
    } catch { toast({ type: 'error', title: 'Errore' }) }
  }

  const handleSaveEdits = async () => {
    setSaving(true)
    try {
      await comboAPI.update(combo.id, { name, price: parseFloat(price), description: description || null })
      toast({ type: 'success', title: 'Salvato' })
      setEditing(false)
      onRefresh()
    } catch { toast({ type: 'error', title: 'Errore salvataggio' }) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Eliminare "${combo.name}"?`)) return
    try {
      await comboAPI.remove(combo.id)
      toast({ type: 'success', title: 'Eliminato' })
      onRefresh()
    } catch { toast({ type: 'error', title: 'Errore eliminazione' }) }
  }

  const handleAddCourse = async () => {
    const courseName = window.prompt('Nome della nuova portata:')
    if (!courseName?.trim()) return
    try {
      await comboAPI.addCourse(combo.id, { name: courseName.trim(), min_choices: 1, max_choices: 1 })
      toast({ type: 'success', title: 'Portata aggiunta' })
      onRefresh()
    } catch { toast({ type: 'error', title: 'Errore' }) }
  }

  const handleRemoveCourse = async (courseId, courseName) => {
    if (!window.confirm(`Rimuovere la portata "${courseName}"?`)) return
    try {
      await comboAPI.removeCourse(courseId)
      onRefresh()
    } catch { toast({ type: 'error', title: 'Errore' }) }
  }

  const handleToggleCourseItem = async (course, menuItemId, isCurrentlyIn) => {
    try {
      if (isCurrentlyIn) {
        const courseItem = course.items.find(it => it.menu_item_id === menuItemId)
        if (courseItem) await comboAPI.removeCourseItem(courseItem.id)
      } else {
        await comboAPI.addCourseItem(course.id, { menu_item_id: menuItemId, price_supplement: 0 })
      }
      onRefresh()
    } catch { toast({ type: 'error', title: 'Errore' }) }
  }

  return (
    <div className={`bg-[#222] border rounded-2xl overflow-hidden transition ${
      combo.is_active ? 'border-[#3A3A3A]' : 'border-[#2A2A2A] opacity-60'
    }`}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3">
        <button onClick={() => setExpanded(p => !p)} className="flex-1 flex items-center gap-3 text-left min-w-0">
          {expanded ? <ChevronUp size={16} className="text-[#555] flex-shrink-0" /> : <ChevronDown size={16} className="text-[#555] flex-shrink-0" />}
          <div className="min-w-0">
            <p className="text-[#F5F5DC] font-semibold truncate">{combo.name}</p>
            {combo.description && <p className="text-[#555] text-xs truncate">{combo.description}</p>}
          </div>
          <span className="text-[#D4AF37] font-bold text-sm flex-shrink-0 ml-auto">{formatPrice(combo.price)}</span>
        </button>

        <button onClick={handleToggleActive} className="text-[#555] hover:text-[#888] transition flex-shrink-0">
          {combo.is_active
            ? <ToggleRight size={20} className="text-emerald-400" />
            : <ToggleLeft size={20} />}
        </button>
        <button onClick={() => setEditing(p => !p)} className="text-[#555] hover:text-[#D4AF37] transition flex-shrink-0">
          <Pencil size={15} />
        </button>
        <button onClick={handleDelete} className="text-[#555] hover:text-red-400 transition flex-shrink-0">
          <Trash2 size={15} />
        </button>
      </div>

      {/* Edit fields */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[#3A3A3A]">
            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome" value={name} onChange={setName} />
                <Field label="Prezzo (€)" value={price} onChange={setPrice} type="number" />
              </div>
              <Field label="Descrizione" value={description} onChange={setDesc} />
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-xl border border-[#3A3A3A] text-[#888] text-xs hover:text-[#F5F5DC] transition">Annulla</button>
                <button onClick={handleSaveEdits} disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-[#D4AF37] text-[#1A1A1A] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 hover:bg-[#c9a42e] transition">
                  {saving ? <RefreshCw size={12} className="animate-spin" /> : <><Check size={12} /> Salva</>}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Courses detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[#3A3A3A]">
            <div className="px-5 py-4 flex flex-col gap-4">
              {combo.courses.map(course => (
                <div key={course.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#888] text-xs font-semibold uppercase tracking-wider">{course.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[#444] text-[10px]">min {course.min_choices} / max {course.max_choices}</span>
                      <button onClick={() => handleRemoveCourse(course.id, course.name)}
                        className="text-[#444] hover:text-red-400 transition">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {allItems.map(menuItem => {
                      const isIn = course.items.some(it => it.menu_item_id === menuItem.id)
                      return (
                        <button key={menuItem.id}
                          onClick={() => handleToggleCourseItem(course, menuItem.id, isIn)}
                          className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-left transition ${
                            isIn
                              ? 'border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#F5F5DC]'
                              : 'border-[#2E2E2E] text-[#555] hover:text-[#888] hover:border-[#3A3A3A]'
                          }`}>
                          <div className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ${
                            isIn ? 'bg-[#D4AF37] border-[#D4AF37]' : 'border-[#3A3A3A]'
                          }`}>
                            {isIn && <Check size={8} className="text-[#1A1A1A]" />}
                          </div>
                          <span className="text-[10px] truncate">{menuItem.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              <button onClick={handleAddCourse}
                className="flex items-center gap-1.5 text-xs text-[#555] hover:text-[#D4AF37] transition py-1">
                <Plus size={12} /> Aggiungi portata
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────
export default function ComboAdminPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [combos, setCombos]   = useState([])
  const [allItems, setAllItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [combosRes, itemsRes] = await Promise.all([
        comboAPI.list(),
        menuAPI.allItems(),
      ])
      setCombos(combosRes.data)
      setAllItems(itemsRes.data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento' })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <BookOpen size={17} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Menù Fissi</span>
        <span className="text-[#555] text-xs">{combos.filter(c => c.is_active).length} attivi</span>
        <button onClick={() => setShowNew(p => !p)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37] text-[#1A1A1A] rounded-lg text-xs font-semibold hover:bg-[#c9a42e] transition">
          {showNew ? <X size={13} /> : <Plus size={13} />} {showNew ? 'Chiudi' : 'Nuovo menù'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw size={18} className="animate-spin text-[#555]" />
          </div>
        ) : (
          <>
            <AnimatePresence>
              {showNew && (
                <NewComboForm
                  allItems={allItems}
                  onCreated={() => { setShowNew(false); load() }}
                  onCancel={() => setShowNew(false)}
                />
              )}
            </AnimatePresence>

            {combos.length === 0 && !showNew && (
              <div className="flex flex-col items-center gap-3 py-20">
                <BookOpen size={40} className="text-[#333]" />
                <p className="text-[#555] text-sm">Nessun menù fisso ancora</p>
                <button onClick={() => setShowNew(true)}
                  className="text-[#D4AF37] text-sm hover:underline">Crea il primo</button>
              </div>
            )}

            {combos.map(combo => (
              <ComboCard key={combo.id} combo={combo} allItems={allItems} onRefresh={load} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
