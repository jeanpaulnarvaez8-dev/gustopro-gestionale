import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

// Eager: pagine critiche al first paint (login deve essere istantaneo).
import LoginPage from './pages/LoginPage'

// Lazy: code-split per route. Riduce bundle iniziale 712KB → ~200KB.
// Ogni page diventa un chunk separato, scaricato on-demand al navigate.
const TableMapPage           = lazy(() => import('./pages/TableMapPage'))
const OrderPage              = lazy(() => import('./pages/OrderPage'))
const CheckoutPage           = lazy(() => import('./pages/CheckoutPage'))
const KDSPage                = lazy(() => import('./pages/KDSPage'))
const KDSPizzeriaPage        = lazy(() => import('./pages/KDSPizzeriaPage'))
const KDSCrudiPage           = lazy(() => import('./pages/KDSCrudiPage'))
const KDSPasticceriaPage     = lazy(() => import('./pages/KDSPasticceriaPage'))
const KDSHistoryPage         = lazy(() => import('./pages/KDSHistoryPage'))
const BarPage                = lazy(() => import('./pages/BarPage'))
const DashboardPage          = lazy(() => import('./pages/DashboardPage'))
const AnalyticsPage          = lazy(() => import('./pages/AnalyticsPage'))
const InventoryPage          = lazy(() => import('./pages/InventoryPage'))
const UsersPage              = lazy(() => import('./pages/UsersPage'))
const CustomersPage          = lazy(() => import('./pages/CustomersPage'))
const ReservationsPage       = lazy(() => import('./pages/ReservationsPage'))
const AsportoPage            = lazy(() => import('./pages/AsportoPage'))
const ComboAdminPage         = lazy(() => import('./pages/ComboAdminPage'))
const MenuAdminPage          = lazy(() => import('./pages/MenuAdminPage'))
const VenueAdminPage         = lazy(() => import('./pages/VenueAdminPage'))
const TableQRCodesPage       = lazy(() => import('./pages/TableQRCodesPage'))
const AuditReportPage        = lazy(() => import('./pages/AuditReportPage'))
const DayClosePage           = lazy(() => import('./pages/DayClosePage'))
const TaxReportPage          = lazy(() => import('./pages/TaxReportPage'))
const IngredientsPage        = lazy(() => import('./pages/IngredientsPage'))
const StockReconciliationPage= lazy(() => import('./pages/StockReconciliationPage'))
const ZoneAssignmentPage     = lazy(() => import('./pages/ZoneAssignmentPage'))
const WaiterDashboardPage    = lazy(() => import('./pages/WaiterDashboardPage'))
const StaffPerformancePage   = lazy(() => import('./pages/StaffPerformancePage'))
const FloorPlanPage          = lazy(() => import('./pages/FloorPlanPage'))
const AdminHomePage          = lazy(() => import('./pages/AdminHomePage'))
const WaitingMonitorPage     = lazy(() => import('./pages/WaitingMonitorPage'))
const NotFoundPage           = lazy(() => import('./pages/NotFoundPage'))
const SuperadminPage         = lazy(() => import('./pages/SuperadminPage'))
const DesignSystemPage       = lazy(() => import('./pages/DesignSystemPage'))

// Componenti UI eager (sempre montati nelle route protette).
import ServiceAlertBanner from './components/ServiceAlertBanner'
import InstallPrompt from './components/InstallPrompt'
import NotificationsPrompt from './components/NotificationsPrompt'
import BarPersistentFAB from './components/BarPersistentFAB'
import MobileBottomNav from './components/MobileBottomNav'
import MandatoryAlertModal from './components/MandatoryAlertModal'
import DirectDeliveredAlerts from './components/DirectDeliveredAlerts'
import OfflineBanner from './components/OfflineBanner'
import PWAUpdateBanner from './components/PWAUpdateBanner'
import SocketStatusBanner from './components/SocketStatusBanner'
import { StatusDot } from './components/v2'
// NB: <ToastProvider> sta in main.jsx (sopra SocketProvider che lo usa).

