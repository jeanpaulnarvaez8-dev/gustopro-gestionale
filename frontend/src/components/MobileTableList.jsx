import { motion } from 'framer-motion'
import { Users, ChefHat, Clock } from 'lucide-react'

// Skin Riva Beach: free=verde, seated=blu, occupied=gold, dirty=giallo, ecc.
const STATUS_CFG = {
  free:     { bg: 'bg-[var(--color-ok-soft)]',    border: 'border-[var(--color-ok)]/40',     dot: 'bg-[var(--color-ok)]',    label: 'LIBERO',       text: 'text-[var(--color-ok)]' },
  seated:   { bg: 'bg-[var(--color-sea-soft)]',   border: 'border-[var(--color-sea)]/50',    dot: 'bg-[var(--color-sea)]',   label: 'ACCOMODATO',   text: 'text-[var(--color-sea)]' },
  occupied: { bg: 'bg-[var(--color-gold-soft)]',  border: 'border-[var(--color-gold-ring)]', dot: 'bg-[var(--color-gold)]',  label: 'OCCUPATO',     text: 'text-[var(--color-gold)]' },
  reserved: { bg: 'bg-[var(--color-sea-soft)]',   border: 'border-[var(--color-sea)]/30',    dot: 'bg-[var(--color-sea)]',   label: 'RISERVATO',    text: 'text-[var(--color-sea)]' },
  dirty:    { bg: 'bg-[var(--color-warn-soft)]',  border: 'border-[var(--color-warn)]/40',   dot: 'bg-[var(--color-warn)]',  label: 'DA PULIRE',    text: 'text-[var(--color-warn)]' },
  parked:   { bg: 'bg-[var(--color-park-soft)]',  border: 'border-[var(--color-park)]/30',   dot: 'bg-[var(--color-park)]',  label: 'IN PAUSA',     text: 'text-[var(--color-park)]' },
}

function elapsedMin(since) {
  if (!since) return null
  const m = Math.floor((Date.now() - new Date(since).getTime()) / 60000)
  return m >= 0 ? m : null
}

/**
 * MobileTableList — LISTA tavoli numerata, responsive (telefono + tablet +
 * desktop). Sostituisce la pianta SVG nella vista operativa /tables: i
 * camerieri vogliono una lista chiara, non la planimetria.
 *
 * - Griglia: 1 colonna telefono, 2 tablet, 3-4 desktop
 * - Raggruppata per zona con header sticky
 * - Tavolo occupato/accomodato mostra: cameriere, n° items, minuti
 * - activeZoneId filtra (null = tutte le zone)
 */
export default function MobileTableList({ tables, zones, onTableClick, activeZoneId = null }) {
  const byZone = {}
  for (const z of zones) byZone[z.name] = []
  const visible = activeZoneId ? tables.filter(t => t.zone_id === activeZoneId) : tables
  for (const t of visible) {
    const zName = zones.find(z => z.id === t.zone_id)?.name || 'Altro'
    if (!byZone[zName]) byZone[zName] = []
    byZone[zName].push(t)
  }
  // Ordina i tavoli per numero (numerico) dentro ogni zona
  for (const k of Object.keys(byZone)) {
    byZone[k].sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), 'it', { numeric: true }))
  }

  return (
    <div className="flex-1 overflow-y-auto pb-6">
      {Object.entries(byZone).map(([zoneName, zoneTables]) => {
        if (zoneTables.length === 0) return null
        const free = zoneTables.filter(t => t.status === 'free').length
        return (
          <div key={zoneName}>
            {/* Header zona sticky */}
            <div className="sticky top-0 bg-[var(--color-canvas)]/95 backdrop-blur-sm px-4 py-2.5 border-b border-[var(--color-border-soft)] z-10 flex items-center justify-between">
              <span className="serif text-[var(--color-text)] text-base font-bold tracking-tight">{zoneName}</span>
              <span className="text-[11px] text-[var(--color-text-3)] tnum">
                <span className="text-[var(--color-ok)] font-semibold">{free}</span> liberi / {zoneTables.length}
              </span>
            </div>

            {/* Griglia responsive di card tavolo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 px-3 py-3">
              {zoneTables.map(table => {
                const cfg = STATUS_CFG[table.status] || STATUS_CFG.free
                const busy = table.status === 'occupied' || table.status === 'seated'
                const mins = busy ? elapsedMin(table.order_opened_at || table.seated_at || table.status_changed_at) : null
                return (
                  <motion.button
                    key={table.id}
                    onClick={() => onTableClick(table)}
                    whileTap={{ scale: 0.96 }}
                    className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-3 flex items-center gap-3 active:opacity-80 transition min-h-[76px] text-left`}
                  >
                    {/* Numero GRANDE */}
                    <div className="w-16 h-16 rounded-xl bg-[var(--color-surface)] border-2 border-[var(--color-border-strong)] flex flex-col items-center justify-center shrink-0">
                      <span className="text-[var(--color-text)] font-extrabold text-2xl leading-none tnum">{table.table_number}</span>
                      <span className="text-[9px] text-[var(--color-text-3)] tnum mt-0.5">{table.seats}p</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                        <span className={`text-xs font-bold tracking-wide ${cfg.text}`}>{cfg.label}</span>
                      </div>
                      {busy && (
                        <div className="mt-1.5 space-y-0.5">
                          {table.active_waiter_name && (
                            <div className="flex items-center gap-1 text-[var(--color-text-2)] text-xs">
                              <ChefHat size={11} className="text-[var(--color-gold)]" />
                              <span className="truncate font-semibold">{String(table.active_waiter_name).split(' ')[0]}</span>
                              {table.active_items_count > 0 && (
                                <span className="text-[var(--color-gold)] tnum">· {table.active_items_count} pt</span>
                              )}
                            </div>
                          )}
                          {mins !== null && (
                            <div className="flex items-center gap-1 text-[var(--color-text-3)] text-[11px] tnum">
                              <Clock size={10} /> {mins >= 60 ? `${Math.floor(mins/60)}h${mins%60}` : `${mins}min`}
                            </div>
                          )}
                        </div>
                      )}
                      {table.status === 'free' && (
                        <div className="mt-1.5 flex items-center gap-1 text-[var(--color-text-3)] text-xs">
                          <Users size={11} /> tocca per accomodare
                        </div>
                      )}
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
