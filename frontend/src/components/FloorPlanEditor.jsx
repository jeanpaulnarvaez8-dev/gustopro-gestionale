import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Minus, Move, RotateCw, Circle, Square, RectangleHorizontal, Trash2, Save, Pencil } from 'lucide-react'
import { tablesAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

const GRID = 10
const snap = v => Math.round(v / GRID) * GRID

// Colori stato tavolo
const STATUS = {
  free:     { fill: '#1a3a2a', stroke: '#22C55E', label: 'Libero' },
  occupied: { fill: '#3a1a1a', stroke: '#EF4444', label: 'Occupato' },
  reserved: { fill: '#1a2a3a', stroke: '#3B82F6', label: 'Riservato' },
  dirty:    { fill: '#3a3a1a', stroke: '#EAB308', label: 'Pulizia' },
  parked:   { fill: '#2a1a3a', stroke: '#A855F7', label: 'Parcheggiato' },
}

// Disegna un tavolo con sedie attorno
function TableSVG({ table, zone, selected, onSelect, onDrag, editing }) {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef(null)
  const w = table.width || 60, h = table.height || 60
  const shape = table.shape || 'circle'
  const st = STATUS[table.status] || STATUS.free
  const zColor = zone?.color || '#555'
  const strokeColor = selected ? '#D4AF37' : st.stroke
  const strokeW = selected ? 3 : 1.5

  // Calcola posizioni sedie
  const chairs = []
  const seats = table.seats || 4
  if (shape === 'circle') {
    for (let i = 0; i < seats; i++) {
      const angle = (i / seats) * Math.PI * 2 - Math.PI / 2
      chairs.push({ cx: w/2 + Math.cos(angle) * (w/2 + 10), cy: h/2 + Math.sin(angle) * (h/2 + 10) })
    }
  } else {
    const perSide = Math.ceil(seats / 4)
    for (let i = 0; i < Math.min(perSide, seats); i++)
      chairs.push({ cx: 10 + (i + 0.5) * ((w - 20) / perSide), cy: -10 })
    for (let i = 0; i < Math.min(perSide, seats - perSide); i++)
      chairs.push({ cx: 10 + (i + 0.5) * ((w - 20) / perSide), cy: h + 10 })
    for (let i = 0; i < Math.min(1, seats - perSide * 2); i++)
      chairs.push({ cx: -10, cy: h / 2 })
    for (let i = 0; i < Math.min(1, seats - perSide * 2 - 1); i++)
      chairs.push({ cx: w + 10, cy: h / 2 })
  }

  const onPointerDown = e => {
    if (!editing) { onSelect(table.id); return }
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    setDragging(true)
    startRef.current = { x: e.clientX - table.pos_x, y: e.clientY - table.pos_y }
    onSelect(table.id)
  }
  const onPointerMove = e => {
    if (!dragging || !startRef.current) return
    onDrag(table.id, snap(e.clientX - startRef.current.x), snap(e.clientY - startRef.current.y))
  }
  const onPointerUp = () => { setDragging(false); startRef.current = null }

  return (
    <g transform={`translate(${table.pos_x},${table.pos_y}) rotate(${table.rotation||0},${w/2},${h/2})`}
       onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
       style={{ cursor: editing ? 'grab' : 'pointer', touchAction: 'none' }}>
      {/* Sedie */}
      {chairs.map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={5} fill="#333" stroke="#555" strokeWidth="1" />
      ))}
      {/* Tavolo */}
      {shape === 'circle' ? (
        <ellipse cx={w/2} cy={h/2} rx={w/2} ry={h/2}
          fill={st.fill} stroke={strokeColor} strokeWidth={strokeW} />
      ) : (
        <rect x={0} y={0} width={w} height={h} rx={shape === 'rect' ? 4 : 6}
          fill={st.fill} stroke={strokeColor} strokeWidth={strokeW} />
      )}
      {/* Numero */}
      <text x={w/2} y={h/2 - 2} textAnchor="middle" dominantBaseline="middle"
        fill="#F5F5DC" fontSize={w > 50 ? 13 : 10} fontWeight="700" fontFamily="system-ui">
        {table.table_number}
      </text>
      <text x={w/2} y={h/2 + 11} textAnchor="middle" fill="#888" fontSize="8" fontFamily="system-ui">
        {table.seats}p
      </text>
    </g>
  )
}

