import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldAlert, RefreshCw, Wallet, UserCheck, AlertTriangle } from 'lucide-react'
import { adminAPI } from '../lib/api'
import { Card, Badge } from '../components/v2'
import { formatPrice } from '../lib/utils'

/**
 * AuditReportPage — report scostamenti settimanali (cancellazioni,
 * trasferimenti codice 32, sconti) + incassi per cassa.
 *
 * Permette al maitre di verificare accountability prima delle riunioni
 * team settimanali. Filtrabile per periodo.
 */
function fmtDate(s) {
  if (!s) return ''
  return new Date(s).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const ACTION_LABELS = {
  item_delete:  { label: 'Voce cancellata', tone: 'err' },
  transfer:     { label: 'Codice 32 (delega)', tone: 'warn' },
  order_cancel: { label: 'Ordine annullato', tone: 'err' },
  item_update:  { label: 'Voce modificata', tone: 'warn' },
}

export default function AuditReportPage() {
  const navigate = useNavigate()
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(weekAgo)
  const [to, setTo] = useState(today)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const { data } = await adminAPI.auditReport(from, to)
      setData(data)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-line */ }, [from, to])

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 sticky top-0 z-20 flex-wrap">
        <button onClick={() => navigate(-1)} className="text-[var(--color-text-2)] hover:text-[var(--color-text)] p-1.5 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <ShieldAlert size={18} className="text-[var(--color-warn)]" />
        <h1 className="serif font-bold text-lg text-[var(--color-text)] flex-1 min-w-0">Audit & Scostamenti</h1>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-[var(--color-text-3)]">Da</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-md px-2 py-1 text-[var(--color-text)]" />
          <label className="text-[var(--color-text-3)]">A</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-md px-2 py-1 text-[var(--color-text)]" />
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-[1200px] mx-auto">
        {loading && (
          <div className="flex items-center gap-2 text-[var(--color-text-2)] py-10 justify-center">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" /> <span className="text-sm">Caricamento…</span>
          </div>
        )}
        {!loading && data && (
          <>
            {/* By action: totali aggregati */}
            <div>
              <h2 className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)] font-semibold mb-2 flex items-center gap-1"><AlertTriangle size={11}/> Azioni nel periodo</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {data.by_action?.length === 0 && (
                  <p className="text-[var(--color-text-3)] text-xs col-span-full">Nessuna azione registrata.</p>
                )}
                {data.by_action?.map(row => {
                  const meta = ACTION_LABELS[row.action] || { label: row.action, tone: 'neutral' }
                  return (
                    <Card key={row.action} padding="md" className="flex flex-col gap-1">
                      <Badge tone={meta.tone} size="sm">{meta.label}</Badge>
                      <span className="serif text-2xl font-bold text-[var(--color-text)] tnum">{row.total}</span>
                      <span className="text-[10px] text-[var(--color-text-3)] tnum">
                        {row.via_override > 0 ? `${row.via_override} via override` : `${row.distinct_users} persone`}
                      </span>
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* By register: incassi per cassa */}
            <div>
              <h2 className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)] font-semibold mb-2 flex items-center gap-1"><Wallet size={11}/> Incassi per Cassa</h2>
              <Card padding="none" className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--color-surface-2)] text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
                      <th className="text-left px-3 py-2">Cassa</th>
                      <th className="text-right px-3 py-2">N. pagamenti</th>
                      <th className="text-right px-3 py-2">Totale incassato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_register?.map((r, i) => (
                      <tr key={i} className="border-t border-[var(--color-border-soft)]">
                        <td className="px-3 py-2 font-mono text-[var(--color-text)] uppercase">{r.register.replace('cassa_', 'CASSA ')}</td>
                        <td className="px-3 py-2 text-right tnum text-[var(--color-text-2)]">{r.num_pagamenti}</td>
                        <td className="px-3 py-2 text-right tnum text-[var(--color-gold)] font-semibold">{formatPrice(r.totale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            {/* Top autorizzatori (chi firma piu' override) */}
            <div>
              <h2 className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)] font-semibold mb-2 flex items-center gap-1"><UserCheck size={11}/> Top Autorizzatori</h2>
              <Card padding="none" className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--color-surface-2)] text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
                      <th className="text-left px-3 py-2">Utente</th>
                      <th className="text-right px-3 py-2">Azioni totali</th>
                      <th className="text-right px-3 py-2">Firma override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_authorizers?.map(u => (
                      <tr key={u.user_id} className="border-t border-[var(--color-border-soft)]">
                        <td className="px-3 py-2 text-[var(--color-text)]">{u.user_name}</td>
                        <td className="px-3 py-2 text-right tnum text-[var(--color-text-2)]">{u.total_actions}</td>
                        <td className="px-3 py-2 text-right tnum text-[var(--color-warn)] font-semibold">{u.overrides_signed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            {/* Cancellazioni dettagliate */}
            <div>
              <h2 className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)] font-semibold mb-2">Cancellazioni & Deleghe (ultimi 100)</h2>
              <Card padding="none" className="overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[var(--color-surface-2)] text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
                      <tr>
                        <th className="text-left px-3 py-2">Quando</th>
                        <th className="text-left px-3 py-2">Azione</th>
                        <th className="text-left px-3 py-2">Tavolo</th>
                        <th className="text-left px-3 py-2">Item</th>
                        <th className="text-left px-3 py-2">Autorizzato da</th>
                        <th className="text-left px-3 py-2">Richiesto da</th>
                        <th className="text-left px-3 py-2">Override</th>
                        <th className="text-left px-3 py-2">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cancellations?.length === 0 && (
                        <tr><td colSpan={8} className="text-center py-6 text-[var(--color-text-3)]">Nessuna cancellazione nel periodo.</td></tr>
                      )}
                      {data.cancellations?.map((c, i) => {
                        const meta = ACTION_LABELS[c.action] || { label: c.action, tone: 'neutral' }
                        return (
                          <tr key={i} className="border-t border-[var(--color-border-soft)]">
                            <td className="px-3 py-2 text-[var(--color-text-3)] tnum">{fmtDate(c.created_at)}</td>
                            <td className="px-3 py-2"><Badge tone={meta.tone} size="sm">{meta.label}</Badge></td>
                            <td className="px-3 py-2 text-[var(--color-gold)] tnum">{c.table_number}</td>
                            <td className="px-3 py-2 text-[var(--color-text)]">{c.quantity ? `${c.quantity}×` : ''} {c.item_name || '—'}</td>
                            <td className="px-3 py-2 text-[var(--color-text-2)]">{c.authorized_by}</td>
                            <td className="px-3 py-2 text-[var(--color-text-3)]">{c.requested_by || '—'}</td>
                            <td className="px-3 py-2">{c.override_used ? <Badge tone="warn" size="sm">SÌ</Badge> : <span className="text-[var(--color-text-3)]">—</span>}</td>
                            <td className="px-3 py-2 text-[var(--color-text-3)] italic">{c.reason || ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
