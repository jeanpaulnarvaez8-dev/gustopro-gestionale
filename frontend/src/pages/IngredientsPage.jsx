import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Package, Plus, Pencil, RefreshCw, Check, X,
  ArrowUp, AlertTriangle, TrendingDown, History, ScanLine,
} from 'lucide-react'
import { ingredientsAPI, inventoryAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { Card, Badge, Button, Modal } from '../components/v2'
import BarcodeScanner from '../components/BarcodeScanner'

const UNITS = ['kg', 'g', 'lt', 'ml', 'pz', 'bt', 'sc']

const inputCls = 'bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-ring)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm placeholder:text-[var(--color-text-3)] outline-none transition'

const ADJUST_TYPES = [
  { v: 'in',         l: 'Carico',    tone: 'ok'   },
  { v: 'out',        l: 'Scarico',   tone: 'err'  },
  { v: 'adjustment', l: 'Rettifica', tone: 'sea'  },
]

const TONE_BTN = {
  ok:  'border-[var(--color-ok)]/40   text-[var(--color-ok)]   bg-[var(--color-ok-soft)]',
  err: 'border-[var(--color-err)]/40  text-[var(--color-err)]  bg-[var(--color-err-soft)]',
  sea: 'border-[var(--color-sea)]/40  text-[var(--color-sea)]  bg-[var(--color-sea-soft)]',
}

// ─── Stock Adjust Modal ─────────────────────────────────────────────────────
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
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={ingredient.name}
      description={
        <span className="text-[var(--color-text-2)] text-sm">
          Stock attuale: <span className="text-[var(--color-text)] font-bold tnum">{parseFloat(ingredient.current_stock).toFixed(3)} {ingredient.unit}</span>
        </span>
      }
      footer={
        <Button
          fullWidth
          size="lg"
          loading={saving}
          disabled={!qty}
          leftIcon={<Check size={14} />}
          onClick={handle}
        >
          Conferma
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {ADJUST_TYPES.map(({ v, l, tone }) => (
            <button
              key={v}
              type="button"
              onClick={() => setType(v)}
              className={`py-2.5 rounded-lg border text-xs font-semibold transition ${
                type === v
                  ? TONE_BTN[tone]
                  : 'border-[var(--color-border-strong)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          type="number"
          step="0.001"
          value={qty}
          onChange={e => setQty(e.target.value)}
          placeholder={`Quantità (${ingredient.unit})`}
          autoFocus
          className={`${inputCls} tnum`}
        />
        <input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Note (opz.)"
          className={inputCls}
        />
      </div>
    </Modal>
  )
}

// ─── Movements Modal ─────────────────────────────────────────────────────────
function MovementsModal({ ingredient, onClose }) {
  const [movements, setMovements] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    ingredientsAPI.movements(ingredient.id)
      .then(r => setMovements(r.data))
      .finally(() => setLoading(false))
  }, [ingredient.id])

  const typeColor = { in: 'text-[var(--color-ok)]', out: 'text-[var(--color-err)]', adjustment: 'text-[var(--color-sea)]' }
  const typeLabel = { in: 'Carico', out: 'Scarico', adjustment: 'Rettifica' }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`Movimenti: ${ingredient.name}`}
    >
      <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
          </div>
        ) : movements.length === 0 ? (
          <p className="text-[var(--color-text-3)] text-sm text-center py-8">Nessun movimento registrato</p>
        ) : movements.map(m => (
          <div key={m.id} className="flex items-center gap-3 bg-[var(--color-surface-2)] rounded-lg px-3 py-2.5">
            <span className={`text-xs font-bold w-20 ${typeColor[m.type]}`}>{typeLabel[m.type]}</span>
            <span className={`text-sm font-bold tnum ${m.type === 'out' ? 'text-[var(--color-err)]' : 'text-[var(--color-ok)]'}`}>
              {m.type === 'out' ? '-' : '+'}{Math.abs(m.quantity)} {ingredient.unit}
            </span>
            <div className="flex-1 text-right">
              <p className="text-[var(--color-text-2)] text-xs font-medium">{m.created_by_name ?? 'Sistema'}</p>
              <p className="text-[var(--color-text-3)] text-[10px] tnum">
                {new Date(m.created_at).toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ─── Ingredient Row ──────────────────────────────────────────────────────────
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
  const barColor = pct < 50 ? 'bg-[var(--color-err)]' : pct < 100 ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-ok)]'

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

      <Card padding="none" className={`overflow-hidden ${isLow ? 'border-[var(--color-warn)]/40' : ''}`}>
        {!editing ? (
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              {isLow && <AlertTriangle size={14} className="text-[var(--color-warn)] shrink-0" />}
              <div className="flex-1 min-w-0">
                <span className="text-[var(--color-text)] text-sm font-semibold">{ingr.name}</span>
                {ingr.supplier_name && <span className="text-[var(--color-text-3)] text-xs ml-2">{ingr.supplier_name}</span>}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-bold tnum ${isLow ? 'text-[var(--color-warn)]' : 'text-[var(--color-ok)]'}`}>
                  {parseFloat(ingr.current_stock).toFixed(3)} {ingr.unit}
                </p>
                {ingr.min_stock > 0 && (
                  <p className="text-[var(--color-text-3)] text-xs tnum">min: {parseFloat(ingr.min_stock).toFixed(3)}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setHistory(true)}
                  className="text-[var(--color-text-3)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] transition p-1.5 rounded-lg"
                  title="Movimenti"
                >
                  <History size={13} />
                </button>
                <button
                  onClick={() => setAdjusting(true)}
                  className="text-[var(--color-text-3)] hover:text-[var(--color-ok)] hover:bg-[var(--color-ok-soft)] transition p-1.5 rounded-lg"
                  title="Aggiusta stock"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="text-[var(--color-text-3)] hover:text-[var(--color-gold)] hover:bg-[var(--color-gold-soft)] transition p-1.5 rounded-lg"
                  title="Modifica"
                >
                  <Pencil size={13} />
                </button>
              </div>
            </div>
            {ingr.min_stock > 0 && (
              <div className="mt-2 h-1 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 bg-[var(--color-surface-2)] flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome" className={inputCls} />
              <select value={unit} onChange={e => setUnit(e.target.value)} className={inputCls}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" step="0.001" value={minStock} onChange={e => setMinStock(e.target.value)} placeholder="Stock minimo" className={`${inputCls} tnum`} />
              <input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} placeholder="Costo/unità €" className={`${inputCls} tnum`} />
            </div>
            <select value={suppId} onChange={e => setSuppId(e.target.value)} className={inputCls}>
              <option value="">Nessun fornitore</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" fullWidth onClick={() => setEditing(false)}>Annulla</Button>
              <Button size="sm" fullWidth loading={saving} leftIcon={<Check size={11} />} onClick={handleSave}>Salva</Button>
            </div>
          </div>
        )}
      </Card>
    </>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function IngredientsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [ingredients, setIngredients] = useState([])
  const [suppliers, setSuppliers]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [adding, setAdding]           = useState(false)
  const [filter, setFilter]           = useState('all')
  const [newName, setNewName]         = useState('')
  const [newUnit, setNewUnit]         = useState('kg')
  const [newStock, setNewStock]       = useState('')
  const [newMin, setNewMin]           = useState('')
  const [newCost, setNewCost]         = useState('')
  const [newBarcode, setNewBarcode]   = useState('')
  const [newSupplierCode, setNewSupplierCode] = useState('')
  const [saving, setSaving]           = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  // Scanner workflow state: 'lookup' | 'quick-receive' | 'new-ingredient'
  const [scanFlow, setScanFlow]       = useState(null) // { mode, barcode, ingredient? }

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
  }, []) // eslint-disable-line

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
        barcode: newBarcode.trim() || null,
        supplier_code: newSupplierCode.trim() || null,
      })
      setNewName(''); setNewUnit('kg'); setNewStock(''); setNewMin(''); setNewCost('')
      setNewBarcode(''); setNewSupplierCode('')
      setAdding(false)
      load()
      toast({ type: 'success', title: 'Ingrediente creato' })
    } catch (err) {
      const msg = err?.response?.data?.error
      toast({ type: 'error', title: msg && /duplicate/i.test(msg) ? 'Barcode già usato' : 'Errore' })
    }
    finally { setSaving(false) }
  }

  // ─── Scanner: callback quando il codice viene letto ───────────
  // Flow:
  //   1. Codice scansionato → lookup backend GET /ingredients/barcode/:code
  //   2a. Trovato → mostra dialog rapido "carica N unità" (default +1)
  //   2b. Non trovato → apre form "Nuovo ingrediente" con barcode pre-popolato
  const handleScanned = async (code) => {
    setScannerOpen(false)
    try {
      const r = await ingredientsAPI.byBarcode(code)
      setScanFlow({ mode: 'quick-receive', barcode: code, ingredient: r.data })
    } catch (err) {
      if (err?.response?.status === 404) {
        // Sconosciuto: pre-popola form new ingredient
        setNewBarcode(code)
        setAdding(true)
        setScanFlow(null)
        toast({
          type: 'info',
          title: 'Barcode nuovo',
          message: `${code} non in archivio. Compila i dati per crearlo.`,
        })
      } else {
        toast({ type: 'error', title: 'Errore lookup barcode' })
      }
    }
  }

  // Quick-receive: +N stock all'ingrediente trovato via scan
  const handleQuickReceive = async (delta) => {
    if (!scanFlow?.ingredient) return
    setSaving(true)
    try {
      await ingredientsAPI.adjust(scanFlow.ingredient.id, {
        type: 'in',
        quantity: Math.abs(delta),
        notes: `Scan ${scanFlow.barcode}`,
      })
      toast({
        type: 'success',
        title: `+${delta} ${scanFlow.ingredient.unit}`,
        message: `${scanFlow.ingredient.name} caricato`,
      })
      setScanFlow(null)
      load()
    } catch { toast({ type: 'error', title: 'Errore carico stock' }) }
    finally { setSaving(false) }
  }

  const visible = filter === 'low'
    ? ingredients.filter(i => i.low_stock)
    : ingredients

  const lowCount = ingredients.filter(i => i.low_stock).length

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-20">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <Package size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">Ingredienti</h1>
        {lowCount > 0 && (
          <Badge tone="warn" size="sm" leftIcon={<AlertTriangle size={11} />}>
            {lowCount} sotto scorta
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setFilter(f => f === 'low' ? 'all' : 'low')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'low'
                ? 'bg-[var(--color-warn-soft)] text-[var(--color-warn)] border border-[var(--color-warn)]/30'
                : 'border border-[var(--color-border-strong)] text-[var(--color-text-2)] hover:text-[var(--color-text)]'
            }`}
          >
            <TrendingDown size={12} /> Sotto scorta
          </button>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<ScanLine size={13} />}
            onClick={() => setScannerOpen(true)}
            title="Scansiona codice a barre per carico veloce"
          >
            Scansiona
          </Button>
          <Button
            size="sm"
            leftIcon={adding ? <X size={13} /> : <Plus size={13} />}
            onClick={() => setAdding(p => !p)}
          >
            {adding ? 'Chiudi' : 'Nuovo'}
          </Button>
        </div>
      </header>

      {/* Scanner camera modal */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanned}
        title="Scansiona prodotto"
      />

      {/* Quick-receive modal: barcode esistente → +N stock con un tap */}
      <Modal
        open={!!scanFlow && scanFlow.mode === 'quick-receive'}
        onClose={() => setScanFlow(null)}
        title="Carico veloce"
        size="sm"
      >
        {scanFlow?.ingredient && (
          <div className="flex flex-col gap-3">
            <div className="text-center">
              <p className="text-[var(--color-text)] serif text-lg font-bold">
                {scanFlow.ingredient.name}
              </p>
              <p className="text-[var(--color-text-3)] text-xs tnum mt-1">
                Stock attuale: <b className="text-[var(--color-text)]">
                  {scanFlow.ingredient.current_stock} {scanFlow.ingredient.unit}
                </b>
              </p>
              <p className="text-[var(--color-text-3)] text-[10px] mt-1">
                Barcode: <code className="text-[var(--color-gold)]">{scanFlow.barcode}</code>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[1, 2, 5, 10, 12, 24].map((n) => (
                <Button
                  key={n}
                  size="lg"
                  loading={saving}
                  onClick={() => handleQuickReceive(n)}
                  className="text-lg"
                >
                  +{n}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setScanFlow(null)}
              className="mt-2"
            >
              Annulla
            </Button>
          </div>
        )}
      </Modal>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-3 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento ingredienti…</span>
          </div>
        ) : (
          <>
            <AnimatePresence>
              {adding && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <Card padding="md" className="border-[var(--color-gold-ring)] flex flex-col gap-2">
                    <p className="text-[var(--color-text-2)] text-xs font-semibold uppercase tracking-wider">Nuovo ingrediente</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Nome *"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                        className={inputCls}
                      />
                      <select value={newUnit} onChange={e => setNewUnit(e.target.value)} className={inputCls}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" step="0.001" value={newStock} onChange={e => setNewStock(e.target.value)} placeholder="Stock iniziale" className={`${inputCls} tnum`} />
                      <input type="number" step="0.001" value={newMin} onChange={e => setNewMin(e.target.value)} placeholder="Stock minimo" className={`${inputCls} tnum`} />
                      <input type="number" step="0.01" value={newCost} onChange={e => setNewCost(e.target.value)} placeholder="Costo €/unità" className={`${inputCls} tnum`} />
                    </div>
                    {/* Barcode + codice fornitore — pre-popolati se arrivi da scan */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newBarcode}
                          onChange={e => setNewBarcode(e.target.value)}
                          placeholder="Barcode (EAN/GS1)"
                          className={`${inputCls} flex-1 font-mono text-xs`}
                          autoCapitalize="off"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() => setScannerOpen(true)}
                          className="p-2 rounded-lg border border-[var(--color-border-strong)] text-[var(--color-gold)] hover:bg-[var(--color-gold-soft)]"
                          title="Scansiona barcode"
                          aria-label="Scansiona barcode"
                        >
                          <ScanLine size={14} />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={newSupplierCode}
                        onChange={e => setNewSupplierCode(e.target.value)}
                        placeholder="Cod. fornitore (es. MARR 047314)"
                        className={`${inputCls} font-mono text-xs`}
                        autoCapitalize="off"
                        autoComplete="off"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" fullWidth onClick={() => { setAdding(false); setNewBarcode(''); setNewSupplierCode('') }}>Annulla</Button>
                      <Button fullWidth loading={saving} disabled={!newName.trim()} leftIcon={<Check size={13} />} onClick={handleCreate}>
                        Crea
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {visible.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-20 text-[var(--color-text-3)]">
                <Package size={48} className="text-[var(--color-text-3)]/40" />
                <p className="serif text-[var(--color-text-2)] text-base font-bold">
                  {filter === 'low' ? 'Nessun ingrediente sotto scorta' : 'Nessun ingrediente ancora'}
                </p>
                {filter === 'all' && (
                  <button onClick={() => setAdding(true)} className="text-[var(--color-gold)] text-sm hover:underline font-semibold">
                    Aggiungi il primo
                  </button>
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