// Planimetria architettonica del Riva Beach Salento.
// Scala approssimata 1m ≈ 60px.
// Aree fisiche: SALA DA PRANZO, CHIOSCO BAR, NETTUNO, BAR (passaggio aperto),
// VIP grande (terrazza ottagonale), VIP piccola (zona bassa-sx).
// Le zone del DB (BAR, Botti in Legno, Terrazza Panoramica, Sala Nettuno)
// rimangono come overlay semi-trasparenti per assegnazione tavoli/team.
function RestaurantStructure({ zones }) {
  const WALL = '#0a0a0a'
  const WALL_LIGHT = '#1a1a1a'
  const ROOM_FILL = '#101010'

  return (
    <g>
      {/* ─── Mare a destra (sfondo azzurro) ─────────────── */}
      <rect x={1180} y={0} width={220} height={950} fill="#0c2d48" />
      <text x={1290} y={480} textAnchor="middle" fill="#1a5a8a" fontSize="22" fontWeight="700"
        fontFamily="system-ui" transform="rotate(90,1290,480)">MARE</text>
      {[100,250,400,550,700,850].map(y => (
        <path key={y} d={`M 1180 ${y} Q 1210 ${y-15} 1240 ${y} Q 1270 ${y+15} 1290 ${y}`}
          stroke="#1a5a8a" strokeWidth="2" fill="none" opacity="0.5" />
      ))}

      {/* ─── SALA DA PRANZO (top-left, 7.94m × 3.40m) ────── */}
      <rect x={60} y={50} width={476} height={204} fill={ROOM_FILL} stroke={WALL} strokeWidth="6" />
      <text x={298} y={150} textAnchor="middle" fill="#888" fontSize="16" fontWeight="700"
        fontFamily="system-ui">SALA DA PRANZO</text>
      <text x={298} y={170} textAnchor="middle" fill="#555" fontSize="9"
        fontFamily="system-ui">7.94 × 3.40</text>

      {/* ─── CHIOSCO BAR (top-right of sala, 5.60m × 3.61m) ─ */}
      <rect x={560} y={50} width={336} height={217} fill={ROOM_FILL} stroke={WALL} strokeWidth="6" />
      <text x={728} y={150} textAnchor="middle" fill="#888" fontSize="16" fontWeight="700"
        fontFamily="system-ui">CHIOSCO BAR</text>
      <text x={728} y={170} textAnchor="middle" fill="#555" fontSize="9"
        fontFamily="system-ui">5.60 × 3.61</text>

      {/* Apertura (3.76m) in basso a SALA DA PRANZO che dà su NETTUNO */}
      <rect x={108} y={250} width={226} height={8} fill="#0a0a0a" />

      {/* ─── BAR (passaggio centrale aperto fra Chiosco e Nettuno) ─ */}
      <text x={620} y={420} fill="#666" fontSize="20" fontWeight="600"
        fontFamily="system-ui">BAR</text>
      {/* Bancone bar con sgabelli */}
      <rect x={500} y={290} width={250} height={60} fill="#3a2010" stroke="#8B4513" strokeWidth="2" rx="4" />
      {[0,1,2,3,4,5].map(i => (
        <circle key={`bs${i}`} cx={530 + i*38} cy={370} r={7} fill="#2a2a2a" stroke="#555" strokeWidth="1" />
      ))}

      {/* ─── NETTUNO (sala interna principale, sotto SALA+CHIOSCO) ─ */}
      <path d={`
        M 60 254
        L 60 700
        L 250 700
        L 250 880
        L 540 880
        L 540 700
        L 800 700
        L 800 480
        L 540 480
        L 540 254
        L 60 254
        Z
      `} fill={ROOM_FILL} stroke={WALL} strokeWidth="5" />
      <text x={350} y={520} textAnchor="middle" fill="#888" fontSize="34" fontWeight="700"
        fontFamily="system-ui" letterSpacing="6">NETTUNO</text>

      {/* ─── VIP grande (terrazza ottagonale inclinata, lato mare) ─ */}
      <g transform="translate(880, 350) rotate(-20, 150, 200)">
        <path d={`
          M 0 60
          L 80 0
          L 240 0
          L 300 60
          L 300 340
          L 240 400
          L 80 400
          L 0 340
          Z
        `} fill={ROOM_FILL} stroke={WALL} strokeWidth="5" />
        <text x={150} y={210} textAnchor="middle" fill="#888" fontSize="32" fontWeight="700"
          fontFamily="system-ui" letterSpacing="4">VIP</text>
      </g>

      {/* ─── VIP piccola (in basso a sinistra) ───────────── */}
      <g transform="translate(60, 760)">
        <path d={`
          M 0 30
          L 30 0
          L 180 0
          L 200 25
          L 200 130
          L 180 160
          L 30 160
          L 0 130
          Z
        `} fill={ROOM_FILL} stroke={WALL} strokeWidth="4" />
        <text x={100} y={88} textAnchor="middle" fill="#888" fontSize="20" fontWeight="700"
          fontFamily="system-ui" letterSpacing="3">VIP</text>
      </g>

      {/* ─── Cassa (top-left corner, accanto a Sala da pranzo) ─ */}
      <rect x={15} y={50} width={40} height={30} fill="#2a2a2a" stroke="#555" strokeWidth="1" rx="3" />
      <text x={35} y={68} textAnchor="middle" fill="#888" fontSize="8" fontFamily="system-ui">CASSA</text>

      {/* ─── WC (zona accessibile) ──────────────────────── */}
      <rect x={15} y={290} width={40} height={28} fill="#1a1a1a" stroke="#444" strokeWidth="1" rx="3" />
      <text x={35} y={308} textAnchor="middle" fill="#666" fontSize="8" fontFamily="system-ui">WC</text>
      <rect x={15} y={325} width={40} height={28} fill="#1a1a1a" stroke="#444" strokeWidth="1" rx="3" />
      <text x={35} y={343} textAnchor="middle" fill="#666" fontSize="8" fontFamily="system-ui">WC</text>

      {/* ─── Cucina (dietro al chiosco bar) ──────────────── */}
      <rect x={900} y={50} width={120} height={217} fill={WALL_LIGHT} stroke={WALL} strokeWidth="3" rx="2" />
      <text x={960} y={150} textAnchor="middle" fill="#666" fontSize="13" fontWeight="600"
        fontFamily="system-ui">CUCINA</text>

      {/* ─── Veranda (corridoio fronte mare) ─────────────── */}
      <rect x={810} y={280} width={70} height={420} fill="#0c1010" stroke="#222" strokeWidth="1" rx="2" />
      <text x={845} y={490} textAnchor="middle" fill="#444" fontSize="11" fontWeight="600"
        fontFamily="system-ui" transform="rotate(-90,845,490)">VERANDA</text>

      {/* Zone DB tratteggiate rimosse: usavano i floor_x/y vecchi e
          confondevano l'occhio con la nuova struttura architettonica.
          Il legame tavolo→zona resta solo via dato (zone_id), l'utente
          la conosce dal contesto operativo. */}
    </g>
  )
}

