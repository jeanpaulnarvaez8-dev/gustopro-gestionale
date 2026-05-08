import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Trophy, AlertTriangle, Clock, CheckCircle2, RefreshCw, TrendingUp } from 'lucide-react'
import { adminAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { Card, Badge } from '../components/v2'

function scoreTone(score) {
  if (score >= 90) return 'ok'
  if (score >= 70) return 'warn'
  return 'err'
}

function scoreColor(score) {
  if (score >= 90) return 'var(--color-ok)'
  if (score >= 70) return 'var(--color-warn)'
  return 'var(--color-err)'
}

function medal(index) {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}.`
}

export default function StaffPerformancePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')

  // NB: NON includere `toast` nella dep array. Anche con `toast` memoizzato
  // a monte (ToastContext adapter + Toast provider v2), eventuali rerender
  // causati da altri context (Socket, Cart) potrebbero invalidare la closure
  // → useEffect rifire → infinite loop di fetch. La closure cattura `toast`
  // attuale, e' sufficiente. Lint disabled di proposito.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminAPI.staffPerformance(period)
      setStaff(data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento performance' })
    } finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => navigate('/tables')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <Trophy size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          Performance staff
        </h1>
        <div className="ml-auto flex rounded-lg overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-surface-2)]">
          {[['today','Oggi'],['week','Settimana'],['month','Mese']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setPeriod(val)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${
                period === val
                  ? 'bg-[var(--color-gold-soft)] text-[var(--color-gold)]'
                  : 'text-[var(--color-text-2)] hover:text-[var(--color-text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento performance…</span>
          </div>
        ) : staff.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-[var(--color-text-3)]">
            <Trophy size={48} className="text-[var(--color-text-3)]/40" />
            <p className="serif text-[var(--color-text-2)] text-base font-bold">
              Nessun dato disponibile
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {staff.map((s, i) => (
              <Card key={s.id} padding="md" className="flex items-center gap-4">
                {/* Posizione / medaglia */}
                <div className="text-2xl w-10 text-center shrink-0 tnum">
                  {medal(i)}
                </div>

                {/* Info cameriere */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="serif text-[var(--color-text)] font-bold text-base tracking-tight">{s.name}</span>
                    {s.sub_role && (
                      <Badge tone="info" size="sm">{s.sub_role}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-[var(--color-text-2)] text-xs tnum">
                      <CheckCircle2 size={11} className="text-[var(--color-ok)]" />
                      {s.items_served} serviti
                    </span>
                    <span className="flex items-center gap-1 text-[var(--color-text-2)] text-xs tnum">
                      <Clock size={11} className="text-[var(--color-sea)]" />
                      {s.avg_response_min}min media
                    </span>
                    <span className="flex items-center gap-1 text-[var(--color-text-2)] text-xs tnum">
                      <AlertTriangle size={11} className="text-[var(--color-warn)]" />
                      {s.alerts_received} alert
                    </span>
                    {s.escalations > 0 && (
                      <span className="flex items-center gap-1 text-[var(--color-text-2)] text-xs tnum">
                        <TrendingUp size={11} className="text-[var(--color-err)]" />
                        {s.escalations} esc.
                      </span>
                    )}
                  </div>
                </div>

                {/* Score */}
                <div className="shrink-0 flex flex-col items-center gap-1.5">
                  <span className={`serif text-3xl font-bold tnum leading-none`} style={{ color: scoreColor(s.avg_score) }}>
                    {s.avg_score}
                  </span>
                  <div className="w-20 h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${s.avg_score}%`,
                        background: scoreColor(s.avg_score),
                      }}
                    />
                  </div>
                  <Badge tone={scoreTone(s.avg_score)} size="sm">score</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