// ─── Loading fallback per route lazy ──────────────────────────────────
// Centrato, palette Riva, animato. Visibile mentre il chunk del route
// viene scaricato (~50-200ms su 4G dopo first-load, ~0ms da cache).
function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] gap-3">
      <StatusDot tone="gold" size="lg" pulse />
      <span className="serif italic text-[var(--color-text-2)] text-lg">
        Caricamento…
      </span>
    </div>
  )
}

function ProtectedRoute() {
  const { isAuthenticated, user } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <>
      <ServiceAlertBanner />
      {/* Alert obbligatorio per camerieri: scelta libera/rinvia */}
      {user?.role === 'waiter' && <MandatoryAlertModal />}
      {/* Alert admin per voci consegnate senza passare da cucina */}
      {['admin', 'manager'].includes(user?.role) && <DirectDeliveredAlerts />}
      <div className="pb-14 md:pb-0">
        <Outlet />
      </div>
      <MobileBottomNav />
      {/* PWA: prompt installazione (Chrome/Edge nativo, iOS istruzioni manuali) */}
      <InstallPrompt />
      {/* Push: prompt attivazione notifiche dopo login (idempotent) */}
      <NotificationsPrompt />
      {/* FAB bartender: contatore cocktail pending visibile anywhere tranne /bar */}
      <BarPersistentFAB />
    </>
  )
}

function RoleRoute({ roles, children }) {
  const { user } = useAuth()
  if (!roles.includes(user?.role)) return <Navigate to="/tables" replace />
  return children
}

function QRTableRedirect() {
  // Landing per scan QR cavalieri tavoli: redirect basato sul ruolo.
  // Se non autenticato → ProtectedRoute fa /login (e il return-url resta /t/:id).
  const { tableId } = useParams()
  const { user } = useAuth()
  if (!tableId) return <Navigate to="/" replace />
  if (user?.role === 'cashier') return <Navigate to={`/tables`} replace />
  return <Navigate to={`/order/${tableId}`} replace />
}

function HomeRedirect() {
  const { user } = useAuth()
  if (user?.role === 'kitchen') {
    // Kitchen con sub_role specifico → atterra sul KDS della propria stazione
    if (user?.sub_role === 'pizzeria')    return <Navigate to="/kds/pizzeria" replace />
    if (user?.sub_role === 'pasticceria') return <Navigate to="/kds/pasticceria" replace />
    // chef / aiuto cucina / nessuno → KDS cucina principale (default)
    return <Navigate to="/kds" replace />
  }
  if (['admin', 'manager'].includes(user?.role)) return <Navigate to="/admin-home" replace />
  // Waiter al bar: landing diretto sulla coda bar invece di /tables.
  if (user?.role === 'waiter' && (user?.sub_role === 'bar' || user?.sub_role === 'bar/caffetteria')) {
    return <Navigate to="/bar" replace />
  }
  return <Navigate to="/tables" replace />
}

