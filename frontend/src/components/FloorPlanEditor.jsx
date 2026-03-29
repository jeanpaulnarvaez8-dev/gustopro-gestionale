import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Minus, Move, RotateCw, Circle, Square, RectangleHorizontal, Trash2, Save, Users } from 'lucide-react'
import { tablesAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

const GRID_SIZE = 20
const ZOOM_STEP = 0.1
const MIN_ZOOM = 0.3
const MAX_ZOOM = 2

const SHAPES = [
  { id: 'circle', icon: Circle, label: 'Tondo' },
  { id: 'square', icon: Square, label: 'Quadrato' },
  { id: 'rect', icon: RectangleHorizontal, label: 'Rettangolare' },
]

function snapToGrid(v) {
  return Math.round(v / GRID_SIZE) * GRID_SIZE
}

function TableShape({ table, zone, isSelected, onSelect, onDragEnd, isEditing }) {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef(null)
  const zoneColor = zone?.color || '#3B82F6'

  const statusColors = {
    free: 'rgba(52, 211, 153, 0.15)',
    occupied: 'rgba(239, 68, 68, 0.15)',
    reserved: 'rgba(59, 130, 246, 0.15)',
    dirty: 'rgba(234, 179, 8, 0.15)',
    parked: 'rgba(168, 85, 247, 0.15)',
  }

  const handlePointerDown = (e) => {
    if (!isEditing) return
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    setDragging(true)
    startRef.current = { x: e.clientX - table.pos_x, y: e.clientY - table.pos_y }
    onSelect(table.id)
  }

  const handlePointerMove = (e) => {
    if (!dragging || !startRef.current) return
    const newX = snapToGrid(e.clientX - startRef.current.x)
    const newY = snapToGrid(e.clientY - startRef.current.y)
    onDragEnd(table.id, newX, newY, true) // preview
  }

  const handlePointerUp = (e) => {
    if (!dragging || !startRef.current) return
    setDragging(false)
    const newX = snapToGrid(e.clientX - startRef.current.x)
    const newY = snapToGrid(e.clientY - startRef.current.y)
    startRef.current = null
    onDragEnd(table.id, newX, newY, false) // commit
  }

  const w = table.width || 60
  const h = table.height || 60
  const shape = table.shape || 'circle'

  return (
    <g
      transform={`translate(${table.pos_x}, ${table.pos_y}) rotate(${table.rotation || 0}, ${w/2}, ${h/2})`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: isEditing ? 'grab' : 'pointer', touchAction: 'none' }}
      onClick={() => !isEditing && onSelect(table.id)}
    >
      {shape === 'circle' ? (
        <ellipse cx={w/2} cy={h/2} rx={w/2} ry={h/2}
          fill={statusColors[table.status] || statusColors.free}
          stroke={isSelected ? '#D4AF37' : zoneColor}
          strokeWidth={isSelected ? 3 : 1.5}
          strokeDasharray={table.status === 'reserved' ? '5,3' : 'none'}
        />
      ) : (
        <rect x={0} y={0} width={w} height={h}
          rx={shape === 'square' ? 6 : 10}
          fill={statusColors[table.status] || statusColors.free}
          stroke={isSelected ? '#D4AF37' : zoneColor}
          strokeWidth={isSelected ? 3 : 1.5}
          strokeDasharray={table.status === 'reserved' ? '5,3' : 'none'}
        />
      )}
      <text x={w/2} y={h/2 - 4} textAnchor="middle" dominantBaseline="middle"
        fill="#F5F5DC" fontSize="14" fontWeight="700" fontFamily="sans-serif">
        T{table.table_number}
      </text>
      <text x={w/2} y={h/2 + 12} textAnchor="middle" dominantBaseline="middle"
        fill="#888" fontSize="9" fontFamily="sans-serif">
        {table.seats}p
      </text>
    </g>
  )
}

