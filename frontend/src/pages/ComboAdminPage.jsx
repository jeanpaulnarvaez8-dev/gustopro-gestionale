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
import { Card, Button, useConfirm } from '../components/v2'

const inputCls = 'bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-3)] outline-none transition'

// ─── Inline field editor ─────────────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--color-text-3)] text-[10px] uppercase tracking-wider font-semibold">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} ${type === 'number' ? 'tnum' : ''}`}
      />
    </div>
  )
}

// ─── New Combo Form ──────────────────────────────────────────────────────────
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
          min_choices: parseInt(c.min_choices, 10) || 1,
          max_choices: parseInt(c.max_choices, 10) || 1,
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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card padding="lg" className="flex flex-col gap-5">
        <h3 className="serif text-[var(--color-text)] font-bold tracking-tight flex items-center gap-2 text-lg">
          <Plus size={18} className="text-[var(--color-gold)]" /> Nuovo menù fisso
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" value={name} onChange={setName} placeholder="es. Menù del giorno" />
          <Field label="Prezzo (€)" value={price} onChange={setPrice} type="number" placeholder="15.00" />
        </div>
        <Field label="Descrizione" value={description} onChange={setDesc} placeholder="Antipasto + primo + secondo + dolce…" />

        {/* Courses */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-2)] text-xs uppercase tracking-wider font-semibold">Portate</span>
            <button
              onClick={addCourse}
              className="flex items-center gap-1 text-xs text-[var(--color-gold)] hover:brightness-125 transition font-semibold"
            >
              <Plus size={12} /> Aggiungi portata
            </button>
          </div>

          {courses.map((course, ci) => (
            <Card key={ci} variant="outline" padding="md" className="flex flex-col gap-3 bg-[var(--color-surface-2)]">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={course.name}
                  onChange={e => updateCourse(ci, 'name', e.target.value)}
                  placeholder="Nome portata"
                  className={`${inputCls} flex-1 min-w-[120px]`}
                />
                <div className="flex items-center gap-1 text-xs text-[var(--color-text-3)] uppercase tracking-wider font-semibold">
                  <span>min</span>
                  <input
                    type="number"
                    value={course.min_choices}
                    onChange={e => updateCourse(ci, 'min_choices', e.target.value)}
                    min="1" max="10"
                    className={`${inputCls} w-14 text-center tnum`}
                  />
                  <span>max</span>
                  <input
                    type="number"
                    value={course.max_choices}
                    onChange={e => updateCourse(ci, 'max_choices', e.target.value)}
                    min="1" max="10"
                    className={`${inputCls} w-14 text-center tnum`}
                  />
                </div>
                {courses.length > 1 && (
                  <button onClick={() => removeCourse(ci)} className="text-[var(--color-text-3)] hover:text-[var(--color-err)] transition p-1.5">
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
                      <button
                        onClick={() => toggleItem(ci, item.id)}
                        className={`flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-lg border text-left transition ${
                          isSelected
                            ? 'border-[var(--color-gold-ring)] bg-[var(--color-gold-soft)] text-[var(--color-text)]'
                            : 'border-[var(--color-border-strong)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center transition ${
                          isSelected ? 'bg-[var(--color-gold)] border-[var(--color-gold)]' : 'border-[var(--color-text-3)]'
                        }`}>
                          {isSelected && <Check size={8} className="text-[#13181C]" />}
                        </div>
                        <span className="text-[11px] truncate font-medium">{item.name}</span>
                      </button>
                      {isSelected && (
                        <input
                          type="number"
                          value={entry?.price_supplement || ''}
                          onChange={e => updateSupplement(ci, item.id, e.target.value)}
                          placeholder="+€"
                          className="w-14 bg-[var(--color-surface)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] rounded px-1.5 py-1 text-[var(--color-text-2)] text-[10px] text-right outline-none transition tnum"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onCancel}>Annulla</Button>
          <Button fullWidth loading={saving} leftIcon={<Check size={14} />} onClick={handleSave}>
            Crea menù
          </Button>
        </div>
      </Card>
    </motion.div>
  )
}

// ─── Combo Card ──────────────────────────────────────────────────────────────
function ComboCard({ combo, allItems, onRefresh }) {
  const { toast } = useToast()
  const { confirm, prompt } = useConfirm()
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
    const ok = await confirm({
      title: `Eliminare "${combo.name}"?`,
      description: 'Il menu combo viene rimosso. Gli ordini storici restano.',
      tone: 'danger',
      confirmText: 'Sì, elimina',
    })
    if (!ok) return
    try {
      await comboAPI.remove(combo.id)
      toast({ type: 'success', title: 'Eliminato' })
      onRefresh()
    } catch { toast({ type: 'error', title: 'Errore eliminazione' }) }
  }

  const handleAddCourse = async () => {
    const courseName = await prompt({
      title: 'Nuova portata',
      placeholder: 'Antipasti, primi, secondi…',
      confirmText: 'Aggiungi',
      validate: (v) => (v.trim().length < 2 ? 'Nome troppo corto' : null),
    })
    if (!courseName) return
    try {
      await comboAPI.addCourse(combo.id, { name: courseName.trim(), min_choices: 1, max_choices: 1 })
      toast({ type: 'success', title: 'Portata aggiunta' })
      onRefresh()
    } catch { toast({ type: 'error', title: 'Errore' }) }
  }

  const handleRemoveCourse = async (courseId, courseName) => {
    const ok = await confirm({
      title: `Rimuovere la portata "${courseName}"?`,
      tone: 'danger',
      confirmText: 'Sì, rimuovi',
    })
    if (!ok) return
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
    <Card padding="none" className={`overflow-hidden transition ${!combo.is_active ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3 bg-[var(--color-surface-2)]">
        <button onClick={() => setExpanded(p => !p)} className="flex-1 flex items-center gap-3 text-left min-w-0">
          {expanded ? <ChevronUp size={16} className="text-[var(--color-text-3)] flex-shrink-0" /> : <ChevronDown size={16} className="text-[var(--color-text-3)] flex-shrink-0" />}
          <div className="min-w-0">
            <p className="serif text-[var(--color-text)] font-bold tracking-tight truncate text-base">{combo.name}</p>
            {combo.description && <p className="text-[var(--color-text-3)] text-xs truncate">{combo.description}</p>}
          </div>
          <span className="serif text-[var(--color-gold)] font-bold text-base flex-shrink-0 ml-auto tnum">
            {formatPrice(combo.price)}
          </span>
        </button>

        <button onClick={handleToggleActive} className="text-[var(--color-text-3)] hover:text-[var(--color-text)] transition flex-shrink-0">
          {combo.is_active
            ? <ToggleRight size={20} className="text-[var(--color-ok)]" />
            : <ToggleLeft size={20} />}
        </button>
        <button onClick={() => setEditing(p => !p)} className="text-[var(--color-text-3)] hover:text-[var(--color-gold)] transition flex-shrink-0 p-1">
          <Pencil size={15} />
        </button>
        <button onClick={handleDelete} className="text-[var(--color-text-3)] hover:text-[var(--color-err)] transition flex-shrink-0 p-1">
          <Trash2 size={15} />
        </button>
      </div>

      {/* Edit fields */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[var(--color-border-soft)]"
          >
            <div className="px-5 py-4 flex flex-col gap-3 bg-[var(--color-surface)]">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome" value={name} onChange={setName} />
                <Field label="Prezzo (€)" value={price} onChange={setPrice} type="number" />
              </div>
              <Field label="Descrizione" value={description} onChange={setDesc} />
              <div className="flex gap-2">
                <Button variant="secondary" fullWidth size="sm" onClick={() => setEditing(false)}>Annulla</Button>
                <Button fullWidth size="sm" loading={saving} leftIcon={<Check size={12} />} onClick={handleSaveEdits}>Salva</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Courses detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[var(--color-border-soft)]"
          >
            <div className="px-5 py-4 flex flex-col gap-4">
              {combo.courses.map(course => (
                <div key={course.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider">{course.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-text-3)] text-[10px] tnum">min {course.min_choices} / max {course.max_choices}</span>
                      <button onClick={() => handleRemoveCourse(course.id, course.name)} className="text-[var(--color-text-3)] hover:text-[var(--color-err)] transition p-1">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {allItems.map(menuItem => {
                      const isIn = course.items.some(it => it.menu_item_id === menuItem.id)
                      return (
                        <button
                          key={menuItem.id}
                          onClick={() => handleToggleCourseItem(course, menuItem.id, isIn)}
                          className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-left transition ${
                            isIn
                              ? 'border-[var(--color-gold-ring)] bg-[var(--color-gold-soft)] text-[var(--color-text)]'
                              : 'border-[var(--color-border-soft)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)] hover:border-[var(--color-border-strong)]'
                          }`}
                        >
                          <div className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ${
                            isIn ? 'bg-[var(--color-gold)] border-[var(--color-gold)]' : 'border-[var(--color-border-strong)]'
                          }`}>
                            {isIn && <Check size={8} className="text-[#13181C]" />}
                          </div>
                          <span className="text-[11px] truncate font-medium">{menuItem.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              <button
                onClick={handleAddCourse}
                className="flex items-center gap-1.5 text-xs text-[var(--color-text-3)] hover:text-[var(--color-gold)] transition py-1 font-semibold"
              >
                <Plus size={12} /> Aggiungi portata
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
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
  }, []) // eslint-disable-line

  useEffect(() => { load() }, [load])

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
        <BookOpen size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">Menù fissi</h1>
        <span className="text-[var(--color-text-3)] text-xs tnum">{combos.filter(c => c.is_active).length} attivi</span>
        <Button
          size="sm"
          leftIcon={showNew ? <X size={13} /> : <Plus size={13} />}
          onClick={() => setShowNew(p => !p)}
          className="ml-auto"
        >
          {showNew ? 'Chiudi' : 'Nuovo menù'}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento menù…</span>
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
              <div className="flex flex-col items-center gap-3 py-20 text-[var(--color-text-3)]">
                <BookOpen size={48} className="text-[var(--color-text-3)]/40" />
                <p className="serif text-[var(--color-text-2)] text-base font-bold">Nessun menù fisso ancora</p>
                <button onClick={() => setShowNew(true)} className="text-[var(--color-gold)] text-sm hover:underline font-semibold">
                  Crea il primo
                </button>
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
