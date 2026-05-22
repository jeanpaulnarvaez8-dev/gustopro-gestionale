import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Nfc, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { tablesAPI, zonesAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { Card, Badge } from '../components/v2'

/**
 * NFCWriterPage — programmatore tag NFC dei cavalieri tavolo.
 *
 * Scrive su ogni tag l'URL https://<origin>/t/{tableId} via Web NFC API.
 * Quando un cameriere poi avvicina il telefono al tag → apre /t/{id} →
 * redirect a /order/{id} (o conferma azione se c'è un task pendente).
 *
 * LIMITE: Web NFC API funziona SOLO su Android Chrome. Su iPhone non è
 * supportato (Safari) → in quel caso mostra le istruzioni per programmare
 * con l'app "NFC Tools" manualmente.
 *
 * Uso: admin/manager, da fare in un momento CALMO (non durante il servizio).
 */
const BASE = window.location.origin

export default function NFCWriterPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [tables, setTables] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [writing, setWriting] = useState(null)   // tableId in scrittura
  const [done, setDone] = useState({})           // tableId → true
  const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window

  useEffect(() => {
    Promise.all([tablesAPI.list(), zonesAPI.list()])
      .then(([t, z]) => { setTables(t.data); setZones(z.data) })
      .catch(() => toast({ type: 'error', title: 'Errore caricamento tavoli' }))
      .finally(() => setLoading(false))
  }, [toast])

  async function writeTag(table) {
    if (!nfcSupported) return
    setWriting(table.id)
    try {
      const url = `${BASE}/t/${table.id}`
      // eslint-disable-next-line no-undef
      const ndef = new NDEFReader()
      await ndef.write({ records: [{ recordType: 'url', data: url }] })
      setDone(d => ({ ...d, [table.id]: true }))
      toast({ type: 'success', title: `✓ Tavolo ${table.table_number} programmato`, message: 'Appoggia il prossimo tag' })
    } catch (e) {
      toast({ type: 'error', title: 'Errore scrittura', message: e?.message || 'Riprova, tieni il tag vicino' })
    } finally {
      setWriting(null)
    }
  }

  const zoneName = (id) => zones.find(z => z.id === id)?.name || 'Altro'
  const sorted = [...tables].sort((a, b) =>
    String(a.table_number).localeCompare(String(b.table_number), 'it', { numeric: true }))
  const doneCount = Object.keys(done).length

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => navigate(-1)} className="text-[var(--color-text-2)] hover:text-[var(--color-text)] p-1.5 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <Nfc size={20} className="text-[var(--color-gold)]" />
        <h1 className="serif font-bold text-lg text-[var(--color-text)] flex-1">Programma Tag NFC</h1>
        <Badge tone="ok" size="sm">{doneCount}/{tables.length}</Badge>
      </header>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Stato supporto NFC */}
        {!nfcSupported ? (
          <Card padding="md" className="border-l-4 border-[var(--color-warn)]">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-[var(--color-warn)] mt-0.5 shrink-0" />
              <div className="text-sm text-[var(--color-text-2)]">
                <p className="font-bold text-[var(--color-text)]">Web NFC non disponibile su questo device</p>
                <p className="mt-1">La scrittura tag funziona solo su <b>Android con Chrome</b>. Su iPhone non è possibile.</p>
                <p className="mt-2 font-semibold text-[var(--color-text)]">Alternativa manuale (qualsiasi telefono):</p>
                <ol className="list-decimal ml-4 mt-1 space-y-0.5 text-xs">
                  <li>Installa l'app gratis <b>"NFC Tools"</b></li>
                  <li>Scrivi → Aggiungi record → URL</li>
                  <li>Per ogni tavolo incolla: <code className="text-[var(--color-gold)]">{BASE}/t/&lt;id-tavolo&gt;</code></li>
                  <li>Gli ID tavolo li trovi qui sotto (tap per copiare)</li>
                </ol>
              </div>
            </div>
          </Card>
        ) : (
          <Card padding="md" className="border-l-4 border-[var(--color-ok)]">
            <p className="text-sm text-[var(--color-text)]">
              <b>📱 Pronto.</b> Tocca "Programma" su un tavolo, poi <b>appoggia il tag NFC</b> sul retro del telefono finché non vedi ✓.
            </p>
            <p className="text-xs text-[var(--color-text-3)] mt-1">Consiglio: programma e attacca un tag alla volta sul cavaliere giusto per non confonderli.</p>
          </Card>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-[var(--color-text-2)] py-8 justify-center">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" /> Caricamento…
          </div>
        )}

        {!loading && (
          <Card padding="none" className="overflow-hidden divide-y divide-[var(--color-border-soft)]">
            {sorted.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="serif font-bold text-lg text-[var(--color-gold)] tnum w-12 shrink-0">
                  {t.table_number}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--color-text-3)]">{zoneName(t.zone_id)}</p>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(`${BASE}/t/${t.id}`); toast({ type: 'info', title: 'URL copiato' }) }}
                    className="text-[10px] text-[var(--color-text-3)] font-mono truncate hover:text-[var(--color-gold)] text-left w-full"
                    title="Tap per copiare l'URL"
                  >
                    /t/{t.id.slice(0, 8)}…
                  </button>
                </div>
                {done[t.id] ? (
                  <CheckCircle2 size={22} className="text-[var(--color-ok)] shrink-0" />
                ) : nfcSupported ? (
                  <button
                    onClick={() => writeTag(t)}
                    disabled={writing === t.id}
                    className="px-3 py-1.5 rounded-md bg-[var(--color-gold)] text-[#13181C] text-xs font-bold disabled:opacity-50 shrink-0 flex items-center gap-1"
                  >
                    {writing === t.id ? <><RefreshCw size={12} className="animate-spin"/> Appoggia…</> : <><Nfc size={12}/> Programma</>}
                  </button>
                ) : (
                  <span className="text-[10px] text-[var(--color-text-3)] shrink-0">manuale</span>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
