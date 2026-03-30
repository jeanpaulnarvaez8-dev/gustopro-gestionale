import { motion } from 'framer-motion'
import { Users, Clock, ChefHat, Check } from 'lucide-react'

const STATUS_CFG = {
  free:     { bg: 'bg-emerald-900/20', border: 'border-emerald-500/30', dot: 'bg-emerald-400', label: 'Libero', text: 'text-emerald-400' },
  occupied: { bg: 'bg-red-900/20', border: 'border-red-500/30', dot: 'bg-red-400', label: 'Occupato', text: 'text-red-400' },
  reserved: { bg: 'bg-blue-900/20', border: 'border-blue-500/30', dot: 'bg-blue-400', label: 'Riservato', text: 'text-blue-400' },
  dirty:    { bg: 'bg-yellow-900/20', border: 'border-yellow-500/30', dot: 'bg-yellow-400', label: 'Pulizia', text: 'text-yellow-400' },
  parked:   { bg: 'bg-purple-900/20', border: 'border-purple-500/30', dot: 'bg-purple-400', label: 'Parcheggiato', text: 'text-purple-400' },
}

export default function MobileTableList({ tables, zones, onTableClick }) {
  // Raggruppa per zona
  const byZone = {}
  for (const t of tables) {
    const zName = zones.find(z => z.id === t.zone_id)?.name || 'Altro'
    if (!byZone[zName]) byZone[zName] = []
    byZone[zName].push(t)
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      {Object.entries(byZone).map(([zoneName, zoneTables]) => (
        <div key={zoneName}>
          <div className="sticky top-0 bg-[#1A1A1A] px-4 py-2 border-b border-[#2A2A2A] z-10">
            <span className="text-[#888] text-xs font-semibold uppercase tracking-wider">{zoneName}</span>
            <span className="text-[#555] text-[10px] ml-2">
              {zoneTables.filter(t => t.status === 'free').length} liberi / {zoneTables.length}
            </span>
          </div>
          <div className="px-3 py-2 space-y-2">
            {zoneTables.map(table => {
              const cfg = STATUS_CFG[table.status] || STATUS_CFG.free
              return (
                <motion.button key={table.id}
                  onClick={() => onTableClick(table)}
                  whileTap={{ scale: 0.97 }}
                  className={`w-full rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex items-center gap-4 active:opacity-80 transition`}>
                  {/* Numero tavolo grande */}
                  <div className="w-14 h-14 rounded-xl bg-[#1A1A1A] border border-[#333] flex items-center justify-center shrink-0">
                    <span className="text-[#F5F5DC] font-bold text-lg">{table.table_number}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                      <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[#888] text-xs">
                      <span className="flex items-center gap-1"><Users size={11} /> {table.seats}p</span>
                      {table.status === 'occupied' && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <ChefHat size={11} /> Ordine attivo
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Freccia */}
                  <svg width="20" height="20" viewBox="0 0 20 20" className="text-[#555] shrink-0">
                    <path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </motion.button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
