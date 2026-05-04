// Allergeni UE 14 obbligatori (Reg. CE 1169/2011)
// Lista canonica usata da MenuAdminPage (admin picker) e OrderPage (badge).
// `short` = abbreviazione 3-4 char per badge compatti.

export const ALLERGENS = [
  { id: 'glutine',      label: 'Glutine',         short: 'GLU' },
  { id: 'crostacei',    label: 'Crostacei',       short: 'CRO' },
  { id: 'uova',         label: 'Uova',            short: 'UOV' },
  { id: 'pesce',        label: 'Pesce',           short: 'PES' },
  { id: 'arachidi',     label: 'Arachidi',        short: 'ARA' },
  { id: 'soia',         label: 'Soia',            short: 'SOI' },
  { id: 'latte',        label: 'Latte',           short: 'LAT' },
  { id: 'fruttaGuscio', label: 'Frutta a guscio', short: 'F.G.' },
  { id: 'sedano',       label: 'Sedano',          short: 'SED' },
  { id: 'senape',       label: 'Senape',          short: 'SEN' },
  { id: 'sesamo',       label: 'Sesamo',          short: 'SES' },
  { id: 'solfiti',      label: 'Solfiti',         short: 'SOL' },
  { id: 'lupini',       label: 'Lupini',          short: 'LUP' },
  { id: 'molluschi',    label: 'Molluschi',       short: 'MOL' },
]

const BY_ID = Object.fromEntries(ALLERGENS.map(a => [a.id, a]))

export function getAllergen(id) {
  return BY_ID[id]
}

// Compact badges row. Renders nothing if list is empty.
// `size`: 'xs' for grid cards, 'sm' for list rows.
export function AllergenBadges({ items, size = 'xs' }) {
  if (!items || items.length === 0) return null
  const cls = size === 'sm'
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-[9px] px-1 py-0.5'
  return (
    <div className="flex flex-wrap gap-1 mt-1" aria-label="Allergeni">
      {items.map(id => {
        const a = BY_ID[id]
        if (!a) return null
        return (
          <span
            key={id}
            title={a.label}
            className={`${cls} font-bold rounded bg-amber-900/30 text-amber-300 border border-amber-700/40 leading-none`}
          >
            {a.short}
          </span>
        )
      })}
    </div>
  )
}
