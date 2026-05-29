import { motion } from 'framer-motion'
import { ChefHat, Clock } from 'lucide-react'

/**
 * TableGridView — vista TAVOLI stile CALENDARIO.
 *
 * JP 2026-05-27: vuole vedere tutti i tavoli come le celle di un calendario
 * (griglia pulita con linee sottili, numero nell'angolo, stato come pill
 * colorato). Si sposa perfettamente con la numerazione 1-70 in 7 file da 10.
 *
 * Look: container con sfondo = colore bordo + celle con gap-px → le "linee"
 * della griglia appaiono come in un calendario macOS. Numero in alto a destra
 * (come la data), stato come barra/pill colorato (come gli eventi).
 */

// Colori stato (allineati a MobileTableList). hasWaiting vince su tutto.
// `border` + `bg` rendono ogni cella un quadrato ben definito (richiesta JP
// 2026-05-27: sul tablet i quadrati si vedevano poco → bordo colorato spesso
// + sfondo tinto per stato).
const STATUS_CFG = {
  free:     { strip: 'bg-[var(--color-ok)]',    chip: 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]',     border: 'border-[var(--color-ok)]/60',        bg: 'bg-[var(--color-ok-soft)]/30',   label: 'LIBERO' },
  seated:   { strip: 'bg-[var(--color-sea)]',   chip: 'bg-[var(--color-sea-soft)] text-[var(--color-sea)]',   border: 'border-[var(--color-sea)]/70',       bg: 'bg-[var(--color-sea-soft)]/40',  label: 'ACCOMODATO' },
  occupied: { strip: 'bg-[var(--color-gold)]',  chip: 'bg-[var(--color-gold-soft)] text-[var(--color-gold)]', border: 'border-[var(--color-gold-ring)]',    bg: 'bg-[var(--color-gold-soft)]/40', label: 'OCCUPATO' },
  reserved: { strip: 'bg-[var(--color-sea)]',   chip: 'bg-[var(--color-sea-soft)] text-[var(--color-sea)]',   border: 'border-[var(--color-sea)]/50',       bg: 'bg-[var(--color-sea-soft)]/30',  label: 'RISERVATO' },
  dirty:    { strip: 'bg-[var(--color-warn)]',  chip: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]', border: 'border-[var(--color-warn)]/70',      bg: 'bg-[var(--color-warn-soft)]/40', label: 'DA PULIRE' },
  parked:   { strip: 'bg-[var(--color-park)]',  chip: 'bg-[var(--color-park-soft)] text-[var(--color-park)]', border: 'border-[var(--color-park)]/60',      bg: 'bg-[var(--color-park-soft)]/30', label: 'IN PAUSA' },
}
const WAITING_CFG = { strip: 'bg-pink-500', chip: 'bg-[rgba(244,114,182,0.18)] text-pink-300', border: 'border-pink-400', bg: 'bg-[rgba(244,114,182,0.15)]', label: 'IN ATTESA' }

function elapsedMin(since) {
  if (!since) return null
  const m = Math.floor((Date.now() - new Date(since).getTime()) / 60000)
  return m >= 0 ? m : null
}

export default function TableGridView({ tables, zones, onTableClick, activeZoneId = null }) {
  // Raggruppa per zona (mantiene il senso operativo dei settori).
  const byZone = {}
  for (const z of zones) byZone[z.name] = []
  const visible = activeZoneId ? tables.filter(t => t.zone_id === activeZoneId) : tables
  for (const t of visible) {
    const zName = zones.find(z => z.id === t.zone_id)?.name || 'Altro'
    if (!byZone[zName]) byZone[zName] = []
    byZone[zName].push(t)
  }
  for (const k of Object.keys(byZone)) {
    byZone[k].sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), 'it', { numeric: true }))
  }

  return (
    <div className="flex-1 overflow-y-auto pb-6">
      {Object.entries(byZone).map(([zoneName, zoneTables]) => {
        if (zoneTables.length === 0) return null
        const free = zoneTables.filter(t => t.status === 'free').length
        return (
          <div key={zoneName} className="mb-3">
            {/* Header zona sticky */}
            <div className="sticky top-0 bg-[var(--color-canvas)]/95 backdrop-blur-sm px-4 py-2 border-b border-[var(--color-border-soft)] z-10 flex items-center justify-between">
              <span className="serif text-[var(--color-text)] text-base font-bold tracking-tight">{zoneName}</span>
              <span className="text-[11px] text-[var(--color-text-3)] tnum">
                <span className="text-[var(--color-ok)] font-semibold">{free}</span> liberi / {zoneTables.length}
              </span>
            </div>

            {/* Griglia calendario: quadrati definiti con bordo colorato per
                stato (gap + padding invece di hairline → si vedono meglio). */}
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 xl:grid-cols-10 gap-2 p-2">
              {zoneTables.map(table => {
                const hasWaiting = Number(table.waiting_items_count) > 0
                const cfg = hasWaiting ? WAITING_CFG : (STATUS_CFG[table.status] || STATUS_CFG.free)
                const busy = table.status === 'occupied' || table.status === 'seated'
                const mins = busy ? elapsedMin(table.order_opened_at || table.seated_at || table.status_changed_at) : null
                const waiterFirst = table.active_waiter_name ? String(table.active_waiter_name).split(' ')[0] : null
                return (
                  <motion.button
                    key={table.id}
                    onClick={() => onTableClick(table)}
                    whileTap={{ scale: 0.96 }}
                    className={`relative min-h-[92px] p-1.5 flex flex-col text-left rounded-xl border-2 ${cfg.border} ${cfg.bg} ${hasWaiting ? 'shadow-[0_0_0_2px_rgba(244,114,182,0.35)]' : 'shadow-sm'} active:opacity-80 transition hover:brightness-110`}
                  >
                    {/* Barra stato in alto (come "evento" del calendario) */}
                    <span className={`h-1.5 w-full rounded-full ${cfg.strip} ${hasWaiting ? 'animate-pulse' : ''}`} />

                    {/* Numero tavolo in alto a destra (come la data) */}
                    <span className="absolute top-2.5 right-2 text-[var(--color-text)] font-extrabold text-lg leading-none tnum">
                      {table.table_number}
                    </span>

                    {/* Stato come chip */}
                    <span className={`mt-1.5 inline-block self-start px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide ${cfg.chip}`}>
                      {cfg.label}
                    </span>

                    {/* Info servizio: cameriere · piatti · tempo */}
                    <div className="mt-auto space-y-0.5 pt-1">
                      {waiterFirst && (
                        <div className="flex items-center gap-1 text-[var(--color-text-2)] text-[10px] truncate">
                          <ChefHat size={9} className="text-[var(--color-gold)] shrink-0" />
                          <span className="truncate font-semibold">{waiterFirst}</span>
                          {table.active_items_count > 0 && (
                            <span className="text-[var(--color-gold)] tnum shrink-0">·{table.active_items_count}</span>
                          )}
                        </div>
                      )}
                      {mins !== null && (
                        <div className="flex items-center gap-1 text-[var(--color-text-3)] text-[9px] tnum">
                          <Clock size={8} /> {mins >= 60 ? `${Math.floor(mins/60)}h${mins%60}` : `${mins}min`}
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
