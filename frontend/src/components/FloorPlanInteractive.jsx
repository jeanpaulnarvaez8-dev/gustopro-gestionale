import { useState, useRef, useEffect, useCallback } from 'react'
import { Move, Save, Plus, Minus } from 'lucide-react'
import { tablesAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

const GRID = 10
const snap = v => Math.round(v / GRID) * GRID

// Riva Beach palette — soft fill + bright stroke + glow per occupato.
// Tutti i valori sono espliciti perché finiscono dentro SVG (non Tailwind).
const STATUS_COLORS = {
  free:     { fill: 'rgba(34,197,94,0.18)',  stroke: '#22C55E', glow: 'rgba(34,197,94,0.22)',  text: '#86EFAC' },
  occupied: { fill: 'rgba(212,175,55,0.18)', stroke: '#D4AF37', glow: 'rgba(212,175,55,0.28)', text: '#F0E9D2' },
  reserved: { fill: 'rgba(62,122,147,0.20)', stroke: '#3E7A93', glow: 'rgba(62,122,147,0.25)', text: '#A5C8DA' },
  dirty:    { fill: 'rgba(234,179,8,0.18)',  stroke: '#EAB308', glow: 'rgba(234,179,8,0.22)',  text: '#FDE68A' },
  parked:   { fill: 'rgba(168,85,247,0.18)', stroke: '#A855F7', glow: 'rgba(168,85,247,0.22)', text: '#D8B4FE' },
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
    if (seats > top + bot) {
      chairs.push({ cx: -12, cy: h/2 })
      if (seats > top+bot+1) chairs.push({ cx: w+12, cy: h/2 })
    }
  }

  const down = e => {
    if (!editing) { onSelect(table); return }
    e.stopPropagation(); e.target.setPointerCapture(e.pointerId)
    setDragging(true); startRef.current = { x: e.clientX - table.pos_x, y: e.clientY - table.pos_y }
    onSelect(table)
  }
  const move = e => {
    if (dragging && startRef.current)
      onDrag(table.id, snap(e.clientX - startRef.current.x), snap(e.clientY - startRef.current.y))
  }
  const up = () => { setDragging(false); startRef.current = null }

  return (
    <g
      transform={`translate(${table.pos_x},${table.pos_y}) rotate(${table.rotation||0},${w/2},${h/2})`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up}
      style={{ cursor: editing ? 'grab' : 'pointer', touchAction: 'none' }}
      className={isOccupied ? 'animate-[pulse-gold_2.4s_ease-in-out_infinite]' : ''}
    >
      {/* Glow per occupato */}
      {isOccupied && shape === 'circle' && (
        <ellipse cx={w/2} cy={h/2} rx={w/2+6} ry={h/2+6} fill={st.glow} />
      )}
      {isOccupied && shape !== 'circle' && (
        <rect x={-6} y={-6} width={w+12} height={h+12} rx={10} fill={st.glow} />
      )}
      {/* Sedie — toni warm ivory soft */}
      {chairs.map((c, i) => (
        <rect
          key={i} x={c.cx-5} y={c.cy-5} width={10} height={10} rx={3}
          fill={isOccupied ? '#2a2418' : '#181D22'}
          stroke={isOccupied ? '#5c4d2a' : '#2c3137'}
          strokeWidth="0.8"
        />
      ))}
      {/* Tavolo */}
      {shape === 'circle' ? (
        <ellipse
          cx={w/2} cy={h/2} rx={w/2} ry={h/2}
          fill={st.fill}
          stroke={selected ? '#D4AF37' : st.stroke}
          strokeWidth={selected ? 2.5 : 1.5}
        />
      ) : (
        <rect
          x={0} y={0} width={w} height={h} rx={shape==='rect' ? 4 : 6}
          fill={st.fill}
          stroke={selected ? '#D4AF37' : st.stroke}
          strokeWidth={selected ? 2.5 : 1.5}
        />
      )}
      {/* Numero tavolo */}
      <text
        x={w/2} y={h/2 + (seats > 0 ? -2 : 0)}
        textAnchor="middle" dominantBaseline="middle"
        fill="#F0E9D2" fontSize={w > 55 ? 14 : 11} fontWeight="800"
        fontFamily="Inter, system-ui"
      >
        {table.table_number}
      </text>
      {/* Posti */}
      <text
        x={w/2} y={h/2 + 12}
        textAnchor="middle" fill="rgba(240,233,210,0.42)"
        fontSize="8" fontFamily="Inter, system-ui"
      >
        {table.seats}p
      </text>
      {/* Indicatore stato (pallino con halo) */}
      <circle cx={w - 2} cy={4} r={5} fill={st.glow} />
      <circle cx={w - 2} cy={4} r={3} fill={st.stroke} />
    </g>
  )
}

