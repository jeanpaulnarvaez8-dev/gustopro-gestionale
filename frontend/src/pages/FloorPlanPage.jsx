import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Map, RefreshCw } from 'lucide-react'
import FloorPlanEditor from '../components/FloorPlanEditor'
import { tablesAPI, zonesAPI, assignmentsAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

export default function FloorPlanPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [tables, setTables] = useState([])
  const [zones, setZones] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [tRes, zRes, aRes] = await Promise.all([
        tablesAPI.list(),
        zonesAPI.list(),
        assignmentsAPI.list().catch(() => ({ data: [] })),
      ])
      setTables(tRes.data)
      setZones(zRes.data)
      setAssignments(aRes.data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id) => {
    try {
      await tablesAPI.remove(id)
      toast({ type: 'success', title: 'Tavolo eliminato' })
      load()
    } catch (err) {
      toast({ type: 'error', title: err.response?.data?.error || 'Errore eliminazione' })
    }
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4 shrink-0">
        <button onClick={() => navigate('/tables')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <Map size={18} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Pianta Locale</span>
        <span className="text-[#555] text-xs">Trascina i tavoli per posizionarli</span>
        <button onClick={load} className="ml-auto text-[#555] hover:text-[#888] transition">
          <RefreshCw size={14} />
        </button>
      </header>

      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={18} className="animate-spin text-[#555]" />
          </div>
        ) : (
          <FloorPlanEditor
            tables={tables}
            zones={zones}
            assignments={assignments}
            onTableUpdate={load}
            onTableDelete={handleDelete}
          />
        )}
      </div>
    </div>
  )
}