export default function App() {
  return (
    <>
      <OfflineBanner />
      <SocketStatusBanner />
      <PWAUpdateBanner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Super-admin (server-to-server, X-Superadmin-Key header).
              Pubblica perche' non usa il JWT del normale login: e' protetta lato
              backend dal middleware requireSuperadmin che verifica la key. */}
          <Route path="/admin-saas" element={<SuperadminPage />} />

          {/* Showcase del nuovo design system v2 — accessibile senza login per
              test visivo dei primitivi (Button/Card/Badge/Input/Modal/...). */}
          <Route path="/design-system" element={<DesignSystemPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/tables" element={<TableMapPage />} />
            <Route path="/order/:tableId" element={<OrderPage />} />
            <Route path="/checkout/:orderId" element={<CheckoutPage />} />
            <Route path="/kds" element={
              <RoleRoute roles={['kitchen', 'admin', 'manager']}>
                <KDSPage />
              </RoleRoute>
            } />
            <Route path="/kds/pizzeria" element={
              <RoleRoute roles={['kitchen', 'admin', 'manager']}>
                <KDSPizzeriaPage />
              </RoleRoute>
            } />
            <Route path="/kds/crudi" element={
              <RoleRoute roles={['kitchen', 'admin', 'manager']}>
                <KDSCrudiPage />
              </RoleRoute>
            } />
            <Route path="/kds/pasticceria" element={
              <RoleRoute roles={['kitchen', 'admin', 'manager']}>
                <KDSPasticceriaPage />
              </RoleRoute>
            } />
            <Route path="/kds/history" element={
              <RoleRoute roles={['kitchen', 'waiter', 'admin', 'manager']}>
                <KDSHistoryPage />
              </RoleRoute>
            } />
            <Route path="/bar" element={
              <RoleRoute roles={['waiter', 'admin', 'manager']}>
                <BarPage />
              </RoleRoute>
            } />
            <Route path="/dashboard" element={
              <RoleRoute roles={['admin', 'manager']}>
                <DashboardPage />
              </RoleRoute>
            } />
            <Route path="/inventory" element={
              <RoleRoute roles={['admin', 'manager']}>
                <InventoryPage />
              </RoleRoute>
            } />
            <Route path="/users" element={
              <RoleRoute roles={['admin']}>
                <UsersPage />
              </RoleRoute>
            } />
            <Route path="/analytics" element={
              <RoleRoute roles={['admin', 'manager']}>
                <AnalyticsPage />
              </RoleRoute>
            } />
            <Route path="/customers" element={
              <RoleRoute roles={['admin', 'manager']}>
                <CustomersPage />
              </RoleRoute>
            } />
            <Route path="/reservations" element={<ReservationsPage />} />
            <Route path="/asporto" element={<AsportoPage />} />
            <Route path="/combos" element={
              <RoleRoute roles={['admin', 'manager']}>
                <ComboAdminPage />
              </RoleRoute>
            } />
            <Route path="/menu-admin" element={
              <RoleRoute roles={['admin', 'manager']}>
                <MenuAdminPage />
              </RoleRoute>
            } />
            <Route path="/venue" element={
              <RoleRoute roles={['admin']}>
                <VenueAdminPage />
              </RoleRoute>
            } />
            <Route path="/qr-codes" element={
              <RoleRoute roles={['admin', 'manager']}>
                <TableQRCodesPage />
              </RoleRoute>
            } />
            <Route path="/audit-report" element={
              <RoleRoute roles={['admin', 'manager']}>
                <AuditReportPage />
              </RoleRoute>
            } />
            <Route path="/day-close" element={
              <RoleRoute roles={['cashier','admin', 'manager']}>
                <DayClosePage />
              </RoleRoute>
            } />
            {/* /t/:tableId — landing scan QR cavalieri tavolo. Redirect a
                /order/:tableId per il waiter, /checkout per la cassa. */}
            <Route path="/t/:tableId" element={<QRTableRedirect />} />
            <Route path="/tax-report" element={
              <RoleRoute roles={['admin']}>
                <TaxReportPage />
              </RoleRoute>
            } />
            <Route path="/ingredients" element={
              <RoleRoute roles={['admin', 'manager']}>
                <IngredientsPage />
              </RoleRoute>
            } />
            <Route path="/stock-reconciliation" element={
              <RoleRoute roles={['admin', 'manager']}>
                <StockReconciliationPage />
              </RoleRoute>
            } />
            <Route path="/my-tables" element={<WaiterDashboardPage />} />
            <Route path="/admin-home" element={
              <RoleRoute roles={['admin', 'manager']}>
                <AdminHomePage />
              </RoleRoute>
            } />
            <Route path="/assignments" element={
              <RoleRoute roles={['admin', 'manager']}>
                <ZoneAssignmentPage />
              </RoleRoute>
            } />
            <Route path="/floor-plan" element={
              <RoleRoute roles={['admin', 'manager']}>
                <FloorPlanPage />
              </RoleRoute>
            } />
            <Route path="/performance" element={
              <RoleRoute roles={['admin', 'manager']}>
                <StaffPerformancePage />
              </RoleRoute>
            } />
            <Route path="/waiting-monitor" element={
              <RoleRoute roles={['kitchen', 'admin', 'manager']}>
                <WaitingMonitorPage />
              </RoleRoute>
            } />
            <Route path="/staff" element={<Navigate to="/users" replace />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  )
}
