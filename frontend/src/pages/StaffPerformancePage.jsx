import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Trophy, AlertTriangle, Clock, CheckCircle2, RefreshCw, TrendingUp } from 'lucide-react'
import { adminAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'

function scoreColor(score) {
  if (score >= 90) return 'text-emerald-400'
  if (score >= 70) return 'text-amber-400'
  return 'text-red-400'
}

function scoreBg(score) {
  if (score >= 90) return 'bg-emerald-500'
  if (score >= 70) return 'bg-amber-500'
  return 'bg-red-500'
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminAPI.staffPerformance(period)
      setStaff(data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento performance' })
    } finally { setLoading(false) }
  }, [period, toast])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col">
      <header className="bg-[#2A2A2A] border-b border-[#3A3A3A] px-5 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/tables')} className="text-[#888] hover:text-[#F5F5DC] transition">
          <ArrowLeft size={18} />
        </button>
        <Trophy size={18} className="text-[#D4AF37]" />
        <span className="text-[#F5F5DC] font-bold">Performance Staff</span>
        <div className="ml-auto flex rounded-lg overflow-hidden border border-[#3A3A3A]">
          {[['today','Oggi'],['week','Settimana'],['month','Mese']].map(([val, label]) => (
            <button key={val} onClick={() => setPeriod(val)}
              className={`px-3 py-1.5 text-xs transition ${
                period === val ? 'bg-[#3A3A3A] text-[#F5F5DC]' : 'text-[#555] hover:text-[#888]'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw size={18} className="animate-spin text-[#555]" />
          </div>
        ) : staff.length === 0 ? (
          <p className="text-[#555] text-center py-12">Nessun dato disponibile</p>
        ) : (
          <div className="space-y-3">
            {staff.map((s, i) => (
              <div key={s.id}
                className="bg-[#222] border border-[#3A3A3A] rounded-xl p-4 flex items-center gap-4">
                {/* Posizione */}
                <div className="text-xl w-8 text-center shrink-0">
                  {medal(i)}
                </div>

                {/* Info cameriere */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[#F5F5DC] font-semibold text-sm">{s.name}</span>
                    {s.sub_role && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-cyan-900/20 text-cyan-400 border border-cyan-500/30">
                        {s.sub_role}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className="flex items-center gap-1 text-[#888] text-xs">
                      <CheckCircle2 size={11} className="text-emerald-400" />
                      {s.items_served} serviti
                    </span>
                    <span className="flex items-center gap-1 text-[#888] text-xs">
                      <Clock size={11} className="text-blue-400" />
                      {s.avg_response_min}min media
                    </span>
                    <span className="flex items-center gap-1 text-[#888] text-xs">
                      <AlertTriangle size={11} className="text-amber-400" />
                      {s.alerts_received} alert
                    </span>
                    {s.escalations > 0 && (
                      <span className="flex items-center gap-1 text-[#888] text-xs">
                        <TrendingUp size={11} className="text-red-400" />
                        {s.escalations} esc.
                      </span>
                    )}
                  </div>
                </div>

                {/* Score */}
                <div className="shrink-0 flex flex-col items-center gap-1">
                  <span className={`text-2xl font-bold ${scoreColor(s.avg_score)}`}>
                    {s.avg_score}
                  </span>
                  <div className="w-16 h-1.5 rounded-full bg-[#3A3A3A] overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${scoreBg(s.avg_score)}`}
                      style={{ width: `${s.avg_score}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
