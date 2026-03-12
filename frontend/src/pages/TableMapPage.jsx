import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { LogOut, LayoutDashboard, ChefHat } from 'lucide-react'

export default function TableMapPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      {/* Header */}
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#8B0000] flex items-center justify-center">
            <span className="text-[#D4AF37] font-bold text-sm">G</span>
          </div>
          <span className="text-[#F5F5DC] font-semibold">GustoPro</span>
        </div>
        <div className="flex items-center gap-4">
          {(user?.role === 'kitchen' || user?.role === 'admin' || user?.role === 'manager') && (
            <button
              onClick={() => navigate('/kds')}
              className="flex items-center gap-2 text-[#888] hover:text-[#D4AF37] transition text-sm"
            >
              <ChefHat size={16} /> KDS
            </button>
          )}
          {(user?.role === 'admin' || user?.role === 'manager') && (
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-[#888] hover:text-[#D4AF37] transition text-sm"
            >
              <LayoutDashboard size={16} /> Dashboard
            </button>
          )}
          <div className="text-[#888] text-sm">
            {user?.name} · <span className="text-[#D4AF37]">{user?.role}</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-[#888] hover:text-red-400 transition text-sm"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Coming soon placeholder — settimana 2 */}
      <div className="flex-1 flex items-center justify-center flex-col gap-4">
        <div className="text-6xl">🍽️</div>
        <h2 className="text-[#F5F5DC] text-2xl font-semibold">Mappa Tavoli</h2>
        <p className="text-[#888]">In sviluppo — Settimana 2</p>
        <p className="text-[#555] text-sm">Backend pronto. Frontend in arrivo!</p>
      </div>
    </div>
  )
}
