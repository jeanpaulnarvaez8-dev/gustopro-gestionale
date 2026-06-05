import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { BellRing, CheckCircle2 } from 'lucide-react'
import { publicAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'

// Lingue del menu QR cliente. it = originale.
const LANGS = [
  { code: 'it', flag: '🇮🇹', label: 'IT' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
  { code: 'de', flag: '🇩🇪', label: 'DE' },
  { code: 'fr', flag: '🇫🇷', label: 'FR' },
  { code: 'es', flag: '🇪🇸', label: 'ES' },
]

// Etichette UI tradotte.
const T = {
  it: { tagline: 'Tramonti salentini che restano nel cuore', table: 'Tavolo', loading: 'Carico il menu…', error: 'Menu non disponibile. Chiedi al personale.', call: 'Chiama il cameriere', calling: 'Chiamo…', called: 'Cameriere in arrivo', info: 'Informazioni', coperto: 'Coperto', perPerson: 'a persona', vat: 'Prezzi in Euro, IVA inclusa.', raw: 'Il pesce destinato al consumo crudo è sottoposto ad abbattimento rapido (Reg. CE 853/2004).', frozen: 'Alcuni prodotti possono essere surgelati o congelati all’origine.', algTitle: 'Allergeni · Reg. UE 1169/2011', algNote: 'Per gli allergeni in ogni piatto rivolgiti al personale di sala.', footer: 'Tradizione di ospitalità dal 1965 · Punta Prosciutto · Salento' },
  en: { tagline: 'Salento sunsets that stay in your heart', table: 'Table', loading: 'Loading menu…', error: 'Menu unavailable. Please ask the staff.', call: 'Call the waiter', calling: 'Calling…', called: 'Waiter on the way', info: 'Information', coperto: 'Cover charge', perPerson: 'per person', vat: 'Prices in Euro, VAT included.', raw: 'Fish for raw consumption is blast-chilled (EC Reg. 853/2004).', frozen: 'Some products may be frozen at origin.', algTitle: 'Allergens · EU Reg. 1169/2011', algNote: 'For allergens in each dish please ask our staff.', footer: 'Hospitality tradition since 1965 · Punta Prosciutto · Salento' },
  de: { tagline: 'Sonnenuntergänge des Salento, die im Herzen bleiben', table: 'Tisch', loading: 'Menü wird geladen…', error: 'Menü nicht verfügbar. Bitte das Personal fragen.', call: 'Kellner rufen', calling: 'Rufe…', called: 'Kellner kommt', info: 'Informationen', coperto: 'Gedeck', perPerson: 'pro Person', vat: 'Preise in Euro, inkl. MwSt.', raw: 'Roh verzehrter Fisch wird schockgefrostet (EG-Verordnung 853/2004).', frozen: 'Einige Produkte können am Ursprung tiefgekühlt sein.', algTitle: 'Allergene · EU-Verordnung 1169/2011', algNote: 'Für Allergene in den Gerichten bitte das Personal fragen.', footer: 'Gastfreundschaft seit 1965 · Punta Prosciutto · Salento' },
  fr: { tagline: 'Couchers de soleil du Salento qui restent dans le cœur', table: 'Table', loading: 'Chargement du menu…', error: 'Menu indisponible. Demandez au personnel.', call: 'Appeler le serveur', calling: 'Appel…', called: 'Serveur en arrivée', info: 'Informations', coperto: 'Couvert', perPerson: 'par personne', vat: 'Prix en Euro, TVA incluse.', raw: 'Le poisson consommé cru est surgelé rapidement (Règl. CE 853/2004).', frozen: 'Certains produits peuvent être surgelés à l’origine.', algTitle: 'Allergènes · Règl. UE 1169/2011', algNote: 'Pour les allergènes de chaque plat, demandez au personnel.', footer: 'Tradition d’accueil depuis 1965 · Punta Prosciutto · Salento' },
  es: { tagline: 'Atardeceres del Salento que permanecen en el corazón', table: 'Mesa', loading: 'Cargando el menú…', error: 'Menú no disponible. Pregunte al personal.', call: 'Llamar al camarero', calling: 'Llamando…', called: 'Camarero en camino', info: 'Información', coperto: 'Cubierto', perPerson: 'por persona', vat: 'Precios en Euro, IVA incluido.', raw: 'El pescado para consumo crudo se abate rápidamente (Regl. CE 853/2004).', frozen: 'Algunos productos pueden estar congelados en origen.', algTitle: 'Alérgenos · Regl. UE 1169/2011', algNote: 'Para los alérgenos de cada plato, pregunte al personal.', footer: 'Tradición de hospitalidad desde 1965 · Punta Prosciutto · Salento' },
}

// 14 allergeni (Allegato II Reg. UE 1169/2011) tradotti.
const ALLERGENI = {
  it: ['Glutine', 'Crostacei', 'Uova', 'Pesce', 'Arachidi', 'Soia', 'Latte e lattosio', 'Frutta a guscio', 'Sedano', 'Senape', 'Sesamo', 'Solfiti', 'Lupini', 'Molluschi'],
  en: ['Gluten', 'Crustaceans', 'Eggs', 'Fish', 'Peanuts', 'Soy', 'Milk/Lactose', 'Nuts', 'Celery', 'Mustard', 'Sesame', 'Sulphites', 'Lupin', 'Molluscs'],
  de: ['Gluten', 'Krebstiere', 'Eier', 'Fisch', 'Erdnüsse', 'Soja', 'Milch/Laktose', 'Schalenfrüchte', 'Sellerie', 'Senf', 'Sesam', 'Sulfite', 'Lupinen', 'Weichtiere'],
  fr: ['Gluten', 'Crustacés', 'Œufs', 'Poisson', 'Arachides', 'Soja', 'Lait/Lactose', 'Fruits à coque', 'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Lupin', 'Mollusques'],
  es: ['Gluten', 'Crustáceos', 'Huevos', 'Pescado', 'Cacahuetes', 'Soja', 'Leche/Lactosa', 'Frutos de cáscara', 'Apio', 'Mostaza', 'Sésamo', 'Sulfitos', 'Altramuces', 'Moluscos'],
}

// Traduzione delle tag allergeni per piatto (forme brevi salvate in IT).
const ALG_TAG = {
  Glutine:   { en: 'Gluten', de: 'Gluten', fr: 'Gluten', es: 'Gluten' },
  Crostacei: { en: 'Crustaceans', de: 'Krebstiere', fr: 'Crustacés', es: 'Crustáceos' },
  Uova:      { en: 'Eggs', de: 'Eier', fr: 'Œufs', es: 'Huevos' },
  Pesce:     { en: 'Fish', de: 'Fisch', fr: 'Poisson', es: 'Pescado' },
  Soia:      { en: 'Soy', de: 'Soja', fr: 'Soja', es: 'Soja' },
  Latte:     { en: 'Milk', de: 'Milch', fr: 'Lait', es: 'Leche' },
  Sedano:    { en: 'Celery', de: 'Sellerie', fr: 'Céleri', es: 'Apio' },
  Sesamo:    { en: 'Sesame', de: 'Sesam', fr: 'Sésame', es: 'Sésamo' },
  Solfiti:   { en: 'Sulphites', de: 'Sulfite', fr: 'Sulfites', es: 'Sulfitos' },
  Molluschi: { en: 'Molluscs', de: 'Weichtiere', fr: 'Mollusques', es: 'Moluscos' },
}
const algLabel = (tag, lang) => (lang !== 'it' && ALG_TAG[tag] && ALG_TAG[tag][lang]) || tag

/**
 * PublicMenuPage — menu CLIENTE via QR sul tavolo. NESSUN login. Multilingua.
 * Rotta: /menu/:slug/:table?
 */
export default function PublicMenuPage() {
  const { slug, table } = useParams()
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('rb_menu_lang') || 'it' } catch { return 'it' }
  })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [calling, setCalling] = useState(false)
  const [called, setCalled] = useState(false)
  const t = T[lang] || T.it

  useEffect(() => {
    let alive = true
    setLoading(true); setError(false)
    publicAPI.menu(slug, lang === 'it' ? null : lang)
      .then(r => { if (alive) setData(r.data) })
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [slug, lang])

  const changeLang = (code) => {
    setLang(code)
    try { localStorage.setItem('rb_menu_lang', code) } catch {}
  }

  // JP 2026-06-05 FIX: ref per tracciare il timeout cosi' lo cancello
  // su unmount (cliente chiude tab) e su seconda chiamata. Senza, timer
  // orfano vivo 30min con warning 'state update on unmounted component'.
  const calledTimeoutRef = useRef(null)
  useEffect(() => () => {
    if (calledTimeoutRef.current) clearTimeout(calledTimeoutRef.current)
  }, [])

  const callWaiter = async () => {
    if (calling || called) return
    setCalling(true)
    try {
      await publicAPI.callWaiter(slug, table)
      setCalled(true)
      // Si puo' richiamare dopo 30 minuti (anti-spam).
      if (calledTimeoutRef.current) clearTimeout(calledTimeoutRef.current)
      calledTimeoutRef.current = setTimeout(() => setCalled(false), 30 * 60 * 1000)
    } catch {
      alert('Riprova tra poco')
    } finally {
      setCalling(false)
    }
  }

  return (
    <div className="rb-menu normalcase">
      <style>{RB_CSS}</style>

      {/* Selettore lingua */}
      <div className="rb-langbar">
        {LANGS.map(l => (
          <button
            key={l.code}
            onClick={() => changeLang(l.code)}
            className={`rb-lang ${lang === l.code ? 'is-on' : ''}`}
          >
            <span className="rb-flag">{l.flag}</span>{l.label}
          </button>
        ))}
      </div>

      {/* HERO tramonto sul mare */}
      <header className="rb-hero">
        <div className="rb-sun" />
        <div className="rb-hero-in">
          <p className="rb-eyebrow">PUNTA PROSCIUTTO · SALENTO</p>
          <h1 className="rb-title">Riva <em>Beach</em></h1>
          <p className="rb-tagline">{t.tagline}</p>
          {table && <div className="rb-table">{t.table} {table}</div>}
        </div>
        <svg className="rb-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,40 C240,90 480,0 720,30 C960,60 1200,95 1440,45 L1440,90 L0,90 Z" />
        </svg>
      </header>

      <main className="rb-body">
        {loading && <p className="rb-state">{t.loading}</p>}
        {error && !loading && <p className="rb-state">{t.error}</p>}

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
                          {it.pricing_type === 'per_kg'
                            ? `${formatPrice(it.base_price / 10)}/etto`
                            : formatPrice(it.base_price)}
                        </span>
                      </div>
                      {it.description && <p className="rb-desc">{it.description}</p>}
                      {Array.isArray(it.allergens) && it.allergens.length > 0 && (
                        <div className="rb-alg">
                          {it.allergens.map((a, i) => (
                            <span key={i} className="rb-alg-tag">{algLabel(a, lang)}</span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}

            {/* Informazioni & Allergeni (norma UE/Italia) */}
            <section className="rb-info">
              <h2 className="rb-cat"><span>{t.info}</span></h2>
              {data.coperto > 0 && (
                <p className="rb-info-row"><b>{t.coperto}</b> {formatPrice(data.coperto)} {t.perPerson}</p>
              )}
              <p className="rb-info-row">{t.vat}</p>
              <p className="rb-info-row">{t.raw}</p>
              <p className="rb-info-row">{t.frozen}</p>

              <h3 className="rb-info-h3">{t.algTitle}</h3>
              <p className="rb-info-row rb-info-muted">{t.algNote}</p>
              <div className="rb-alg-grid">
                {(ALLERGENI[lang] || ALLERGENI.it).map((a, i) => (
                  <span key={i} className="rb-alg-li"><b>{i + 1}.</b> {a}</span>
                ))}
              </div>

              <p className="rb-foot-line2">{t.footer}</p>
            </section>
          </>
        )}
      </main>

      {table && !loading && !error && (
        <div className="rb-cta-wrap">
          <button
            className={`rb-cta ${called ? 'is-done' : ''}`}
            onClick={callWaiter}
            disabled={calling || called}
          >
            {calling ? t.calling
              : called ? <><CheckCircle2 size={22} /> {t.called}</>
              : <><BellRing size={22} /> {t.call}</>}
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
.rb-langbar{position:sticky; top:0; z-index:10; display:flex; gap:6px; justify-content:center;
  padding:8px; background:#0b3346; box-shadow:0 2px 10px rgba(0,0,0,.2);}
.rb-lang{display:flex; align-items:center; gap:4px; padding:5px 10px; border-radius:999px;
  border:1px solid rgba(255,255,255,0.25); background:transparent; color:rgba(255,255,255,0.8);
  font-size:13px; font-weight:700; cursor:pointer;}
.rb-lang.is-on{background:var(--gold); color:#13181C; border-color:var(--gold);}
.rb-flag{font-size:15px;}
.rb-hero{position:relative; text-align:center; padding:46px 20px 0;
  background:linear-gradient(180deg,#0b3346 0%,#155a73 42%,#cf7f4a 86%,#e0a064 100%);
  overflow:hidden;}
.rb-sun{position:absolute; left:50%; top:110px; width:170px; height:170px; transform:translateX(-50%);
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
  color:#fff; font-weight:700; font-size:15px;}
.rb-wave{position:absolute; left:0; right:0; bottom:-1px; width:100%; height:60px; display:block;}
.rb-wave path{fill:var(--sand);}
.rb-body{max-width:640px; margin:0 auto; padding:8px 22px 0;}
.rb-state{text-align:center; color:var(--ink-soft); padding:40px 0;}
.rb-section,.rb-info{margin-top:34px;}
.rb-cat{display:flex; align-items:center; justify-content:center; gap:14px; margin:0 0 18px;}
.rb-cat::before,.rb-cat::after{content:""; height:1px; flex:1; background:linear-gradient(90deg,transparent,var(--gold));}
.rb-cat::after{background:linear-gradient(90deg,var(--gold),transparent);}
.rb-cat span{font-family:var(--font-serif, Georgia, serif); color:var(--sea-deep);
  font-size:23px; font-weight:700; white-space:nowrap;}
.rb-items{display:flex; flex-direction:column; gap:16px;}
.rb-row{display:flex; align-items:baseline; gap:8px;}
.rb-name{font-weight:600; font-size:16.5px; color:var(--ink);}
.rb-lead{flex:1; min-width:14px; border-bottom:1px dotted #c9b48e; transform:translateY(-3px);}
.rb-price{font-family:var(--font-serif, Georgia, serif); font-weight:700; color:var(--gold);
  font-size:16.5px; white-space:nowrap; font-variant-numeric:tabular-nums;}
.rb-desc{margin:3px 0 0; color:var(--ink-soft); font-size:13.5px; line-height:1.45;}
.rb-alg{display:flex; flex-wrap:wrap; gap:5px; margin-top:6px;}
.rb-alg-tag{font-size:10.5px; color:var(--sea); background:rgba(29,107,134,0.10);
  border:1px solid rgba(29,107,134,0.25); border-radius:999px; padding:1px 8px;}
.rb-info-row{font-size:12.5px; color:var(--ink-soft); line-height:1.5; margin:4px 0; text-align:center;}
.rb-info-muted{font-style:italic;}
.rb-info-h3{font-family:var(--font-serif, Georgia, serif); color:var(--sea-deep); text-align:center;
  font-size:15px; margin:16px 0 6px;}
.rb-alg-grid{display:grid; grid-template-columns:repeat(2,1fr); gap:3px 14px; max-width:420px; margin:6px auto 0;}
.rb-alg-li{font-size:11.5px; color:var(--ink-soft);}
.rb-alg-li b{color:var(--sea);}
.rb-foot-line2{text-align:center; font-family:var(--font-serif, Georgia, serif); font-style:italic;
  color:var(--sea); font-size:13px; margin:24px 0 8px;}
.rb-cta-wrap{position:fixed; left:0; right:0; bottom:0; padding:16px 20px 22px;
  background:linear-gradient(180deg, rgba(251,247,239,0) 0%, var(--sand) 38%);}
.rb-cta{display:flex; align-items:center; justify-content:center; gap:10px;
  width:100%; max-width:600px; margin:0 auto; padding:17px; border:none; border-radius:16px; cursor:pointer;
  font-family:var(--font-serif, Georgia, serif); font-weight:700; font-size:18px; color:#fff;
  background:linear-gradient(135deg,#1d6b86,#0d3b4f); box-shadow:0 10px 28px rgba(13,59,79,.35);
  transition:transform .12s ease;}
.rb-cta:active{transform:scale(.98);}
.rb-cta.is-done{background:linear-gradient(135deg,#3e9a73,#2f7d5c);}
`
