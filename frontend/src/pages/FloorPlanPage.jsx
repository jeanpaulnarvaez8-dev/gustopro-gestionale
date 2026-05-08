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
    <div className="min-h-screen flex flex-col">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 shrink-0 sticky top-0 z-20">
        <button
          onClick={() => navigate('/tables')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <Map size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Pianta locale
        </h1>
        <span className="hidden sm:inline text-[var(--color-text-3)] text-xs">
          Trascina i tavoli per posizionarli
        </span>
        <button
          onClick={load}
          className="ml-auto text-[var(--color-text-2)] hover:text-[var(--color-gold)] transition p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)]"
          aria-label="Ricarica"
        >
          <RefreshCw size={14} />
        </button>
      </header>

      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-64 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento pianta…</span>
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
