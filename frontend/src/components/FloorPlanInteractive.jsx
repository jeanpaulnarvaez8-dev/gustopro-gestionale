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

// Status text breve (3 lettere, daltonici-friendly: stato visibile anche senza colore)
const STATUS_SHORT = {
  free:     'FREE',
  occupied: 'OCC',
  reserved: 'RIS',
  dirty:    'PUL',
  parked:   'WAIT',
}

function TableShape({ table, zone, selected, onSelect, onDrag, editing, indexOrder = 0, dimmed = false }) {
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)
  const [tapping, setTapping] = useState(false)
  // Ripple effects: array di {id, cx, cy, t} — ogni tap genera un ripple
  // che si espande + svanisce in 600ms.
  const [ripples, setRipples] = useState([])
  // Live flash: oro pulsante 600ms quando lo stato cambia (utile per
  // multi-cameriere realtime: vedi che un altro ha modificato il tavolo).
  const [statusFlash, setStatusFlash] = useState(false)
  const prevStatus = useRef(table.status)
  const startRef = useRef(null)
  const rippleIdRef = useRef(0)
  const w = table.width || 60, h = table.height || 60
  const shape = table.shape || 'circle'
  const st = STATUS_COLORS[table.status] || STATUS_COLORS.free
  const isOccupied = table.status === 'occupied'
  const isReserved = table.status === 'reserved'
  const isDirty    = table.status === 'dirty'

  // Confetti particles: ogni transizione di stato genera 12 particelle che
  // esplodono dal centro del tavolo. Colore e direzione dipendono dal tipo
  // di transizione (apertura conto, chiusura, etc.).
  const [confetti, setConfetti] = useState([]) // [{id, angle, distance, color, t}]

  // Live flash on socket-driven status change: confronta status precedente,
  // se cambia → flash 600ms + confetti. NB: salta il primo render (mount).
  useEffect(() => {
    if (prevStatus.current === table.status) return
    if (prevStatus.current !== undefined) {
      setStatusFlash(true)
      // Confetti palette dipendente dalla transizione
      let palette = ['#D4AF37', '#F0E9D2'] // default oro+ivory
      if (prevStatus.current === 'free' && table.status === 'occupied') {
        // Apertura conto: oro+sea (celebrazione)
        palette = ['#D4AF37', '#3E7A93', '#F0E9D2']
      } else if (prevStatus.current === 'occupied' && table.status === 'free') {
        // Chiusura conto (cassa): pine+sand (relax)
        palette = ['#4A7A5C', '#C9A96E', '#F0E9D2']
      } else if (table.status === 'reserved') {
        palette = ['#3E7A93', '#F0E9D2']
      }
      const burst = Array.from({ length: 14 }, (_, i) => ({
        id: `${Date.now()}-${i}`,
        angle: (i / 14) * Math.PI * 2 + Math.random() * 0.3,
        distance: 28 + Math.random() * 22, // 28-50 px
        color: palette[i % palette.length],
        size: 2 + Math.random() * 2,
        t: Date.now(),
      }))
      setConfetti(burst)
      const tFlash = setTimeout(() => setStatusFlash(false), 700)
      const tConfetti = setTimeout(() => setConfetti([]), 1000)
      prevStatus.current = table.status
      return () => { clearTimeout(tFlash); clearTimeout(tConfetti) }
    }
    prevStatus.current = table.status
  }, [table.status])

  // Garbage-collect dei ripple scaduti (>700ms)
  useEffect(() => {
    if (ripples.length === 0) return
    const t = setTimeout(() => {
      const cutoff = Date.now() - 700
      setRipples((rs) => rs.filter((r) => r.t > cutoff))
    }, 750)
    return () => clearTimeout(t)
  }, [ripples])

  // "since_min": minuti da quando il tavolo e' nello stato corrente. Se il
  // backend non lo fornisce ancora, lo derivo da updated_at se presente.
  const sinceMin = (() => {
    if (typeof table.since_min === 'number') return table.since_min
    if (table.updated_at) {
      const ms = Date.now() - new Date(table.updated_at).getTime()
      return Math.max(0, Math.floor(ms / 60000))
    }
    return null
  })()
  // Soglia "in ritardo": occupato da > 30 min senza ordine recente → halo rosso
  const isLate = isOccupied && sinceMin !== null && sinceMin >= 30

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

  // Haptic mobile su tap
  const haptic = () => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(8) } catch { /* ignore */ }
    }
  }

  const down = e => {
    haptic()
    setTapping(true)
    // Ripple dal punto di tap (Material-style). Coordinate in spazio SVG locale
    // del gruppo tavolo: usa getBoundingClientRect per trasformare client →
    // coords interne (approssima, e' OK per effetto visivo).
    try {
      const target = e.currentTarget
      const rect = target.getBoundingClientRect()
      const cx = ((e.clientX - rect.left) / rect.width) * w
      const cy = ((e.clientY - rect.top) / rect.height) * h
      const id = ++rippleIdRef.current
      setRipples((rs) => [...rs, { id, cx, cy, t: Date.now() }])
    } catch { /* no-op */ }

    if (!editing) { onSelect(table); return }
    e.stopPropagation(); e.target.setPointerCapture(e.pointerId)
    setDragging(true); startRef.current = { x: e.clientX - table.pos_x, y: e.clientY - table.pos_y }
    onSelect(table)
  }
  const move = e => {
    if (dragging && startRef.current)
      onDrag(table.id, snap(e.clientX - startRef.current.x), snap(e.clientY - startRef.current.y))
  }
  const up = () => { setDragging(false); setTapping(false); startRef.current = null }
  // Anche pointercancel/leave resettano il tap (no glove-stuck su tablet)
  const cancel = () => { setTapping(false) }

  // Scale del gruppo: hover, tap, drag (solo in editing mode)
  const visualScale = dragging ? 1.06 : tapping ? 0.94 : hover ? 1.04 : 1

  // Animazione di stagger entrance: ogni tavolo appare con delay = i * 25ms
  const enterDelay = `${Math.min(indexOrder * 25, 600)}ms`

  // Clip-path per il ripple: deve restare DENTRO il tavolo. Definito
  // come <clipPath> nel <defs> globale (vedi Restaurant + svg defs).
  const clipId = `clip-${table.id}`

  return (
    <g
      transform={`translate(${table.pos_x},${table.pos_y}) rotate(${table.rotation||0},${w/2},${h/2})`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onPointerCancel={cancel} onPointerLeave={cancel}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        cursor: editing ? (dragging ? 'grabbing' : 'grab') : 'pointer',
        touchAction: 'none',
        transformBox: 'fill-box',
        transformOrigin: 'center',
        /* opacity gestita dalla keyframe `fp-enter` con animation-fill-mode
           `both` (mantiene opacity:0 durante delay E opacity:1 dopo).
           Se dimmed (spotlight), override post-animation a 0.28 via class. */
        opacity: dimmed ? 0.28 : undefined,
        transition: 'opacity 350ms ease, filter 200ms ease',
        filter: dragging
          ? 'drop-shadow(0 6px 18px rgba(212,175,55,0.55))'
          : statusFlash
          ? 'drop-shadow(0 0 12px rgba(212,175,55,0.85))'
          : 'none',
        animation: `fp-enter 350ms ease-out ${enterDelay} both`,
      }}
    >
      {/* Clip-path interno (per ripple) — segue la forma del tavolo */}
      <defs>
        {shape === 'circle' ? (
          <clipPath id={clipId}>
            <ellipse cx={w/2} cy={h/2} rx={w/2} ry={h/2} />
          </clipPath>
        ) : (
          <clipPath id={clipId}>
            <rect x={0} y={0} width={w} height={h} rx={shape==='rect' ? 4 : 6} />
          </clipPath>
        )}
      </defs>
      {/* Halo "in ritardo" — pulsa rosso, animazione SVG-native (NO box-shadow) */}
      {isLate && (
        <>
          {shape === 'circle' ? (
            <circle cx={w/2} cy={h/2} r={Math.max(w,h)/2 + 6}
              fill="none" stroke="#EF4444" strokeWidth="2.2" opacity="0.55">
              <animate attributeName="r"
                values={`${Math.max(w,h)/2 + 6};${Math.max(w,h)/2 + 18};${Math.max(w,h)/2 + 6}`}
                dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="opacity"
                values="0.6;0.05;0.6" dur="1.6s" repeatCount="indefinite" />
            </circle>
          ) : (
            <rect x={-8} y={-8} width={w+16} height={h+16} rx={12}
              fill="none" stroke="#EF4444" strokeWidth="2.2" opacity="0.55">
              <animate attributeName="opacity"
                values="0.65;0.1;0.65" dur="1.6s" repeatCount="indefinite" />
            </rect>
          )}
        </>
      )}

      {/* Glow soft per occupato/reserved (pulsa morbidamente) */}
      {(isOccupied || isReserved) && shape === 'circle' && (
        <ellipse cx={w/2} cy={h/2} rx={w/2+6} ry={h/2+6} fill={st.glow}>
          <animate attributeName="opacity" values="0.6;0.95;0.6" dur="2.4s" repeatCount="indefinite" />
        </ellipse>
      )}
      {(isOccupied || isReserved) && shape !== 'circle' && (
        <rect x={-6} y={-6} width={w+12} height={h+12} rx={10} fill={st.glow}>
          <animate attributeName="opacity" values="0.6;0.95;0.6" dur="2.4s" repeatCount="indefinite" />
        </rect>
      )}

      {/* Indicator alert "pulizia" — striscia diagonale animata (no colore solo!) */}
      {isDirty && (
        <g opacity="0.5">
          <pattern id={`dirty-${table.id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#EAB308" strokeWidth="1.5" opacity="0.4" />
          </pattern>
          {shape === 'circle'
            ? <ellipse cx={w/2} cy={h/2} rx={w/2-1} ry={h/2-1} fill={`url(#dirty-${table.id})`} />
            : <rect x={1} y={1} width={w-2} height={h-2} rx={3} fill={`url(#dirty-${table.id})`} />
          }
        </g>
      )}

      {/* Wrapper interno con scale (hover/tap + entry "pop"). NB: il pop
          animation modifica solo `scale` (no translate), quindi non rompe
          il transform del <g> parent. Si compone con visualScale via JS. */}
      <g style={{
        transform: `scale(${visualScale})`,
        transformBox: 'fill-box',
        transformOrigin: 'center',
        transition: 'transform 180ms cubic-bezier(0.34, 1.4, 0.64, 1)',
        /* NO fill-mode: dopo l'animation lo style ritorna a `scale(visualScale)`
           inline → hover/tap continuano a funzionare. Durante il delay il
           parent ha opacity:0 (fp-enter keyframe 0%) quindi il "flash" iniziale
           di scale(1) e' invisibile. */
        animation: `fp-pop 450ms cubic-bezier(0.34, 1.4, 0.64, 1) ${enterDelay}`,
      }}>
        {/* Confetti particles — esplosione 14 particle dal centro del tavolo
            quando lo stato cambia (apertura/chiusura conto, riservazione). */}
        {confetti.length > 0 && (
          <g style={{ pointerEvents: 'none' }}>
            {confetti.map((p) => {
              const cx = w / 2
              const cy = h / 2
              const tx = cx + Math.cos(p.angle) * p.distance
              const ty = cy + Math.sin(p.angle) * p.distance - 10 // bias verso l'alto (gravità inversa)
              return (
                <circle key={p.id} cx={cx} cy={cy} r={p.size}
                  fill={p.color} opacity="0.95">
                  <animate attributeName="cx"
                    values={`${cx};${tx}`}
                    dur="1000ms" repeatCount="1" fill="freeze"
                    calcMode="spline" keySplines="0.16 1 0.3 1" />
                  <animate attributeName="cy"
                    values={`${cy};${ty};${ty + 18}`}
                    keyTimes="0;0.6;1"
                    dur="1000ms" repeatCount="1" fill="freeze"
                    calcMode="spline" keySplines="0.16 1 0.3 1; 0.3 0 0.7 1" />
                  <animate attributeName="opacity"
                    values="0.95;0.95;0" dur="1000ms"
                    keyTimes="0;0.55;1" repeatCount="1" fill="freeze" />
                </circle>
              )
            })}
          </g>
        )}

        {/* Status flash overlay — pulsa oro quando arriva un cambio stato via socket */}
        {statusFlash && (
          shape === 'circle' ? (
            <ellipse cx={w/2} cy={h/2} rx={w/2 + 4} ry={h/2 + 4}
              fill="none" stroke="#D4AF37" strokeWidth="3" opacity="0.9">
              <animate attributeName="r"
                values={`${w/2 + 4};${w/2 + 16}`} dur="600ms" repeatCount="1" />
              <animate attributeName="opacity"
                values="0.9;0" dur="600ms" repeatCount="1" />
            </ellipse>
          ) : (
            <rect x={-4} y={-4} width={w + 8} height={h + 8} rx={10}
              fill="none" stroke="#D4AF37" strokeWidth="3" opacity="0.9">
              <animate attributeName="opacity"
                values="0.9;0" dur="600ms" repeatCount="1" />
            </rect>
          )
        )}

        {/* Sedie con stato (più scure per occupied) */}
        {chairs.map((c, i) => (
          <rect
            key={i} x={c.cx-5} y={c.cy-5} width={10} height={10} rx={3}
            fill={isOccupied ? '#2a2418' : '#181D22'}
            stroke={isOccupied ? '#5c4d2a' : '#2c3137'}
            strokeWidth="0.8"
            style={{ transition: 'fill 250ms ease, stroke 250ms ease' }}
          />
        ))}

        {/* Tavolo (forma) */}
        {shape === 'circle' ? (
          <ellipse
            cx={w/2} cy={h/2} rx={w/2} ry={h/2}
            fill={st.fill}
            stroke={selected ? '#D4AF37' : st.stroke}
            strokeWidth={selected ? 3 : hover ? 2 : 1.5}
            style={{ transition: 'fill 280ms ease, stroke 200ms ease, stroke-width 150ms ease' }}
          />
        ) : (
          <rect
            x={0} y={0} width={w} height={h} rx={shape==='rect' ? 4 : 6}
            fill={st.fill}
            stroke={selected ? '#D4AF37' : st.stroke}
            strokeWidth={selected ? 3 : hover ? 2 : 1.5}
            style={{ transition: 'fill 280ms ease, stroke 200ms ease, stroke-width 150ms ease' }}
          />
        )}

        {/* Shimmer sweep (gold premium) per i tavoli occupati: una stria
            chiara che attraversa il tavolo orizzontalmente ogni 4s.
            Clip-path tiene la stria DENTRO la forma del tavolo. */}
        {isOccupied && !dimmed && (
          <g clipPath={`url(#${clipId})`} style={{ pointerEvents: 'none' }}>
            <rect x={-w} y={0} width={w * 0.5} height={h}
              fill="url(#shimmer-gold)" opacity="0.9">
              <animate
                attributeName="x"
                values={`${-w * 0.6};${w * 1.2}`}
                dur="3.5s"
                begin={`${(table.id?.charCodeAt?.(0) || 0) % 7 * 0.4}s`}
                repeatCount="indefinite"
              />
            </rect>
          </g>
        )}

        {/* Ripple-on-tap (Material): cerchio che si espande dal punto di tap.
            Clip-path lo tiene dentro la forma del tavolo. */}
        {ripples.length > 0 && (
          <g clipPath={`url(#${clipId})`} style={{ pointerEvents: 'none' }}>
            {ripples.map((r) => (
              <circle key={r.id} cx={r.cx} cy={r.cy} r="2" fill="#D4AF37" opacity="0.65">
                <animate attributeName="r"
                  values={`2;${Math.max(w, h) * 0.9}`}
                  dur="600ms" repeatCount="1" fill="freeze" />
                <animate attributeName="opacity"
                  values="0.55;0" dur="600ms" repeatCount="1" fill="freeze" />
              </circle>
            ))}
          </g>
        )}

        {/* Numero tavolo */}
        <text
          x={w/2} y={h/2 - 4}
          textAnchor="middle" dominantBaseline="middle"
          fill="#F0E9D2" fontSize={w > 55 ? 15 : 12} fontWeight="800"
          fontFamily="Inter, system-ui"
          style={{ pointerEvents: 'none' }}
        >
          {table.table_number}
        </text>

        {/* Status short (daltonici-friendly: testo SEMPRE visibile, non solo colore) */}
        <text
          x={w/2} y={h/2 + 8}
          textAnchor="middle" dominantBaseline="middle"
          fill={st.stroke} fontSize="7.5" fontWeight="800"
          fontFamily="Inter, system-ui"
          letterSpacing="0.8"
          style={{ pointerEvents: 'none' }}
        >
          {STATUS_SHORT[table.status] || ''}
        </text>

        {/* Posti */}
        <text
          x={w/2} y={h/2 + 18}
          textAnchor="middle" fill="rgba(240,233,210,0.42)"
          fontSize="8" fontFamily="Inter, system-ui"
          style={{ pointerEvents: 'none' }}
        >
          {table.seats}p
        </text>

        {/* Badge tempo (se occupato/parked) — bandina tonda sopra al tavolo */}
        {(isOccupied || table.status === 'parked') && sinceMin !== null && sinceMin > 0 && (
          <g style={{ pointerEvents: 'none' }}>
            <rect
              x={w/2 - 18} y={-12} width={36} height={16} rx={8}
              fill="#0a0a0a"
              stroke={isLate ? '#EF4444' : '#2c3137'}
              strokeWidth="1"
            />
            <text
              x={w/2} y={-1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="9.5" fontWeight="800"
              fill={isLate ? '#EF4444' : 'rgba(240,233,210,0.7)'}
              fontFamily="Inter, system-ui"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {sinceMin >= 60 ? `${Math.floor(sinceMin/60)}h${sinceMin%60}` : `${sinceMin}'`}
            </text>
          </g>
        )}

        {/* Indicatore status pallino con halo (alto-dx) */}
        <circle cx={w - 2} cy={4} r={5} fill={st.glow}>
          {(isOccupied || isReserved) && (
            <animate attributeName="r" values="5;7;5" dur="1.6s" repeatCount="indefinite" />
          )}
        </circle>
        <circle cx={w - 2} cy={4} r={3} fill={st.stroke} />
      </g>
    </g>
  )
}

