import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BellRing, CheckCircle2 } from 'lucide-react'
import { publicAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'

/**
 * PublicMenuPage — menu CLIENTE via QR sul tavolo. NESSUN login.
 * Rotta: /menu/:slug/:table?  (es. /menu/riva-beach/12)
 * Design dedicato "mare Salento": hero tramonto sul mare, onda, tipografia
 * elegante (serif), palette oceano + oro + sabbia. Tema self-contained (.rb-*)
 * cosi' resta bello e indipendente dal tema scuro dell'app staff.
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
      setTimeout(() => setCalled(false), 30000)
    } catch {
      alert('Riprova tra poco')
    } finally {
      setCalling(false)
    }
  }

  return (
    <div className="rb-menu normalcase">
      <style>{RB_CSS}</style>

      {/* ─── HERO tramonto sul mare ─────────────────────────── */}
      <header className="rb-hero">
        <div className="rb-sun" />
        <div className="rb-hero-in">
          <p className="rb-eyebrow">PUNTA PROSCIUTTO · SALENTO</p>
          <h1 className="rb-title">Riva <em>Beach</em></h1>
          <p className="rb-tagline">Tramonti salentini che restano nel cuore</p>
          {table && <div className="rb-table">Tavolo {table}</div>}
        </div>
        <svg className="rb-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,40 C240,90 480,0 720,30 C960,60 1200,95 1440,45 L1440,90 L0,90 Z" />
        </svg>
      </header>

      {/* ─── CORPO ──────────────────────────────────────────── */}
      <main className="rb-body">
        {loading && <p className="rb-state">Carico il menu…</p>}
        {error && !loading && <p className="rb-state">Menu non disponibile. Chiedi al personale.</p>}

        {!loading && !error && data && (
          <>
            {data.menu.map(cat => (
              <section className="rb-section" key={cat.id}>
                <h2 className="rb-cat"><span>{cat.name}</span></h2>
                <div className="rb-items">
                  {cat.items.map(it => (
                    <article className="rb-item" key={it.id}>
                      <div className="rb-row">
                        <span className="rb-name">{it.name}</span>
                        <span className="rb-lead" />
                        <span className="rb-price">
                          {formatPrice(it.base_price)}{it.pricing_type === 'per_kg' ? '/kg' : ''}
                        </span>
                      </div>
                      {it.description && <p className="rb-desc">{it.description}</p>}
                    </article>
                  ))}
                </div>
              </section>
            ))}
            <p className="rb-foot">
              <span className="rb-foot-line">Tradizione di ospitalità dal 1965</span>
              Per allergie o intolleranze chiedi al personale
            </p>
          </>
        )}
      </main>

      {/* ─── CHIAMA CAMERIERE (solo con numero tavolo) ──────── */}
      {table && !loading && !error && (
        <div className="rb-cta-wrap">
          <button
            className={`rb-cta ${called ? 'is-done' : ''}`}
            onClick={callWaiter}
            disabled={calling || called}
          >
            {calling ? 'Chiamo…'
              : called ? <><CheckCircle2 size={22} /> Cameriere in arrivo</>
              : <><BellRing size={22} /> Chiama il cameriere</>}
          </button>
        </div>
      )}
    </div>
  )
}

