import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import TableMapPage from './pages/TableMapPage'
import OrderPage from './pages/OrderPage'
import CheckoutPage from './pages/CheckoutPage'
import KDSPage from './pages/KDSPage'
import DashboardPage from './pages/DashboardPage'
import AnalyticsPage from './pages/AnalyticsPage'
import InventoryPage from './pages/InventoryPage'
import UsersPage from './pages/UsersPage'
import CustomersPage from './pages/CustomersPage'
import ReservationsPage from './pages/ReservationsPage'
import AsportoPage from './pages/AsportoPage'
import ComboAdminPage from './pages/ComboAdminPage'
import MenuAdminPage from './pages/MenuAdminPage'
import VenueAdminPage from './pages/VenueAdminPage'
import TaxReportPage from './pages/TaxReportPage'
import IngredientsPage from './pages/IngredientsPage'
import StockReconciliationPage from './pages/StockReconciliationPage'
import ZoneAssignmentPage from './pages/ZoneAssignmentPage'
import WaiterDashboardPage from './pages/WaiterDashboardPage'
import StaffPerformancePage from './pages/StaffPerformancePage'
import NotFoundPage from './pages/NotFoundPage'
import ServiceAlertBanner from './components/ServiceAlertBanner'

function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <>
      <ServiceAlertBanner />
      <Outlet />
    </>
  )
}

function RoleRoute({ roles, children }) {
  const { user } = useAuth()
  if (!roles.includes(user?.role)) return <Navigate to="/tables" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/tables" replace />} />
        <Route path="/tables" element={<TableMapPage />} />
        <Route path="/order/:tableId" element={<OrderPage />} />
        <Route path="/checkout/:orderId" element={<CheckoutPage />} />
        <Route path="/kds" element={
          <RoleRoute roles={['kitchen', 'admin', 'manager']}>
            <KDSPage />
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
        <Route path="/assignments" element={
          <RoleRoute roles={['admin', 'manager']}>
            <ZoneAssignmentPage />
          </RoleRoute>
        } />
        <Route path="/performance" element={
          <RoleRoute roles={['admin', 'manager']}>
            <StaffPerformancePage />
          </RoleRoute>
        } />
        <Route path="/staff" element={<Navigate to="/users" replace />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