// ─── Planimetria architettonica reale Riva Beach Salento ─────────────────────
// Scala: 1 metro = 50 pixel. Origine: (60, 50) = angolo NW della Sala da Pranzo.
// Riferimento: foto planimetria architettonica fornita dal proprietario
// (2026-05-11). Tutte le coordinate sono derivate dalle quote reali del
// disegno tecnico: 7.94×3.40 (sala pranzo), 5.60×3.61 (chiosco), 3.76
// (apertura), + stima visiva delle altre quote non quotate.
function Restaurant({ zones }) {
  const WALL = '#0B0E11'           // canvas darker — pareti portanti spesse
  const WALL_LIGHT = '#181D22'      // surface-2 — riempimenti interni
  const ROOM_FILL = '#13181C'       // bg — pavimento sale
  const LABEL = 'rgba(240,233,210,0.42)' // text-3
  const LABEL_DIM = 'rgba(240,233,210,0.28)'
  const QUOTE = '#D4AF37'           // oro — quote architettoniche stile CAD

  // Helper quota architettonica orizzontale (linea + 2 frecce + testo numerico)
  const HQuote = ({ x1, x2, y, label, offset = 18 }) => {
    const yq = y - offset
    return (
      <g style={{ pointerEvents: 'none' }}>
        {/* Linee di estensione verticali (dai muri alla quota) */}
        <line x1={x1} y1={y} x2={x1} y2={yq - 4} stroke={QUOTE} strokeWidth="0.6" opacity="0.55" />
        <line x1={x2} y1={y} x2={x2} y2={yq - 4} stroke={QUOTE} strokeWidth="0.6" opacity="0.55" />
        {/* Linea quota con frecce */}
        <line x1={x1} y1={yq} x2={x2} y2={yq} stroke={QUOTE} strokeWidth="0.8" opacity="0.7"
          markerStart="url(#arrowL)" markerEnd="url(#arrowR)" />
        {/* Label centrato */}
        <text x={(x1+x2)/2} y={yq - 4} textAnchor="middle"
          fill={QUOTE} fontSize="9" fontWeight="600"
          fontFamily="Inter, system-ui" opacity="0.85"
          style={{ fontVariantNumeric: 'tabular-nums' }}>
          {label}
        </text>
      </g>
    )
  }
  // Quota verticale (specchio della HQuote)
  const VQuote = ({ y1, y2, x, label, offset = 18 }) => {
    const xq = x - offset
    return (
      <g style={{ pointerEvents: 'none' }}>
        <line x1={x} y1={y1} x2={xq - 4} y2={y1} stroke={QUOTE} strokeWidth="0.6" opacity="0.55" />
        <line x1={x} y1={y2} x2={xq - 4} y2={y2} stroke={QUOTE} strokeWidth="0.6" opacity="0.55" />
        <line x1={xq} y1={y1} x2={xq} y2={y2} stroke={QUOTE} strokeWidth="0.8" opacity="0.7"
          markerStart="url(#arrowU)" markerEnd="url(#arrowD)" />
        <text x={xq - 4} y={(y1+y2)/2} textAnchor="middle"
          fill={QUOTE} fontSize="9" fontWeight="600"
          fontFamily="Inter, system-ui" opacity="0.85"
          transform={`rotate(-90 ${xq - 4} ${(y1+y2)/2})`}
          style={{ fontVariantNumeric: 'tabular-nums' }}>
          {label}
        </text>
      </g>
    )
  }

  // Coordinate chiave (scala 1m=50px, origine (60,50) sala-pranzo NW)
  // Calcolate da quote architettoniche reali + stima visiva sul resto
  const M = 50          // 1 metro = 50 px
  const X0 = 60         // origine x (angolo NW sala pranzo)
  const Y0 = 50         // origine y
  const SP_W = 7.94 * M // sala pranzo width = 397
  const SP_H = 3.40 * M // sala pranzo height = 170
  const CB_X = X0 + SP_W + 6 // chiosco x (muro condiviso 6px)
  const CB_W = 5.60 * M // chiosco width = 280
  const CB_H = 3.61 * M // chiosco height = 180.5
  const AP_W = 3.76 * M // apertura 3.76 m = 188

  // Punti chiave del bordo NETTUNO (forma irregolare)
  // Tutti in coordinate svg assolute (X0+x*M, Y0+y*M)
  const NX_W = X0                       // muro ovest Nettuno
  const NY_N = Y0 + SP_H + 6            // muro nord Nettuno (sotto sala pranzo)
  const NX_E = X0 + 10.6 * M            // muro est (verso bar, prima della diagonale)
  const NY_S = Y0 + 12.4 * M            // muro sud Nettuno

  return (
    <g>
      {/* ─── Marker frecce per quote architettoniche (defs locali) ───── */}
      <defs>
        <marker id="arrowL" viewBox="0 0 10 10" refX="2" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 9 2 L 2 5 L 9 8" fill="none" stroke={QUOTE} strokeWidth="1.2" />
        </marker>
        <marker id="arrowR" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 1 2 L 8 5 L 1 8" fill="none" stroke={QUOTE} strokeWidth="1.2" />
        </marker>
        <marker id="arrowU" viewBox="0 0 10 10" refX="5" refY="2"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 2 9 L 5 2 L 8 9" fill="none" stroke={QUOTE} strokeWidth="1.2" />
        </marker>
        <marker id="arrowD" viewBox="0 0 10 10" refX="5" refY="8"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 2 1 L 5 8 L 8 1" fill="none" stroke={QUOTE} strokeWidth="1.2" />
        </marker>
        {/* Pattern tratteggio per area scoperta (Bar/dehor centrale) */}
        <pattern id="dashed-floor" width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M-2,4 l8,-8 M0,14 l14,-14 M10,16 l8,-8" stroke="rgba(232,219,180,0.06)" strokeWidth="1" />
        </pattern>
      </defs>

      {/* ─── MARE est (tonalità sea Riva) ──────────────────────────── */}
      <rect x={1280} y={0} width={220} height={1080} fill="rgba(62,122,147,0.18)" />
      <text x={1390} y={540} textAnchor="middle"
        fill="#3E7A93" fontSize="32" fontWeight="800" fontStyle="italic"
        fontFamily="Fraunces, Georgia, serif"
        transform="rotate(90,1390,540)" letterSpacing="10" opacity="0.55">
        Mare
      </text>
      {[80,200,320,440,560,680,800,920].map(y => (
        <path key={y}
          d={`M 1280 ${y} Q 1315 ${y-12} 1350 ${y} Q 1385 ${y+12} 1390 ${y}`}
          stroke="#3E7A93" strokeWidth="1.5" fill="none" opacity="0.55" />
      ))}

      {/* ════════════════════════════════════════════════════════════
          PIANO TERRA — interno (sale chiuse con muri portanti)
          ════════════════════════════════════════════════════════════ */}

      {/* SALA DA PRANZO (7.94 × 3.40 m) */}
      <rect x={X0} y={Y0} width={SP_W} height={SP_H}
        fill={ROOM_FILL} stroke={WALL} strokeWidth="6" />
      <text x={X0 + SP_W/2} y={Y0 + SP_H/2 - 6} textAnchor="middle"
        fill={LABEL} fontSize="15" fontWeight="700"
        fontFamily="Fraunces, Georgia, serif" letterSpacing="2">
        SALA DA PRANZO
      </text>
      <text x={X0 + SP_W/2} y={Y0 + SP_H/2 + 10} textAnchor="middle"
        fill={LABEL_DIM} fontSize="9" fontFamily="Inter, system-ui">
        7.94 × 3.40 m
      </text>

      {/* CHIOSCO BAR (5.60 × 3.61 m) — accostato alla sala pranzo */}
      <rect x={CB_X} y={Y0} width={CB_W} height={CB_H}
        fill={ROOM_FILL} stroke={WALL} strokeWidth="6" />
      <text x={CB_X + CB_W/2} y={Y0 + CB_H/2 - 6} textAnchor="middle"
        fill={LABEL} fontSize="15" fontWeight="700"
        fontFamily="Fraunces, Georgia, serif" letterSpacing="2">
        CHIOSCO BAR
      </text>
      <text x={CB_X + CB_W/2} y={Y0 + CB_H/2 + 10} textAnchor="middle"
        fill={LABEL_DIM} fontSize="9" fontFamily="Inter, system-ui">
        5.60 × 3.61 m
      </text>

      {/* APERTURA 3.76 m sotto sala pranzo (accesso a NETTUNO) */}
      {/* Il muro inferiore della sala pranzo NON è continuo: c'è un'apertura
          larga 3.76m centrata verso l'interno della sala. */}
      <line x1={X0} y1={Y0 + SP_H} x2={X0 + (7.94-3.76)*M/2} y2={Y0 + SP_H}
        stroke={WALL} strokeWidth="6" />
      <line x1={X0 + (7.94+3.76)*M/2} y1={Y0 + SP_H} x2={X0 + SP_W} y2={Y0 + SP_H}
        stroke={WALL} strokeWidth="6" />

      {/* ════════════════════════════════════════════════════════════
          NETTUNO — sala interna principale (forma irregolare)
          ════════════════════════════════════════════════════════════
          Bordo: NW da angolo SW sala-pranzo, scende a sud, va a est
          fino al confine col VIP grande (diagonale), risale verso il
          BAR centrale, poi all'apertura sotto sala-pranzo. */}
      <path
        d={`
          M ${NX_W} ${NY_N}
          L ${NX_W} ${NY_S}
          L ${X0 + 8.5*M} ${NY_S}
          L ${X0 + 11.5*M} ${Y0 + 9*M}
          L ${X0 + 11.0*M} ${Y0 + 5*M}
          L ${X0 + 9.8*M} ${Y0 + 4.6*M}
          L ${NX_W} ${NY_N}
          Z
        `}
        fill={ROOM_FILL} stroke={WALL} strokeWidth="5" />

      <text x={X0 + 4*M} y={Y0 + 8*M} textAnchor="middle"
        fill={LABEL} fontSize="40" fontWeight="700"
        fontFamily="Fraunces, Georgia, serif" letterSpacing="8">
        NETTUNO
      </text>

      {/* ════════════════════════════════════════════════════════════
          BAR centrale — area aperta/dehor (tra Nettuno e VIP grande)
          ════════════════════════════════════════════════════════════ */}
      <path
        d={`
          M ${X0 + 9.8*M} ${Y0 + 4.6*M}
          L ${X0 + 11.0*M} ${Y0 + 5*M}
          L ${X0 + 11.5*M} ${Y0 + 9*M}
          L ${X0 + 14*M} ${Y0 + 7*M}
          L ${X0 + 14*M} ${Y0 + 4*M}
          L ${X0 + 11.2*M} ${Y0 + 4*M}
          Z
        `}
        fill="url(#dashed-floor)" stroke="rgba(184,92,60,0.55)"
        strokeWidth="1.5" strokeDasharray="6 4" />

      <text x={X0 + 12.5*M} y={Y0 + 5.5*M} textAnchor="middle"
        fill={LABEL} fontSize="22" fontWeight="600"
        fontFamily="Fraunces, Georgia, serif" letterSpacing="4">
        BAR
      </text>

      {/* Bancone bar + 6 sgabelli — tono terracotta */}
      <rect x={X0 + 11.3*M} y={Y0 + 6*M} width={2.4*M} height={0.6*M}
        fill="rgba(184,92,60,0.40)" stroke="#B85C3C" strokeWidth="2" rx="4" />
      {[0,1,2,3,4,5].map(i => (
        <circle key={`bs${i}`}
          cx={X0 + 11.5*M + i*0.4*M} cy={Y0 + 6.95*M}
          r={7} fill="#181D22" stroke="#2c3137" strokeWidth="1" />
      ))}

      {/* ════════════════════════════════════════════════════════════
          VIP GRANDE — terrazza ottagonale fronte mare (ruotata -30°)
          ════════════════════════════════════════════════════════════
          Forma: ottagono allungato a "T" con un lato aperto verso il
          Bar (lato NW). Il muro nord-ovest e' interrotto per accesso. */}
      <g transform={`translate(${X0 + 11.5*M}, ${Y0 + 6*M}) rotate(-30)`}>
        {/* Bordo principale dell'ottagono (con lato NW aperto) */}
        <path
          d={`
            M 60 0
            L 220 0
            L 280 60
            L 280 280
            L 220 340
            L 60 340
            L 0 280
            L 0 80
          `}
          fill={ROOM_FILL} stroke={WALL} strokeWidth="5"
          strokeLinejoin="round" strokeLinecap="round" />
        {/* Lato NW (apertura verso Bar) tratteggiato */}
        <line x1="0" y1="80" x2="60" y2="0" stroke={WALL} strokeWidth="2"
          strokeDasharray="6 4" opacity="0.5" />

        <text x="140" y="180" textAnchor="middle"
          fill="#D4AF37" fontSize="34" fontWeight="700"
          fontFamily="Fraunces, Georgia, serif" letterSpacing="5">
          VIP
        </text>
        <text x="140" y="205" textAnchor="middle"
          fill="rgba(212,175,55,0.55)" fontSize="9"
          fontFamily="Inter, system-ui" letterSpacing="2">
          TERRAZZA MARE
        </text>
      </g>

      {/* ════════════════════════════════════════════════════════════
          VIP PICCOLO — basso-sx (sala secondaria con angoli smussati)
          ════════════════════════════════════════════════════════════ */}
      <g transform={`translate(${X0 + 0.5*M}, ${Y0 + 13.5*M})`}>
        <path
          d={`
            M 0 30
            L 30 0
            L 200 0
            L 220 25
            L 220 140
            L 200 165
            L 30 165
            L 0 140
            Z
          `}
          fill={ROOM_FILL} stroke={WALL} strokeWidth="4"
          strokeLinejoin="round" strokeLinecap="round" />
        <text x="110" y="92" textAnchor="middle"
          fill="#D4AF37" fontSize="22" fontWeight="700"
          fontFamily="Fraunces, Georgia, serif" letterSpacing="3">
          VIP
        </text>
      </g>

      {/* ════════════════════════════════════════════════════════════
          SERVIZI: Cassa, WC ×2, Cucina, Veranda
          ════════════════════════════════════════════════════════════ */}
      {/* Cassa (angolo NW) */}
      <rect x={15} y={Y0} width={40} height={30}
        fill={WALL_LIGHT} stroke="#2c3137" strokeWidth="1" rx="3" />
      <text x={35} y={Y0 + 18} textAnchor="middle"
        fill={LABEL} fontSize="8" fontWeight="600" fontFamily="Inter, system-ui">
        CASSA
      </text>

      {/* WC ×2 (lato ovest, sotto cassa) */}
      <rect x={15} y={Y0 + 4.8*M} width={40} height={28}
        fill={WALL_LIGHT} stroke="#2c3137" strokeWidth="1" rx="3" />
      <text x={35} y={Y0 + 4.8*M + 18} textAnchor="middle"
        fill={LABEL_DIM} fontSize="8" fontFamily="Inter, system-ui">
        WC
      </text>
      <rect x={15} y={Y0 + 5.5*M} width={40} height={28}
        fill={WALL_LIGHT} stroke="#2c3137" strokeWidth="1" rx="3" />
      <text x={35} y={Y0 + 5.5*M + 18} textAnchor="middle"
        fill={LABEL_DIM} fontSize="8" fontFamily="Inter, system-ui">
        WC
      </text>

      {/* CUCINA (dietro chiosco bar, comunicante) */}
      <rect x={CB_X + CB_W + 4} y={Y0} width={2.4*M} height={CB_H}
        fill={WALL_LIGHT} stroke={WALL} strokeWidth="3" rx="2" />
      <text x={CB_X + CB_W + 4 + 1.2*M} y={Y0 + CB_H/2 + 4}
        textAnchor="middle" fill={LABEL} fontSize="13" fontWeight="600"
        fontFamily="Fraunces, Georgia, serif" letterSpacing="2">
        CUCINA
      </text>

      {/* VERANDA fronte mare (tono pine) */}
      <rect x={CB_X + CB_W + 4} y={Y0 + CB_H + 10}
        width={1.4*M} height={8*M}
        fill="rgba(74,122,92,0.10)" stroke="#4A7A5C" strokeWidth="1"
        rx="2" opacity="0.75" />
      <text x={CB_X + CB_W + 4 + 0.7*M} y={Y0 + CB_H + 10 + 4*M}
        textAnchor="middle" fill="#4A7A5C" fontSize="11" fontWeight="600"
        fontFamily="Fraunces, Georgia, serif"
        transform={`rotate(-90 ${CB_X + CB_W + 4 + 0.7*M} ${Y0 + CB_H + 10 + 4*M})`}
        opacity="0.85" letterSpacing="3">
        VERANDA
      </text>

      {/* ════════════════════════════════════════════════════════════
          QUOTE ARCHITETTONICHE — stile CAD oro
          ════════════════════════════════════════════════════════════ */}
      {/* Sala pranzo: 7.94m larghezza (sopra) + 3.40m altezza (sx) */}
      <HQuote x1={X0} x2={X0 + SP_W} y={Y0} label="7.94" offset={22} />
      <VQuote y1={Y0} y2={Y0 + SP_H} x={X0} label="3.40" offset={22} />

      {/* Chiosco bar: 5.60m larghezza (sopra) + 3.61m altezza (dx) */}
      <HQuote x1={CB_X} x2={CB_X + CB_W} y={Y0} label="5.60" offset={22} />
      <VQuote y1={Y0} y2={Y0 + CB_H} x={CB_X + CB_W} label="3.61" offset={-22} />

      {/* Apertura 3.76m (sotto sala pranzo) */}
      <HQuote
        x1={X0 + (7.94-3.76)*M/2}
        x2={X0 + (7.94+3.76)*M/2}
        y={Y0 + SP_H} label="3.76" offset={-22} />
    </g>
  )
}