// ─── Planimetria architettonica reale Riva Beach Salento ─────────────────────
// Stessa struttura del FloorPlanEditor — tonalità Riva Beach (warm walls, sea blu)
function Restaurant({ zones }) {
  const WALL = '#0B0E11'           // canvas darker — pareti spesse
  const WALL_LIGHT = '#181D22'      // surface-2 — riempimenti
  const ROOM_FILL = '#13181C'       // bg — pavimento sale
  const LABEL = 'rgba(240,233,210,0.42)' // text-3
  const LABEL_DIM = 'rgba(240,233,210,0.28)'

  return (
    <g>
      {/* ─── Mare lato est (tonalità sea Riva) ──────────────────────── */}
      <rect x={1180} y={0} width={220} height={950} fill="rgba(62,122,147,0.18)" />
      <text
        x={1290} y={480} textAnchor="middle"
        fill="#3E7A93" fontSize="28" fontWeight="800" fontStyle="italic"
        fontFamily="Fraunces, Georgia, serif"
        transform="rotate(90,1290,480)"
        letterSpacing="8"
        opacity="0.6"
      >
        Mare
      </text>
      {/* Onde stilizzate */}
      {[100,220,340,460,580,700,820].map(y => (
        <path
          key={y}
          d={`M 1180 ${y} Q 1215 ${y-12} 1250 ${y} Q 1285 ${y+12} 1290 ${y}`}
          stroke="#3E7A93" strokeWidth="1.5" fill="none" opacity="0.55"
        />
      ))}

      {/* ─── SALA DA PRANZO (top-left, 7.94m × 3.40m) ────────────── */}
      <rect x={60} y={50} width={476} height={204} fill={ROOM_FILL} stroke={WALL} strokeWidth="6" />
      <text
        x={298} y={150} textAnchor="middle"
        fill={LABEL} fontSize="16" fontWeight="700"
        fontFamily="Fraunces, Georgia, serif"
      >
        SALA DA PRANZO
      </text>
      <text x={298} y={170} textAnchor="middle" fill={LABEL_DIM} fontSize="9" fontFamily="Inter, system-ui">
        7.94 × 3.40
      </text>

      {/* ─── CHIOSCO BAR (top-right, 5.60m × 3.61m) ──────────────── */}
      <rect x={560} y={50} width={336} height={217} fill={ROOM_FILL} stroke={WALL} strokeWidth="6" />
      <text
        x={728} y={150} textAnchor="middle"
        fill={LABEL} fontSize="16" fontWeight="700"
        fontFamily="Fraunces, Georgia, serif"
      >
        CHIOSCO BAR
      </text>
      <text x={728} y={170} textAnchor="middle" fill={LABEL_DIM} fontSize="9" fontFamily="Inter, system-ui">
        5.60 × 3.61
      </text>

      {/* Apertura 3.76m verso NETTUNO */}
      <rect x={108} y={250} width={226} height={8} fill={WALL} />

      {/* ─── BAR area centrale + bancone con sgabelli (sand tone) ── */}
      <text
        x={620} y={420} fill={LABEL} fontSize="20" fontWeight="600"
        fontFamily="Fraunces, Georgia, serif"
      >
        BAR
      </text>
      {/* Bancone bar — tonalità sand+terracotta */}
      <rect x={500} y={290} width={250} height={60} fill="rgba(184,92,60,0.32)" stroke="#B85C3C" strokeWidth="2" rx="4" />
      {[0,1,2,3,4,5].map(i => (
        <circle key={`bs${i}`} cx={530 + i*38} cy={370} r={7} fill="#181D22" stroke="#2c3137" strokeWidth="1" />
      ))}

      {/* ─── NETTUNO (sala interna principale) ────────────────────── */}
      <path
        d={`
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
        `}
        fill={ROOM_FILL} stroke={WALL} strokeWidth="5"
      />
      <text
        x={350} y={520} textAnchor="middle"
        fill={LABEL} fontSize="34" fontWeight="700"
        fontFamily="Fraunces, Georgia, serif"
        letterSpacing="6"
      >
        NETTUNO
      </text>

      {/* ─── VIP grande (terrazza ottagonale fronte mare) ─────────── */}
      <g transform="translate(880, 350) rotate(-20, 150, 200)">
        <path
          d={`
            M 0 60
            L 80 0
            L 240 0
            L 300 60
            L 300 340
            L 240 400
            L 80 400
            L 0 340
            Z
          `}
          fill={ROOM_FILL} stroke={WALL} strokeWidth="5"
        />
        {/* badge gold "VIP" */}
        <text
          x={150} y={210} textAnchor="middle"
          fill="#D4AF37" fontSize="32" fontWeight="700"
          fontFamily="Fraunces, Georgia, serif"
          letterSpacing="4"
        >
          VIP
        </text>
      </g>

      {/* ─── VIP piccola (basso-sx) ──────────────────────────────── */}
      <g transform="translate(60, 760)">
        <path
          d={`
            M 0 30
            L 30 0
            L 180 0
            L 200 25
            L 200 130
            L 180 160
            L 30 160
            L 0 130
            Z
          `}
          fill={ROOM_FILL} stroke={WALL} strokeWidth="4"
        />
        <text
          x={100} y={88} textAnchor="middle"
          fill="#D4AF37" fontSize="20" fontWeight="700"
          fontFamily="Fraunces, Georgia, serif"
          letterSpacing="3"
        >
          VIP
        </text>
      </g>

      {/* ─── Cassa ────────────────────────────────────────────────── */}
      <rect x={15} y={50} width={40} height={30} fill={WALL_LIGHT} stroke="#2c3137" strokeWidth="1" rx="3" />
      <text x={35} y={68} textAnchor="middle" fill={LABEL} fontSize="8" fontWeight="600" fontFamily="Inter, system-ui">CASSA</text>

      {/* ─── WC ───────────────────────────────────────────────────── */}
      <rect x={15} y={290} width={40} height={28} fill={WALL_LIGHT} stroke="#2c3137" strokeWidth="1" rx="3" />
      <text x={35} y={308} textAnchor="middle" fill={LABEL_DIM} fontSize="8" fontFamily="Inter, system-ui">WC</text>
      <rect x={15} y={325} width={40} height={28} fill={WALL_LIGHT} stroke="#2c3137" strokeWidth="1" rx="3" />
      <text x={35} y={343} textAnchor="middle" fill={LABEL_DIM} fontSize="8" fontFamily="Inter, system-ui">WC</text>

      {/* ─── Cucina (dietro al chiosco bar) ──────────────────────── */}
      <rect x={900} y={50} width={120} height={217} fill={WALL_LIGHT} stroke={WALL} strokeWidth="3" rx="2" />
      <text
        x={960} y={150} textAnchor="middle"
        fill={LABEL} fontSize="13" fontWeight="600"
        fontFamily="Fraunces, Georgia, serif"
      >
        CUCINA
      </text>

      {/* ─── Veranda fronte mare (tono pine) ──────────────────────── */}
      <rect x={810} y={280} width={70} height={420} fill="rgba(74,122,92,0.10)" stroke="#4A7A5C" strokeWidth="1" rx="2" opacity="0.7" />
      <text
        x={845} y={490} textAnchor="middle"
        fill="#4A7A5C" fontSize="11" fontWeight="600"
        fontFamily="Fraunces, Georgia, serif"
        transform="rotate(-90,845,490)"
        opacity="0.8"
      >
        VERANDA
      </text>
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

  // Auto-fit
  useEffect(() => {
    const el = containerRef.current
    if (!el || tables.length === 0) return
    const fit = () => {
      const rect = el.getBoundingClientRect()
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
        if (o && (o.pos_x !== t.pos_x || o.pos_y !== t.pos_y)) {
          await tablesAPI.update(t.id, { pos_x: t.pos_x, pos_y: t.pos_y })
          n++
        }
      }
      onRefresh?.()
      toast({ type: 'success', title: `Salvato (${n} spostati)` })
      setEditing(false)
    } catch {
      toast({ type: 'error', title: 'Errore' })
    } finally {
      setSaving(false)
    }
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
    if (e.target.tagName === 'svg' || e.target.classList?.contains('bg-layer')) {
      setPanning(true)
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    }
  }
  const onBgMove = e => {
    if (panning && panStart.current) setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y })
  }
  const onBgUp = () => { setPanning(false); panStart.current = null }
  const onWheel = e => { e.preventDefault(); setZoom(z => Math.min(2, Math.max(0.25, z - e.deltaY * 0.001))) }

  // Stats
  const free = tables.filter(t => t.status === 'free').length
  const occupied = tables.filter(t => t.status === 'occupied').length
  const reserved = tables.filter(t => t.status === 'reserved').length

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Mini toolbar (riva style) ──────────────────────────── */}
      <div className="flex items-center gap-2 px-2 sm:px-4 py-2 bg-[var(--color-surface-2)] border-b border-[var(--color-border-soft)] shrink-0">
        {/* Stats live */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-[var(--color-ok)] font-semibold tnum">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-ok)]" />
            {free} <span className="hidden sm:inline text-[var(--color-text-3)] font-normal">liberi</span>
          </span>
          <span className="flex items-center gap-1.5 text-[var(--color-gold)] font-semibold tnum">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-gold)]" />
            {occupied} <span className="hidden sm:inline text-[var(--color-text-3)] font-normal">occupati</span>
          </span>
          {reserved > 0 && (
            <span className="hidden sm:flex items-center gap-1.5 text-[var(--color-sea)] font-semibold tnum">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-sea)]" />
              {reserved} <span className="text-[var(--color-text-3)] font-normal">riservati</span>
            </span>
          )}
        </div>

        {/* Legenda compatta (md+) */}
        <div className="hidden lg:flex items-center gap-2 ml-2 pl-2 border-l border-[var(--color-border-soft)]">
          {Object.entries(STATUS_COLORS).map(([k,v]) => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: v.stroke }}/>
              <span className="text-[10px] text-[var(--color-text-3)]">
                {k==='free'?'Libero':k==='occupied'?'Occupato':k==='reserved'?'Riservato':k==='dirty'?'Pulizia':'Attesa'}
              </span>
            </div>
          ))}
        </div>

        {/* Zoom + edit */}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex items-center bg-[var(--color-surface)] rounded-lg border border-[var(--color-border-strong)] overflow-hidden">
            <button
              onClick={() => setZoom(z => Math.max(0.2, z-0.1))}
              className="px-2 py-1.5 text-[var(--color-text-2)] hover:bg-[rgba(255,255,255,0.04)] transition"
            >
              <Minus size={11}/>
            </button>
            <span className="text-[10px] text-[var(--color-text-2)] w-9 text-center font-semibold tnum">
              {Math.round(zoom*100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(3, z+0.1))}
              className="px-2 py-1.5 text-[var(--color-text-2)] hover:bg-[rgba(255,255,255,0.04)] transition"
            >
              <Plus size={11}/>
            </button>
          </div>
          {canEdit && (
            editing ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 bg-[var(--color-gold)] text-[#13181C] rounded-lg text-[11px] font-bold flex items-center gap-1 disabled:opacity-50 hover:brightness-110 transition"
              >
                <Save size={11}/>
                <span className="hidden sm:inline">{saving ? 'Salvando…' : 'Salva'}</span>
              </button>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 bg-[rgba(255,255,255,0.04)] text-[var(--color-text-2)] border border-[var(--color-border-strong)] hover:border-[var(--color-gold-ring)] hover:text-[var(--color-gold)] rounded-lg text-[11px] font-semibold flex items-center gap-1 transition"
              >
                <Move size={11}/>
                <span className="hidden sm:inline">Sposta</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* ─── Canvas SVG ─────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-[var(--color-canvas)]"
        onWheel={onWheel}
        onPointerDown={onBgDown} onPointerMove={onBgMove} onPointerUp={onBgUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ touchAction: 'none' }}
      >
        <svg width="100%" height="100%" style={{ cursor: panning ? 'grabbing' : 'default' }}>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            <defs>
              <pattern id="grid2" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgba(232,219,180,0.04)" strokeWidth="0.3"/>
              </pattern>
            </defs>
            <rect className="bg-layer" width={PLAN_W} height={PLAN_H} fill="url(#grid2)"/>
            <Restaurant zones={zones} />
            {local.map(t => (
              <TableShape
                key={t.id}
                table={t}
                zone={zones.find(z => z.id === t.zone_id)}
                selected={selected === t.id}
                onSelect={handleTableSelect}
                onDrag={handleDrag}
                editing={editing}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
