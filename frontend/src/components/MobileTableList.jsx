import { motion } from 'framer-motion'
import { Users, ChefHat, ChevronRight } from 'lucide-react'

// Skin Riva Beach: free=ok(verde), occupied=gold, reserved=sea, dirty=warn, parked=park
const STATUS_CFG = {
  free:     { bg: 'bg-[var(--color-ok-soft)]',    border: 'border-[var(--color-ok)]/30',     dot: 'bg-[var(--color-ok)]',    label: 'Libero',       text: 'text-[var(--color-ok)]' },
  seated:   { bg: 'bg-[var(--color-sea-soft)]',   border: 'border-[var(--color-sea)]/40',    dot: 'bg-[var(--color-sea)]',   label: 'Accomodato',   text: 'text-[var(--color-sea)]' },
  occupied: { bg: 'bg-[var(--color-gold-soft)]',  border: 'border-[var(--color-gold-ring)]', dot: 'bg-[var(--color-gold)]',  label: 'Occupato',     text: 'text-[var(--color-gold)]' },
  reserved: { bg: 'bg-[var(--color-sea-soft)]',   border: 'border-[var(--color-sea)]/30',    dot: 'bg-[var(--color-sea)]',   label: 'Riservato',    text: 'text-[var(--color-sea)]' },
  dirty:    { bg: 'bg-[var(--color-warn-soft)]',  border: 'border-[var(--color-warn)]/30',   dot: 'bg-[var(--color-warn)]',  label: 'Pulizia',      text: 'text-[var(--color-warn)]' },
  parked:   { bg: 'bg-[var(--color-park-soft)]',  border: 'border-[var(--color-park)]/30',   dot: 'bg-[var(--color-park)]',  label: 'Parcheggiato', text: 'text-[var(--color-park)]' },
}

/**
 * MobileTableList — lista tavoli raggruppata per zona, mobile-only.
 *
 * Bug fix 2026-05-19: il picker zona di TableMapPage settava activeZone
 * MA questa lista NON lo riceveva → la lista mostrava SEMPRE tutti i tavoli
 * di tutte le zone. Su desktop il dimming via spotlightZoneId nascondeva,
 * su mobile invece restavano tutti visibili.
 *
 * Ora accetta activeZoneId: se null → tutte le zone (modalita' "Tutte"),
 * altrimenti FILTRA solo la zona selezionata.
 */
export default function MobileTableList({ tables, zones, onTableClick, activeZoneId = null }) {
  // Raggruppa per zona (preservando ordine zones[])
  const byZone = {}
  for (const z of zones) byZone[z.name] = []
  // Se activeZoneId e' set, mostra solo i tavoli di quella zona
  const visibleTables = activeZoneId
    ? tables.filter(t => t.zone_id === activeZoneId)
    : tables
  for (const t of visibleTables) {
    const zName = zones.find(z => z.id === t.zone_id)?.name || 'Altro'
    if (!byZone[zName]) byZone[zName] = []
    byZone[zName].push(t)
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      {Object.entries(byZone).map(([zoneName, zoneTables]) => {
        if (zoneTables.length === 0) return null
        const free = zoneTables.filter(t => t.status === 'free').length
        return (
          <div key={zoneName}>
            {/* Sticky header zona */}
            <div className="sticky top-0 bg-[var(--color-bg)]/95 backdrop-blur-sm px-4 py-2.5 border-b border-[var(--color-border-soft)] z-10 flex items-center justify-between">
              <span className="serif text-[var(--color-text)] text-sm font-bold tracking-tight">
                {zoneName}
              </span>
              <span className="text-[10px] text-[var(--color-text-3)] tnum">
                <span className="text-[var(--color-ok)] font-semibold">{free}</span>
                {' / '}
                {zoneTables.length}
                {' liberi'}
              </span>
            </div>

            {/* Lista tavoli */}
            <div className="px-3 py-2 space-y-2">
              {zoneTables.map(table => {
                const cfg = STATUS_CFG[table.status] || STATUS_CFG.free
                const isOccupied = table.status === 'occupied'
                return (
                  <motion.button
                    key={table.id}
                    onClick={() => onTableClick(table)}
                    whileTap={{ scale: 0.97 }}
                    className={`w-full rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex items-center gap-4 active:opacity-80 transition min-h-[80px]`}
                  >
                    {/* Numero tavolo grande */}
                    <div className="w-14 h-14 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] flex items-center justify-center shrink-0">
                      <span className="text-[var(--color-text)] font-extrabold text-lg tnum">
                        {table.table_number}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                        <span className={`text-sm font-bold ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[var(--color-text-2)] text-xs">
                        <span className="flex items-center gap-1 tnum">
                          <Users size={11} /> {table.seats} posti
                        </span>
                        {isOccupied && (
                          <span className="flex items-center gap-1 text-[var(--color-gold)] font-semibold">
                            <ChefHat size={11} /> Ordine attivo
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Freccia */}
                    <ChevronRight size={18} className="text-[var(--color-text-3)] shrink-0" />
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
