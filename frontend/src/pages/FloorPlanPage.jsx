import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Map, RefreshCw } from 'lucide-react'
import FloorPlanEditor from '../components/FloorPlanEditor'
import { tablesAPI, zonesAPI, assignmentsAPI } from '../lib/api'
import { useToast, Button, StatusDot } from '../components/v2'

/**
 * FloorPlanPage — editor pianta locale (drag & drop tavoli).
 * Migrato a v2: useToast nativo, header Riva, fallback loading consistente.
 */
export default function FloorPlanPage() {
  const navigate = useNavigate()
  const toast = useToast()
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
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Errore caricamento pianta')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id) => {
    try {
      await tablesAPI.remove(id)
      toast.success('Tavolo eliminato')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore eliminazione')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 shrink-0 sticky top-0 z-20">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/tables')}
          aria-label="Indietro"
          className="!p-2 !min-h-0 !rounded-lg"
        >
          <ArrowLeft size={18} />
        </Button>
        <Map size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Pianta locale
        </h1>
        <span className="hidden sm:inline text-[var(--color-text-3)] text-xs">
          Trascina i tavoli per posizionarli
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={load}
          aria-label="Ricarica"
          className="ml-auto !p-2 !min-h-0 !rounded-lg"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-[var(--color-gold)]' : ''} />
        </Button>
      </header>

      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-64 gap-3 text-[var(--color-text-2)]">
            <StatusDot tone="gold" size="lg" pulse />
            <span className="text-sm serif italic">Caricamento pianta…</span>
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
