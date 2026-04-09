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

// Disegna la struttura del ristorante (muri, bar, mare, pergola botti)
function RestaurantStructure({ zones }) {
  const bar = zones.find(z => z.name === 'BAR')
  const botti = zones.find(z => z.name === 'Botti in Legno')

  return (
    <g>
      {/* Mare (sfondo azzurro a destra) */}
      <rect x={1140} y={0} width={260} height={950} fill="#0c2d48" />
      <text x={1260} y={480} textAnchor="middle" fill="#1a5a8a" fontSize="24" fontWeight="700"
        fontFamily="system-ui" transform="rotate(90,1260,480)">MARE</text>
      {[100,250,400,550,700,850].map(y => (
        <path key={y} d={`M 1140 ${y} Q 1170 ${y-15} 1200 ${y} Q 1230 ${y+15} 1260 ${y}`}
          stroke="#1a5a8a" strokeWidth="2" fill="none" opacity="0.5" />
      ))}

      {/* Zone come aree con bordi */}
      {zones.map(z => {
        const x = z.floor_x || 0, y = z.floor_y || 0
        const w = z.floor_w || 400, h = z.floor_h || 300
        return (
          <g key={z.id}>
            <rect x={x} y={y} width={w} height={h}
              fill={`${z.color}08`} stroke={z.color} strokeWidth="3" rx="4" />
            <rect x={x + 8} y={y + 6} width={z.name.length * 8 + 16} height={20} rx="4"
              fill={z.color} opacity="0.2" />
            <text x={x + 16} y={y + 19} fill={z.color} fontSize="11" fontWeight="700"
              fontFamily="system-ui" opacity="0.8">
              {z.name.toUpperCase()}
            </text>
          </g>
        )
      })}

      {/* Bancone BAR con sgabelli */}
      {bar && (
        <g>
          <rect x={bar.floor_x + 50} y={bar.floor_y + 30} width={180} height={80}
            fill="#4a2020" stroke="#8B4513" strokeWidth="2" rx="6" />
          <text x={bar.floor_x + 140} y={bar.floor_y + 75} textAnchor="middle"
            fill="#D4AF37" fontSize="12" fontWeight="600" fontFamily="system-ui">BAR</text>
          {[0,1,2,3,4].map(i => (
            <circle key={`bs${i}`} cx={bar.floor_x + 75 + i * 40} cy={bar.floor_y + 130}
              r={8} fill="#333" stroke="#555" strokeWidth="1" />
          ))}
          {[0,1].map(i => (
            <circle key={`bl${i}`} cx={bar.floor_x + 35} cy={bar.floor_y + 55 + i * 35}
              r={8} fill="#333" stroke="#555" strokeWidth="1" />
          ))}
          {[0,1].map(i => (
            <circle key={`br${i}`} cx={bar.floor_x + 245} cy={bar.floor_y + 55 + i * 35}
              r={8} fill="#333" stroke="#555" strokeWidth="1" />
          ))}
        </g>
      )}

      {/* Pergola Botti (linee dal centro) */}
      {botti && (() => {
        const cx = botti.floor_x + botti.floor_w / 2
        const cy = botti.floor_y + 20
        const pts = [[450,130],[490,185],[545,220],[610,235],[675,220],[730,185],[770,130]]
        return (
          <g>
            {pts.map(([tx,ty], i) => (
              <line key={i} x1={cx} y1={cy} x2={tx+32} y2={ty+32}
                stroke="#5a3a20" strokeWidth="2" opacity="0.3" />
            ))}
            <circle cx={cx} cy={cy} r={6} fill="#3a2510" stroke="#6b3a20" strokeWidth="1.5" />
          </g>
        )
      })()}

      {/* Cassa */}
      <rect x={15} y={15} width={55} height={28} fill="#2a2a2a" stroke="#555" strokeWidth="1" rx="3" />
      <text x={42} y={32} textAnchor="middle" fill="#888" fontSize="8" fontFamily="system-ui">CASSA</text>

      {/* Frigo Pesce */}
      <rect x={15} y={50} width={55} height={25} fill="#1a2a3a" stroke="#3B82F6" strokeWidth="1" rx="3" />
      <text x={42} y={66} textAnchor="middle" fill="#5588bb" fontSize="7" fontFamily="system-ui">FRIGO</text>

      {/* Muro divisorio rosso (tra Sala Nettuno e Terrazza VIP) */}
      <line x1={680} y1={310} x2={680} y2={930} stroke="#8B0000" strokeWidth="4" />

      {/* WC in basso a sinistra */}
      <rect x={50} y={870} width={40} height={28} fill="#1a1a1a" stroke="#444" strokeWidth="1" rx="3" />
      <text x={70} y={888} textAnchor="middle" fill="#666" fontSize="7" fontFamily="system-ui">WC</text>
      <rect x={100} y={870} width={40} height={28} fill="#1a1a1a" stroke="#444" strokeWidth="1" rx="3" />
      <text x={120} y={888} textAnchor="middle" fill="#666" fontSize="7" fontFamily="system-ui">WC</text>
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
