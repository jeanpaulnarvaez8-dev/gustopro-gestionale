/** KDS Simone: vede TUTTA la cucina (in piccolo) + le sue PIZZE in grande.
 *  Mostra solo gli ordini che contengono pizza (gli altri non lo riguardano). */
import KDSPage from './KDSPage'
export default function KDSPizzeriaPage() {
  return <KDSPage mode="kitchen" station="all" emphasize="pizzeria" />
}
