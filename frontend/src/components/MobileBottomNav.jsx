import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { LayoutGrid, UtensilsCrossed, ShoppingBag, ChefHat, LayoutDashboard, MapPin, LogOut, Home, CreditCard } from 'lucide-react'

const WAITER_TABS = [
  { path: '/tables', icon: LayoutGrid, label: 'Tavoli' },
  { path: '/my-tables', icon: UtensilsCrossed, label: 'Piatti' },
  { path: '/asporto', icon: ShoppingBag, label: 'Asporto' },
]

const KITCHEN_TABS = [
  { path: '/kds', icon: ChefHat, label: 'Cucina' },
]

const CASHIER_TABS = [
  { path: '/tables', icon: LayoutGrid, label: 'Tavoli' },
  { path: '/asporto', icon: ShoppingBag, label: 'Asporto' },
]

const ADMIN_TABS = [
  { path: '/admin-home', icon: Home, label: 'Home' },
  { path: '/tables', icon: LayoutGrid, label: 'Tavoli' },
  { path: '/kds', icon: ChefHat, label: 'KDS' },
  { path: '/assignments', icon: MapPin, label: 'Zone' },
]

export default function MobileBottomNav() {
  const { user, logout } = useAuth()
  const { serviceAlerts } = useSocket()
  const navigate = useNavigate()
  const location = useLocation()

  if (!user) return null

  let tabs
  if (user.role === 'kitchen') tabs = KITCHEN_TABS
  else if (user.role === 'waiter') tabs = WAITER_TABS
  else if (user.role === 'cashier') tabs = CASHIER_TABS
  else tabs = ADMIN_TABS // admin, manager

  const alertCount = serviceAlerts?.length || 0

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[90] bg-[#1A1A1A] border-t border-[#2A2A2A] safe-area-bottom md:hidden">
      <div className="flex items-center justify-around h-14">
        {tabs.map(tab => {
          const active = location.pathname === tab.path
          const Icon = tab.icon
          const showBadge = tab.path === '/my-tables' && alertCount > 0
          return (
            <button key={tab.path} onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center flex-1 h-full relative transition ${
                active ? 'text-[#D4AF37]' : 'text-[#555]'
              }`}>
              <div className="relative">
                <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-red-500 rounded-full text-white text-[8px] font-bold flex items-center justify-center">
                    {alertCount}
                  </span>
                )}
              </div>
              <span className={`text-[9px] mt-0.5 ${active ? 'font-bold' : 'font-medium'}`}>
                {tab.label}
              </span>
              {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#D4AF37] rounded-full" />}
            </button>
          )
        })}
        <button onClick={logout}
          className="flex flex-col items-center justify-center flex-1 h-full text-[#555]">
          <LogOut size={20} strokeWidth={1.5} />
          <span className="text-[9px] mt-0.5 font-medium">Esci</span>
        </button>
      </div>
    </nav>
  )
}