export default function FloorPlanEditor({ tables, zones, onTableUpdate, onTableDelete, onTableCreate, assignments = [] }) {
  const { toast } = useToast()
  const svgRef = useRef(null)
  const [zoom, setZoom] = useState(0.8)
  const [pan, setPan] = useState({ x: 20, y: 20 })
  const [panning, setPanning] = useState(false)
  const panStart = useRef(null)
  const [selectedTable, setSelectedTable] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [localTables, setLocalTables] = useState(tables)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setLocalTables(tables) }, [tables])

  const selectedData = localTables.find(t => t.id === selectedTable)

  const handleDragEnd = useCallback((tableId, newX, newY, isPreview) => {
    setLocalTables(prev => prev.map(t =>
      t.id === tableId ? { ...t, pos_x: Math.max(0, newX), pos_y: Math.max(0, newY) } : t
    ))
  }, [])

  const handleSavePositions = async () => {
    setSaving(true)
    try {
      for (const t of localTables) {
        const orig = tables.find(o => o.id === t.id)
        if (orig && (orig.pos_x !== t.pos_x || orig.pos_y !== t.pos_y || orig.shape !== t.shape || orig.width !== t.width || orig.height !== t.height || orig.rotation !== t.rotation)) {
          await tablesAPI.update(t.id, { pos_x: t.pos_x, pos_y: t.pos_y, shape: t.shape, width: t.width, height: t.height, rotation: t.rotation })
        }
      }
      onTableUpdate?.()
      toast({ type: 'success', title: 'Pianta salvata' })
    } catch {
      toast({ type: 'error', title: 'Errore salvataggio' })
    } finally { setSaving(false) }
  }

  const handleBgPointerDown = (e) => {
    if (e.target === svgRef.current || e.target.tagName === 'rect') {
      setPanning(true)
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    }
  }
  const handleBgPointerMove = (e) => {
    if (!panning || !panStart.current) return
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y })
  }
  const handleBgPointerUp = () => { setPanning(false); panStart.current = null }

  const handleWheel = (e) => {
    e.preventDefault()
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.001)))
  }

  const updateSelected = (field, value) => {
    setLocalTables(prev => prev.map(t =>
      t.id === selectedTable ? { ...t, [field]: value } : t
    ))
  }

  // Raggruppa assegnazioni per zona
  const assignmentsByZone = {}
  assignments.forEach(a => {
    if (!assignmentsByZone[a.zone_id]) assignmentsByZone[a.zone_id] = []
    assignmentsByZone[a.zone_id].push(a)
  })

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#1E1E1E] border-b border-[#3A3A3A] flex-wrap">
        <button onClick={() => setIsEditing(!isEditing)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
            isEditing ? 'bg-[#D4AF37] text-[#1A1A1A]' : 'bg-[#2A2A2A] text-[#888] hover:text-[#F5F5DC] border border-[#3A3A3A]'
          }`}>
          <Move size={12} /> {isEditing ? 'Modifica ON' : 'Modifica'}
        </button>

        <div className="flex items-center gap-1 border border-[#3A3A3A] rounded-lg overflow-hidden">
          <button onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
            className="px-2 py-1.5 text-[#888] hover:text-[#F5F5DC] transition">
            <Minus size={12} />
          </button>
          <span className="text-[#888] text-[10px] w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            className="px-2 py-1.5 text-[#888] hover:text-[#F5F5DC] transition">
            <Plus size={12} />
          </button>
        </div>

        {isEditing && (
          <>
            <div className="h-4 w-px bg-[#3A3A3A]" />
            {selectedData && (
              <>
                <div className="flex items-center gap-1">
                  {SHAPES.map(s => (
                    <button key={s.id} onClick={() => updateSelected('shape', s.id)}
                      className={`p-1.5 rounded transition ${selectedData.shape === s.id ? 'bg-[#D4AF37] text-[#1A1A1A]' : 'text-[#555] hover:text-[#888]'}`}>
                      <s.icon size={14} />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-[#888] text-[10px]">
                  <span>W</span>
                  <input type="number" value={selectedData.width} onChange={e => updateSelected('width', parseInt(e.target.value) || 60)}
                    className="w-10 bg-[#2A2A2A] border border-[#3A3A3A] rounded px-1 py-0.5 text-[#F5F5DC] text-[10px] text-center" />
                  <span>H</span>
                  <input type="number" value={selectedData.height} onChange={e => updateSelected('height', parseInt(e.target.value) || 60)}
                    className="w-10 bg-[#2A2A2A] border border-[#3A3A3A] rounded px-1 py-0.5 text-[#F5F5DC] text-[10px] text-center" />
                  <button onClick={() => updateSelected('rotation', ((selectedData.rotation || 0) + 45) % 360)}
                    className="p-1 text-[#555] hover:text-[#D4AF37] transition">
                    <RotateCw size={12} />
                  </button>
                </div>
                <button onClick={() => { onTableDelete?.(selectedData.id); setSelectedTable(null) }}
                  className="p-1.5 text-[#555] hover:text-red-400 transition">
                  <Trash2 size={13} />
                </button>
              </>
            )}
            <button onClick={handleSavePositions} disabled={saving}
              className="ml-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50">
              <Save size={12} /> {saving ? 'Salvando...' : 'Salva pianta'}
            </button>
          </>
        )}
      </div>

      {/* Canvas SVG */}
      <div className="flex-1 overflow-hidden bg-[#111] relative"
        onWheel={handleWheel}
        onPointerDown={handleBgPointerDown}
        onPointerMove={handleBgPointerMove}
        onPointerUp={handleBgPointerUp}
        style={{ touchAction: 'none' }}>
        <svg ref={svgRef} width="100%" height="100%" style={{ cursor: panning ? 'grabbing' : 'default' }}>
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Griglia */}
            <defs>
              <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill="none" stroke="#222" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="2000" height="1500" fill="url(#grid)" />

            {/* Zone come aree colorate */}
            {zones.map(zone => (
              <g key={zone.id}>
                <rect
                  x={zone.floor_x || 0} y={zone.floor_y || 0}
                  width={zone.floor_w || 400} height={zone.floor_h || 300}
                  fill={`${zone.color || '#3B82F6'}10`}
                  stroke={zone.color || '#3B82F6'}
                  strokeWidth="1" strokeDasharray="8,4" rx="8"
                />
                <text x={(zone.floor_x || 0) + 10} y={(zone.floor_y || 0) + 18}
                  fill={zone.color || '#3B82F6'} fontSize="11" fontWeight="600" fontFamily="sans-serif" opacity="0.6">
                  {zone.name}
                  {assignmentsByZone[zone.id]?.length > 0 && (
                    ` — ${assignmentsByZone[zone.id].map(a => a.user_name).join(', ')}`
                  )}
                </text>
              </g>
            ))}

            {/* Tavoli */}
            {localTables.map(table => (
              <TableShape
                key={table.id}
                table={table}
                zone={zones.find(z => z.id === table.zone_id)}
                isSelected={selectedTable === table.id}
                onSelect={setSelectedTable}
                onDragEnd={handleDragEnd}
                isEditing={isEditing}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