const RB_CSS = `
.rb-menu{
  --sea-deep:#0d3b4f; --sea:#1d6b86; --sea-2:#2f93ad;
  --sand:#fbf7ef; --sand-2:#f3e9d8;
  --gold:#c6a04b; --gold-2:#e3c178; --coral:#d9824e;
  --ink:#23343c; --ink-soft:#5f7480;
  min-height:100dvh; background:var(--sand); color:var(--ink);
  font-family:var(--font-sans, system-ui, sans-serif);
  padding-bottom:120px;
}
/* HERO */
.rb-hero{position:relative; text-align:center; padding:54px 20px 0;
  background:linear-gradient(180deg,#0b3346 0%,#155a73 42%,#cf7f4a 86%,#e0a064 100%);
  overflow:hidden;}
.rb-sun{position:absolute; left:50%; top:120px; width:170px; height:170px; transform:translateX(-50%);
  border-radius:50%;
  background:radial-gradient(circle, rgba(255,241,214,0.95) 0%, rgba(244,201,120,0.6) 45%, rgba(244,201,120,0) 72%);
  filter:blur(2px);}
.rb-hero-in{position:relative; z-index:2;}
.rb-eyebrow{color:rgba(255,255,255,0.85); font-size:11px; letter-spacing:.32em; font-weight:600; margin:0;}
.rb-title{font-family:var(--font-serif, Georgia, serif); color:#fff; font-size:46px; line-height:1;
  margin:10px 0 0; font-weight:700; letter-spacing:-.01em; text-shadow:0 2px 18px rgba(0,0,0,.25);}
.rb-title em{font-style:italic; color:var(--gold-2);}
.rb-tagline{font-family:var(--font-serif, Georgia, serif); font-style:italic;
  color:rgba(255,255,255,0.92); font-size:15px; margin:10px 0 0;}
.rb-table{display:inline-block; margin:18px 0 64px; padding:7px 20px; border-radius:999px;
  background:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.45);
  color:#fff; font-weight:700; font-size:15px; backdrop-filter:blur(4px);}
.rb-wave{position:absolute; left:0; right:0; bottom:-1px; width:100%; height:64px; display:block;}
.rb-wave path{fill:var(--sand);}
/* CORPO */
.rb-body{max-width:640px; margin:0 auto; padding:8px 22px 0;}
.rb-state{text-align:center; color:var(--ink-soft); padding:40px 0;}
.rb-section{margin-top:34px;}
.rb-cat{display:flex; align-items:center; justify-content:center; gap:14px; margin:0 0 18px;}
.rb-cat::before,.rb-cat::after{content:""; height:1px; flex:1; background:linear-gradient(90deg,transparent,var(--gold));}
.rb-cat::after{background:linear-gradient(90deg,var(--gold),transparent);}
.rb-cat span{font-family:var(--font-serif, Georgia, serif); color:var(--sea-deep);
  font-size:23px; font-weight:700; letter-spacing:.01em; white-space:nowrap;}
.rb-items{display:flex; flex-direction:column; gap:16px;}
.rb-item{}
.rb-row{display:flex; align-items:baseline; gap:8px;}
.rb-name{font-weight:600; font-size:16.5px; color:var(--ink); flex-shrink:1;}
.rb-lead{flex:1; min-width:14px; border-bottom:1px dotted #c9b48e; transform:translateY(-3px);}
.rb-price{font-family:var(--font-serif, Georgia, serif); font-weight:700; color:var(--gold);
  font-size:16.5px; white-space:nowrap; font-variant-numeric:tabular-nums;}
.rb-desc{margin:3px 0 0; color:var(--ink-soft); font-size:13.5px; line-height:1.45;}
.rb-foot{text-align:center; color:var(--ink-soft); font-size:12px; margin:40px 0 8px; line-height:1.7;}
.rb-foot-line{display:block; font-family:var(--font-serif, Georgia, serif); font-style:italic;
  color:var(--sea); font-size:14px; margin-bottom:4px;}
/* CTA */
.rb-cta-wrap{position:fixed; left:0; right:0; bottom:0; padding:16px 20px 22px;
  background:linear-gradient(180deg, rgba(251,247,239,0) 0%, var(--sand) 38%);}
.rb-cta{display:flex; align-items:center; justify-content:center; gap:10px;
  width:100%; max-width:600px; margin:0 auto; padding:17px; border:none; border-radius:16px; cursor:pointer;
  font-family:var(--font-serif, Georgia, serif); font-weight:700; font-size:18px; color:#fff;
  background:linear-gradient(135deg,#1d6b86,#0d3b4f); box-shadow:0 10px 28px rgba(13,59,79,.35);
  transition:transform .12s ease, filter .12s ease;}
.rb-cta:active{transform:scale(.98);}
.rb-cta:disabled{opacity:.95;}
.rb-cta.is-done{background:linear-gradient(135deg,#3e9a73,#2f7d5c);}
`