export default function FloorPlanEditor({ tables, zones, onTableUpdate, onTableDelete, assignments = [] }) {
  const { toast } = useToast()
  const containerRef = useRef(null)
  const [zoom, setZoom] = useState(0.7)
  const [pan, setPan] = useState({ x: 10, y: 10 })
  const [panning, setPanning] = useState(false)
  const panStart = useRef(null)
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(tables)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setLocal(tables) }, [tables])

  const sel = local.find(t => t.id === selected)

  const handleDrag = useCallback((id, x, y) => {
    setLocal(prev => prev.map(t => t.id === id ? { ...t, pos_x: Math.max(0, x), pos_y: Math.max(0, y) } : t))
  }, [])

  const updateSel = (k, v) => setLocal(prev => prev.map(t => t.id === selected ? { ...t, [k]: v } : t))

  const handleSave = async () => {
    setSaving(true)
    try {
      let changed = 0
      for (const t of local) {
        const o = tables.find(x => x.id === t.id)
        if (o && (o.pos_x !== t.pos_x || o.pos_y !== t.pos_y || o.shape !== t.shape ||
            o.width !== t.width || o.height !== t.height || o.rotation !== t.rotation)) {
          await tablesAPI.update(t.id, {
            pos_x: t.pos_x, pos_y: t.pos_y, shape: t.shape,
            width: t.width, height: t.height, rotation: t.rotation
          })
          changed++
        }
      }
      onTableUpdate?.()
      toast({ type: 'success', title: `Pianta salvata (${changed} tavoli)` })
    } catch { toast({ type: 'error', title: 'Errore salvataggio' }) }
    finally { setSaving(false) }
  }

  // Pan & zoom
  const onBgDown = e => {
    if (e.target.tagName === 'svg' || e.target.classList.contains('bg-layer')) {
      setPanning(true)
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    }
  }
  const onBgMove = e => { if (panning && panStart.current) setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y }) }
  const onBgUp = () => { setPanning(false); panStart.current = null }
  const onWheel = e => { e.preventDefault(); setZoom(z => Math.min(2, Math.max(0.2, z - e.deltaY * 0.001))) }

  // Assegnazioni per zona
  const aByZone = {}
  assignments.forEach(a => { if (!aByZone[a.zone_id]) aByZone[a.zone_id] = []; aByZone[a.zone_id].push(a) })

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border-b border-[#333] flex-wrap">
        <button onClick={() => setEditing(!editing)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
            editing ? 'bg-[#D4AF37] text-[#1A1A1A]' : 'bg-[#2A2A2A] text-[#888] border border-[#333]'
          }`}>
          {editing ? <><Move size={12}/> Modifica ON</> : <><Pencil size={12}/> Modifica</>}
        </button>

        <div className="flex items-center gap-1 bg-[#2A2A2A] rounded-lg border border-[#333]">
          <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="px-2 py-1.5 text-[#888] hover:text-[#F5F5DC]"><Minus size={11}/></button>
          <span className="text-[#888] text-[10px] w-8 text-center">{Math.round(zoom*100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="px-2 py-1.5 text-[#888] hover:text-[#F5F5DC]"><Plus size={11}/></button>
        </div>

        {/* Legenda stati */}
        <div className="flex items-center gap-3 ml-2">
          {Object.entries(STATUS).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: v.stroke }} />
              <span className="text-[10px] text-[#555]">{v.label}</span>
            </div>
          ))}
        </div>

        {editing && sel && (
          <>
            <div className="h-4 w-px bg-[#333] ml-2" />
            <span className="text-[#D4AF37] text-xs font-bold">{sel.table_number}</span>
            <div className="flex gap-1">
              {[{id:'circle',I:Circle},{id:'square',I:Square},{id:'rect',I:RectangleHorizontal}].map(s => (
                <button key={s.id} onClick={() => updateSel('shape', s.id)}
                  className={`p-1 rounded ${sel.shape===s.id ? 'bg-[#D4AF37] text-[#1A1A1A]' : 'text-[#555]'}`}>
                  <s.I size={13}/>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[#888]">
              W<input type="number" value={sel.width} onChange={e => updateSel('width', +e.target.value||60)}
                className="w-9 bg-[#2A2A2A] border border-[#333] rounded px-1 py-0.5 text-[#F5F5DC] text-[10px] text-center"/>
              H<input type="number" value={sel.height} onChange={e => updateSel('height', +e.target.value||60)}
                className="w-9 bg-[#2A2A2A] border border-[#333] rounded px-1 py-0.5 text-[#F5F5DC] text-[10px] text-center"/>
              <button onClick={() => updateSel('rotation', ((sel.rotation||0)+45)%360)}
                className="p-1 text-[#555] hover:text-[#D4AF37]"><RotateCw size={12}/></button>
              Posti<input type="number" value={sel.seats} onChange={e => updateSel('seats', Math.max(1, +e.target.value||1))}
                className="w-8 bg-[#2A2A2A] border border-[#333] rounded px-1 py-0.5 text-[#F5F5DC] text-[10px] text-center"/>
            </div>
            <button onClick={() => { onTableDelete?.(sel.id); setSelected(null) }}
              className="p-1.5 text-[#555] hover:text-red-400"><Trash2 size={13}/></button>
          </>
        )}

        {editing && (
          <button onClick={handleSave} disabled={saving}
            className="ml-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
            <Save size={12}/> {saving ? 'Salvando...' : 'Salva'}
          </button>
        )}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-hidden bg-[#0a0a0a] relative"
        onWheel={onWheel} onPointerDown={onBgDown} onPointerMove={onBgMove} onPointerUp={onBgUp}
        style={{ touchAction: 'none' }}>
        <svg width="100%" height="100%" style={{ cursor: panning ? 'grabbing' : 'default' }}>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Griglia sottile */}
            <defs>
              <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#181818" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect className="bg-layer" width="1400" height="950" fill="url(#grid)"/>

            {/* Struttura ristorante */}
            <RestaurantStructure zones={zones} />

            {/* Tavoli */}
            {local.map(t => (
              <TableSVG key={t.id} table={t} zone={zones.find(z => z.id === t.zone_id)}
                selected={selected === t.id} onSelect={setSelected}
                onDrag={handleDrag} editing={editing} />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
