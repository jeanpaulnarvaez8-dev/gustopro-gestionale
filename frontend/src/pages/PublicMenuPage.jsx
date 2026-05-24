import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BellRing, CheckCircle2, RefreshCw, UtensilsCrossed } from 'lucide-react'
import { publicAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'

/**
 * PublicMenuPage — menu CLIENTE accessibile via QR sul tavolo. NESSUN login.
 * Rotta: /menu/:slug/:table?  (es. /menu/riva-beach/12)
 * - Mostra piatti disponibili + prezzi, raggruppati per categoria.
 * - Se c'e' il numero tavolo: bottone "CHIAMA CAMERIERE" → notifica lo staff.
 * Avvolto in .normalcase per restare leggibile (non tutto maiuscolo come l'app staff).
 */
export default function PublicMenuPage() {
  const { slug, table } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [calling, setCalling] = useState(false)
  const [called, setCalled] = useState(false)

  useEffect(() => {
    let alive = true
    publicAPI.menu(slug)
      .then(r => { if (alive) setData(r.data) })
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [slug])

  const callWaiter = async () => {
    if (calling || called) return
    setCalling(true)
    try {
      await publicAPI.callWaiter(slug, table)
      setCalled(true)
      setTimeout(() => setCalled(false), 30000) // riabilita dopo 30s
    } catch {
      alert('Riprova tra poco')
    } finally {
      setCalling(false)
    }
  }

  if (loading) {
    return (
      <div className="normalcase min-h-[100dvh] flex items-center justify-center bg-[var(--color-canvas)] gap-2 text-[var(--color-text-2)]">
        <RefreshCw size={20} className="animate-spin text-[var(--color-gold)]" />
        <span>Carico il menu…</span>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="normalcase min-h-[100dvh] flex flex-col items-center justify-center bg-[var(--color-canvas)] gap-2 px-6 text-center">
        <UtensilsCrossed size={32} className="text-[var(--color-text-3)]" />
        <p className="text-[var(--color-text-2)]">Menu non disponibile. Chiedi al personale.</p>
      </div>
    )
  }

  return (
    <div className="normalcase min-h-[100dvh] bg-[var(--color-canvas)] pb-28">
      {/* Header brand */}
      <header className="text-center pt-8 pb-5 px-4 border-b border-[var(--color-border-soft)]">
        <p className="text-[var(--color-gold)] text-[11px] tracking-[0.25em] font-semibold">SALENTO · MARE ADRIATICO</p>
        <h1 className="serif text-3xl font-bold text-[var(--color-text)] mt-1">{data.restaurant}</h1>
        {table && (
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-[var(--color-gold-soft)] border border-[var(--color-gold-ring)]">
            <span className="text-[var(--color-gold)] text-sm font-bold">Tavolo {table}</span>
          </div>
        )}
        <p className="text-[var(--color-text-3)] text-xs mt-3">Menu · i prezzi sono in Euro</p>
      </header>

      {/* Menu */}
      <main className="max-w-2xl mx-auto px-4 py-2">
        {data.menu.map(cat => (
          <section key={cat.id} className="mt-6">
            <h2 className="serif text-xl font-bold text-[var(--color-gold)] border-b border-[var(--color-gold-ring)] pb-1.5 mb-3">
              {cat.name}
            </h2>
            <div className="flex flex-col divide-y divide-[var(--color-border-soft)]">
              {cat.items.map(it => (
                <div key={it.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--color-text)] font-semibold leading-tight">{it.name}</p>
                    {it.description && (
                      <p className="text-[var(--color-text-3)] text-sm leading-snug mt-0.5">{it.description}</p>
                    )}
                  </div>
                  <span className="text-[var(--color-text)] font-bold tnum shrink-0">
                    {formatPrice(it.base_price)}{it.pricing_type === 'per_kg' ? '/kg' : ''}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <p className="text-center text-[var(--color-text-3)] text-[11px] mt-10 mb-2">
          Per allergie o intolleranze chiedi al personale.
        </p>
      </main>

      {/* Chiama cameriere (solo se c'e' il numero tavolo) */}
      {table && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[var(--color-canvas)] via-[var(--color-canvas)] to-transparent">
          <button
            onClick={callWaiter}
            disabled={calling || called}
            className={`w-full max-w-2xl mx-auto py-4 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-2 shadow-xl transition active:scale-[0.98] ${
              called
                ? 'bg-[var(--color-ok)] text-white'
                : 'bg-[var(--color-gold)] text-[#13181C]'
            }`}
          >
            {calling ? (
              <><RefreshCw size={20} className="animate-spin" /> Chiamo…</>
            ) : called ? (
              <><CheckCircle2 size={22} /> Cameriere in arrivo!</>
            ) : (
              <><BellRing size={22} /> Chiama il cameriere</>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
