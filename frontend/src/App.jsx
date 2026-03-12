import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import TableMapPage from './pages/TableMapPage'
import OrderPage from './pages/OrderPage'
import CheckoutPage from './pages/CheckoutPage'
import KDSPage from './pages/KDSPage'
import DashboardPage from './pages/DashboardPage'
import InventoryPage from './pages/InventoryPage'
import NotFoundPage from './pages/NotFoundPage'

function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
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
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