const PLAN_W = 1500
const PLAN_H = 1080

export default function FloorPlanInteractive({ tables, zones, onTableClick, canEdit, onRefresh, spotlightZoneId = null }) {
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
              {/* Grid pattern di sfondo */}
              <pattern id="grid2" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgba(232,219,180,0.04)" strokeWidth="0.3"/>
              </pattern>
              {/* Grid GRANDE in editing mode: snap-grid visibile */}
              <pattern id="grid-edit" width={GRID*2} height={GRID*2} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID*2} 0 L 0 0 0 ${GRID*2}`} fill="none" stroke="rgba(212,175,55,0.13)" strokeWidth="0.5"/>
              </pattern>
              {/* Shimmer sweep gradient per tavoli oro (occupati) */}
              <linearGradient id="shimmer-gold" x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%"   stopColor="#D4AF37" stopOpacity="0" />
                <stop offset="40%"  stopColor="#F0E9D2" stopOpacity="0.18" />
                <stop offset="50%"  stopColor="#FFFFFF" stopOpacity="0.32" />
                <stop offset="60%"  stopColor="#F0E9D2" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Sfondo: in editing mode, grid piu' visibile (snap-feedback) */}
            <rect
              className="bg-layer" width={PLAN_W} height={PLAN_H}
              fill={editing ? 'url(#grid-edit)' : 'url(#grid2)'}
              style={{ transition: 'fill 240ms ease' }}
            />
            <Restaurant zones={zones} />

            {/* Linee guida snap durante drag (croce verde sul tavolo selezionato) */}
            {editing && selected && (() => {
              const t = local.find(x => x.id === selected)
              if (!t) return null
              const cx = t.pos_x + (t.width || 60) / 2
              const cy = t.pos_y + (t.height || 60) / 2
              return (
                <g style={{ pointerEvents: 'none' }} opacity="0.5">
                  <line x1={cx} y1={0} x2={cx} y2={PLAN_H}
                    stroke="#22C55E" strokeWidth="1" strokeDasharray="4 4">
                    <animate attributeName="stroke-dashoffset"
                      values="0;-8" dur="600ms" repeatCount="indefinite" />
                  </line>
                  <line x1={0} y1={cy} x2={PLAN_W} y2={cy}
                    stroke="#22C55E" strokeWidth="1" strokeDasharray="4 4">
                    <animate attributeName="stroke-dashoffset"
                      values="0;-8" dur="600ms" repeatCount="indefinite" />
                  </line>
                </g>
              )
            })()}

            {local.map((t, i) => (
              <TableShape
                key={t.id}
                indexOrder={i}
                table={t}
                zone={zones.find(z => z.id === t.zone_id)}
                selected={selected === t.id}
                onSelect={handleTableSelect}
                onDrag={handleDrag}
                editing={editing}
                dimmed={spotlightZoneId != null && t.zone_id !== spotlightZoneId}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
