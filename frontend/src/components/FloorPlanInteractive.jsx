import { useState, useRef, useEffect, useCallback } from 'react'
import { Move, Pencil, Save, Plus, Minus } from 'lucide-react'
import { tablesAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

const GRID = 10
const snap = v => Math.round(v / GRID) * GRID

const STATUS_COLORS = {
  free:     { fill: '#0f2a1a', stroke: '#22C55E', glow: '#22C55E30' },
  occupied: { fill: '#2a0f0f', stroke: '#EF4444', glow: '#EF444430' },
  reserved: { fill: '#0f1a2a', stroke: '#3B82F6', glow: '#3B82F630' },
  dirty:    { fill: '#2a2a0f', stroke: '#EAB308', glow: '#EAB30830' },
  parked:   { fill: '#1a0f2a', stroke: '#A855F7', glow: '#A855F730' },
}

function TableShape({ table, zone, selected, onSelect, onDrag, editing }) {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef(null)
  const w = table.width || 60, h = table.height || 60
  const shape = table.shape || 'circle'
  const st = STATUS_COLORS[table.status] || STATUS_COLORS.free
  const isOccupied = table.status === 'occupied'

  // Sedie attorno al tavolo
  const chairs = []
  const seats = table.seats || 4
  if (shape === 'circle') {
    for (let i = 0; i < seats; i++) {
      const a = (i / seats) * Math.PI * 2 - Math.PI / 2
      chairs.push({ cx: w/2 + Math.cos(a) * (w/2 + 12), cy: h/2 + Math.sin(a) * (h/2 + 12) })
    }
  } else {
    const top = Math.min(Math.ceil(seats / 2), 4)
    const bot = Math.min(seats - top, 4)
    for (let i = 0; i < top; i++) chairs.push({ cx: (i + 1) * w / (top + 1), cy: -12 })
    for (let i = 0; i < bot; i++) chairs.push({ cx: (i + 1) * w / (bot + 1), cy: h + 12 })
    if (seats > top + bot) { chairs.push({ cx: -12, cy: h/2 }); if (seats > top+bot+1) chairs.push({ cx: w+12, cy: h/2 }) }
  }

  const down = e => {
    if (!editing) { onSelect(table); return }
    e.stopPropagation(); e.target.setPointerCapture(e.pointerId)
    setDragging(true); startRef.current = { x: e.clientX - table.pos_x, y: e.clientY - table.pos_y }
    onSelect(table)
  }
  const move = e => { if (dragging && startRef.current) onDrag(table.id, snap(e.clientX - startRef.current.x), snap(e.clientY - startRef.current.y)) }
  const up = () => { setDragging(false); startRef.current = null }

  return (
    <g transform={`translate(${table.pos_x},${table.pos_y}) rotate(${table.rotation||0},${w/2},${h/2})`}
       onPointerDown={down} onPointerMove={move} onPointerUp={up}
       style={{ cursor: editing ? 'grab' : 'pointer', touchAction: 'none' }}>
      {/* Glow per occupato */}
      {isOccupied && shape === 'circle' && (
        <ellipse cx={w/2} cy={h/2} rx={w/2+6} ry={h/2+6} fill={st.glow} />
      )}
      {isOccupied && shape !== 'circle' && (
        <rect x={-6} y={-6} width={w+12} height={h+12} rx={10} fill={st.glow} />
      )}
      {/* Sedie */}
      {chairs.map((c, i) => (
        <rect key={i} x={c.cx-5} y={c.cy-5} width={10} height={10} rx={3}
          fill={isOccupied ? '#2a1515' : '#1a1a1a'} stroke={isOccupied ? '#553333' : '#333'} strokeWidth="0.8" />
      ))}
      {/* Tavolo */}
      {shape === 'circle' ? (
        <ellipse cx={w/2} cy={h/2} rx={w/2} ry={h/2}
          fill={st.fill} stroke={selected ? '#D4AF37' : st.stroke}
          strokeWidth={selected ? 2.5 : 1.5} />
      ) : (
        <rect x={0} y={0} width={w} height={h} rx={shape==='rect' ? 4 : 6}
          fill={st.fill} stroke={selected ? '#D4AF37' : st.stroke}
          strokeWidth={selected ? 2.5 : 1.5} />
      )}
      {/* Numero tavolo */}
      <text x={w/2} y={h/2 + (seats > 0 ? -2 : 0)} textAnchor="middle" dominantBaseline="middle"
        fill="#F5F5DC" fontSize={w > 55 ? 14 : 11} fontWeight="800" fontFamily="system-ui">
        {table.table_number}
      </text>
      {/* Posti */}
      <text x={w/2} y={h/2 + 12} textAnchor="middle" fill="#666" fontSize="8" fontFamily="system-ui">
        {table.seats}p
      </text>
      {/* Indicatore stato (pallino) */}
      <circle cx={w - 2} cy={4} r={4} fill={st.stroke} />
    </g>
  )
}

function Restaurant({ zones }) {
  return (
    <g>
      {/* Mare */}
      <rect x={1140} y={0} width={300} height={950} fill="#071a2c" />
      <text x={1230} y={480} textAnchor="middle" fill="#0d3a5c" fontSize="28" fontWeight="800"
        fontFamily="system-ui" transform="rotate(90,1230,480)" letterSpacing="8">MARE</text>
      {[100,220,340,460,580,700,820].map(y => (
        <path key={y} d={`M 1140 ${y} Q 1175 ${y-12} 1210 ${y} Q 1245 ${y+12} 1280 ${y}`}
          stroke="#0d3a5c" strokeWidth="1.5" fill="none" />
      ))}

      {/* Zone */}
      {zones.map(z => (
        <g key={z.id}>
          <rect x={z.floor_x||0} y={z.floor_y||0} width={z.floor_w||400} height={z.floor_h||300}
            fill={`${z.color||'#555'}06`} stroke={z.color||'#555'} strokeWidth="2" strokeDasharray="6,3" rx="6" />
          <text x={(z.floor_x||0)+12} y={(z.floor_y||0)+16} fill={z.color||'#555'}
            fontSize="10" fontWeight="700" fontFamily="system-ui" opacity="0.5">
            {z.name.toUpperCase()}
          </text>
        </g>
      ))}

      {/* Bancone BAR */}
      {zones.some(z => z.name === 'BAR') && (() => {
        const bar = zones.find(z => z.name === 'BAR')
        return (
          <g>
            <rect x={(bar.floor_x||70)+40} y={(bar.floor_y||20)+20} width={170} height={65}
              fill="#2a1810" stroke="#6b3a20" strokeWidth="2" rx="8" />
            <text x={(bar.floor_x||70)+125} y={(bar.floor_y||20)+58} textAnchor="middle"
              fill="#D4AF37" fontSize="13" fontWeight="700" fontFamily="system-ui">BAR</text>
          </g>
        )
      })()}

      {/* Cassa & Frigo */}
      <rect x={8} y={8} width={55} height={28} fill="#1a1a1a" stroke="#444" strokeWidth="1" rx="4" />
      <text x={35} y={26} textAnchor="middle" fill="#888" fontSize="8" fontWeight="600" fontFamily="system-ui">CASSA</text>
      <rect x={8} y={42} width={55} height={22} fill="#0a1520" stroke="#2563EB" strokeWidth="1" rx="4" />
      <text x={35} y={56} textAnchor="middle" fill="#4488bb" fontSize="7" fontWeight="600" fontFamily="system-ui">FRIGO PESCE</text>

      {/* Muro divisorio */}
      <line x1={640} y1={340} x2={640} y2={910} stroke="#5a1515" strokeWidth="4" />
    </g>
  )
}

const PLAN_W = 1450
const PLAN_H = 950

export default function FloorPlanInteractive({ tables, zones, onTableClick, canEdit, onRefresh }) {
  const { toast } = useToast()
  const containerRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const panStart = useRef(null)
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(tables)
  const [saving, setSaving] = useState(false)

  // Auto-fit: scala in base ai tavoli reali, non alla canvas fissa
  useEffect(() => {
    const el = containerRef.current
    if (!el || tables.length === 0) return
    const fit = () => {
      const rect = el.getBoundingClientRect()
      // Calcola bounding box di tutti i tavoli + zone
      let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0
      for (const t of tables) {
        const x2 = t.pos_x + (t.width || 60) + 30
        const y2 = t.pos_y + (t.height || 60) + 30
        if (t.pos_x < minX) minX = t.pos_x
        if (t.pos_y < minY) minY = t.pos_y
        if (x2 > maxX) maxX = x2
        if (y2 > maxY) maxY = y2
      }
      for (const z of zones) {
        const zx2 = (z.floor_x || 0) + (z.floor_w || 400)
        const zy2 = (z.floor_y || 0) + (z.floor_h || 300)
        if (zx2 > maxX) maxX = zx2
        if (zy2 > maxY) maxY = zy2
      }
      const contentW = maxX + 40
      const contentH = maxY + 40
      const scaleX = rect.width / contentW
      const scaleY = rect.height / contentH
      const s = Math.min(scaleX, scaleY) * 0.92
      setZoom(s)
      setPan({
        x: (rect.width - contentW * s) / 2,
        y: Math.max(5, (rect.height - contentH * s) / 2),
      })
    }
    fit()
    const obs = new ResizeObserver(fit)
    obs.observe(el)
    return () => obs.disconnect()
  }, [tables, zones])

  useEffect(() => { setLocal(tables) }, [tables])

  const handleDrag = useCallback((id, x, y) => {
    setLocal(prev => prev.map(t => t.id === id ? { ...t, pos_x: Math.max(0, x), pos_y: Math.max(0, y) } : t))
  }, [])

  const handleTableSelect = (table) => {
    setSelected(table.id)
    if (!editing) onTableClick?.(table)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let n = 0
      for (const t of local) {
        const o = tables.find(x => x.id === t.id)
        if (o && (o.pos_x !== t.pos_x || o.pos_y !== t.pos_y))
          { await tablesAPI.update(t.id, { pos_x: t.pos_x, pos_y: t.pos_y }); n++ }
      }
      onRefresh?.()
      toast({ type: 'success', title: `Salvato (${n} spostati)` })
      setEditing(false)
    } catch { toast({ type: 'error', title: 'Errore' }) }
    finally { setSaving(false) }
  }

  // Touch: pinch-to-zoom + pan
  const touchRef = useRef({ dist: 0, zoom: 1, pan: { x: 0, y: 0 }, mid: { x: 0, y: 0 } })

  const getTouchDist = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      touchRef.current = {
        dist: getTouchDist(e.touches),
        zoom,
        pan: { ...pan },
        mid: {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        },
      }
    } else if (e.touches.length === 1) {
      panStart.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y }
    }
  }

  const onTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const newDist = getTouchDist(e.touches)
      const scale = newDist / touchRef.current.dist
      const newZoom = Math.min(3, Math.max(0.2, touchRef.current.zoom * scale))
      setZoom(newZoom)
      // Pan segue il midpoint
      const newMid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      }
      setPan({
        x: touchRef.current.pan.x + (newMid.x - touchRef.current.mid.x),
        y: touchRef.current.pan.y + (newMid.y - touchRef.current.mid.y),
      })
    } else if (e.touches.length === 1 && panStart.current) {
      setPan({
        x: e.touches[0].clientX - panStart.current.x,
        y: e.touches[0].clientY - panStart.current.y,
      })
    }
  }

  const onTouchEnd = () => { panStart.current = null }

  const onBgDown = e => {
    if (e.target.tagName === 'svg' || e.target.classList?.contains('bg-layer'))
      { setPanning(true); panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y } }
  }
  const onBgMove = e => { if (panning && panStart.current) setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y }) }
  const onBgUp = () => { setPanning(false); panStart.current = null }
  const onWheel = e => { e.preventDefault(); setZoom(z => Math.min(2, Math.max(0.25, z - e.deltaY * 0.001))) }

  // Stats
  const free = tables.filter(t => t.status === 'free').length
  const occupied = tables.filter(t => t.status === 'occupied').length

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Mini toolbar — responsive */}
      <div className="flex items-center gap-2 px-2 sm:px-4 py-1.5 bg-[#1A1A1A] border-b border-[#2A2A2A] shrink-0">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-emerald-400">{free} <span className="hidden sm:inline">liberi</span></span>
          <span className="text-red-400">{occupied} <span className="hidden sm:inline">occupati</span></span>
        </div>
        <div className="hidden md:flex items-center gap-1 ml-1">
          {Object.entries(STATUS_COLORS).slice(0,3).map(([k,v]) => (
            <div key={k} className="flex items-center gap-0.5">
              <div className="w-2 h-2 rounded-full" style={{background:v.stroke}}/>
              <span className="text-[9px] text-[#444]">{k==='free'?'Libero':k==='occupied'?'Occ.':'Ris.'}</span>
            </div>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex items-center bg-[#222] rounded border border-[#333]">
            <button onClick={() => setZoom(z => Math.max(0.2, z-0.1))} className="px-1.5 py-1 text-[#888]"><Minus size={10}/></button>
            <span className="text-[9px] text-[#666] w-7 text-center">{Math.round(zoom*100)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z+0.1))} className="px-1.5 py-1 text-[#888]"><Plus size={10}/></button>
          </div>
          {canEdit && (
            editing ? (
              <button onClick={handleSave} disabled={saving}
                className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold flex items-center gap-1 disabled:opacity-50">
                <Save size={10}/> <span className="hidden sm:inline">Salva</span>
              </button>
            ) : (
              <button onClick={() => setEditing(true)}
                className="px-2 py-1 bg-[#222] text-[#888] border border-[#333] rounded text-[10px] flex items-center gap-1">
                <Move size={10}/> <span className="hidden sm:inline">Sposta</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-hidden bg-[#090909]"
        onWheel={onWheel}
        onPointerDown={onBgDown} onPointerMove={onBgMove} onPointerUp={onBgUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ touchAction: 'none' }}>
        <svg width="100%" height="100%" style={{ cursor: panning ? 'grabbing' : 'default' }}>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            <defs>
              <pattern id="grid2" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#141414" strokeWidth="0.3"/>
              </pattern>
            </defs>
            <rect className="bg-layer" width="1450" height="950" fill="url(#grid2)"/>
            <Restaurant zones={zones} />
            {local.map(t => (
              <TableShape key={t.id} table={t} zone={zones.find(z => z.id === t.zone_id)}
                selected={selected === t.id} onSelect={handleTableSelect}
                onDrag={handleDrag} editing={editing} />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
