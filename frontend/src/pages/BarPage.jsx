/**
 * BarPage — coda comande BAR (solo item con category.is_beverage = true).
 *
 * Riusa KDSPage in modalita' "bar":
 *   - data source: barAPI (filtra is_beverage=true)
 *   - accessibile a waiter (bar/caffetteria), manager, admin
 *   - header titolo "Bar" invece di "KDS Cucina"
 *   - niente waiting-monitor / crossmatches (concetti kitchen-only)
 *
 * Tutta la UI restante (cards, status pending→cooking→ready, socket events,
 * audio beep, layout) e' identica al KDS — quindi zero duplicazione.
 */
import KDSPage from './KDSPage'

export default function BarPage() {
  return <KDSPage mode="bar" />
}
