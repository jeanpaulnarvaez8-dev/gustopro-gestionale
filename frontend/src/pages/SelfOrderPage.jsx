import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShoppingCart, Plus, Minus, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react'
import { publicAPI } from '../lib/api'
import { formatPrice } from '../lib/utils'

// Lingue self-order (it = originale). JP 2026-06-13: Salento, tanti stranieri.
const LANGS = [
  { code: 'it', flag: '🇮🇹' }, { code: 'en', flag: '🇬🇧' }, { code: 'de', flag: '🇩🇪' },
  { code: 'fr', flag: '🇫🇷' }, { code: 'es', flag: '🇪🇸' },
]

const T = {
  it: { table: 'Tavolo', takeaway: 'Asporto', sub: 'ordina dal telefono', loading: 'Carico il menu…', error: 'Menu non disponibile. Chiedi al personale.', vat: 'Prezzi in Euro, IVA inclusa · paghi in cassa', seeOrder: 'Vedi ordine', keepOrdering: 'Continua a ordinare', yourOrder: 'Il tuo ordine', empty: 'Carrello vuoto', total: 'Totale', yourName: 'Il tuo nome', namePh: 'Es. Marco', send: 'Invia ordine', sending: 'Invio…', startsPaid: "L'ordine parte quando paghi in cassa", notePh: 'Note? es. senza crudo, senza cipolla…', received: 'Ordine ricevuto!', toPay: 'Totale da pagare', taNum: 'N° asporto', goPay: 'Vai in', goPay2: 'cassa a pagare', startsAfter: "L'ordine parte appena saldato. 🍽️", again: 'Ordina ancora', errSend: 'Errore invio ordine, riprova' },
  en: { table: 'Table', takeaway: 'Takeaway', sub: 'order from your phone', loading: 'Loading menu…', error: 'Menu unavailable. Please ask the staff.', vat: 'Prices in Euro, VAT incl. · pay at the till', seeOrder: 'View order', keepOrdering: 'Keep ordering', yourOrder: 'Your order', empty: 'Cart empty', total: 'Total', yourName: 'Your name', namePh: 'E.g. Marco', send: 'Send order', sending: 'Sending…', startsPaid: 'The order starts once you pay at the till', notePh: 'Notes? e.g. no ham, no onion…', received: 'Order received!', toPay: 'Total to pay', taNum: 'Takeaway no.', goPay: 'Go to the', goPay2: 'till to pay', startsAfter: 'The order starts once paid. 🍽️', again: 'Order again', errSend: 'Error sending order, try again' },
  de: { table: 'Tisch', takeaway: 'Zum Mitnehmen', sub: 'vom Handy bestellen', loading: 'Menü wird geladen…', error: 'Menü nicht verfügbar. Bitte Personal fragen.', vat: 'Preise in Euro, inkl. MwSt. · Zahlung an der Kasse', seeOrder: 'Bestellung ansehen', keepOrdering: 'Weiter bestellen', yourOrder: 'Deine Bestellung', empty: 'Warenkorb leer', total: 'Gesamt', yourName: 'Dein Name', namePh: 'z.B. Marco', send: 'Bestellung senden', sending: 'Senden…', startsPaid: 'Die Bestellung startet nach Zahlung an der Kasse', notePh: 'Anmerkungen? z.B. ohne Schinken…', received: 'Bestellung erhalten!', toPay: 'Zu zahlen', taNum: 'Mitnahme-Nr.', goPay: 'Zur', goPay2: 'Kasse, bitte zahlen', startsAfter: 'Die Bestellung startet nach Zahlung. 🍽️', again: 'Erneut bestellen', errSend: 'Fehler beim Senden, erneut versuchen' },
  fr: { table: 'Table', takeaway: 'À emporter', sub: 'commandez depuis votre téléphone', loading: 'Chargement du menu…', error: 'Menu indisponible. Demandez au personnel.', vat: 'Prix en euros, TVA incl. · paiement en caisse', seeOrder: 'Voir la commande', keepOrdering: 'Continuer', yourOrder: 'Votre commande', empty: 'Panier vide', total: 'Total', yourName: 'Votre nom', namePh: 'Ex. Marco', send: 'Envoyer la commande', sending: 'Envoi…', startsPaid: 'La commande démarre après paiement en caisse', notePh: 'Notes ? ex. sans jambon, sans oignon…', received: 'Commande reçue !', toPay: 'Total à payer', taNum: 'N° à emporter', goPay: 'Allez payer', goPay2: 'en caisse', startsAfter: 'La commande démarre une fois payée. 🍽️', again: 'Commander encore', errSend: "Erreur d'envoi, réessayez" },
  es: { table: 'Mesa', takeaway: 'Para llevar', sub: 'pide desde el móvil', loading: 'Cargando el menú…', error: 'Menú no disponible. Pregunte al personal.', vat: 'Precios en euros, IVA incl. · pago en caja', seeOrder: 'Ver pedido', keepOrdering: 'Seguir pidiendo', yourOrder: 'Tu pedido', empty: 'Carrito vacío', total: 'Total', yourName: 'Tu nombre', namePh: 'Ej. Marco', send: 'Enviar pedido', sending: 'Enviando…', startsPaid: 'El pedido inicia tras pagar en caja', notePh: '¿Notas? ej. sin jamón, sin cebolla…', received: '¡Pedido recibido!', toPay: 'Total a pagar', taNum: 'N.º para llevar', goPay: 'Ve a', goPay2: 'caja a pagar', startsAfter: 'El pedido inicia al pagar. 🍽️', again: 'Pedir de nuevo', errSend: 'Error al enviar, inténtalo de nuevo' },
}

/**
 * SelfOrderPage — self-ordering da QR (JP 2026-06-12). Multilingua 5 lingue
 * (JP 2026-06-13). Rotta: /ordina/:slug/:table?
 */
export default function SelfOrderPage() {
  const { slug, table } = useParams()
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('rb_so_lang') || 'it' } catch { return 'it' } })
  const [menu, setMenu] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [cart, setCart] = useState({})
  const [view, setView] = useState('menu')
  const [name, setName] = useState('')
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState(null)
  // JP 2026-06-16: feedback errore IN PAGINA. Prima si usava alert(), che su
  // telefono in modalita' PWA viene ingoiato → l'invio falliva "in silenzio".
  const [sendError, setSendError] = useState('')
  const t = T[lang] || T.it

  useEffect(() => {
    let alive = true
    setLoading(true); setError(false)
    // JP 2026-06-14: asporto (no tavolo) → menu ASPORTO (solo categorie
    // marcate show_on_takeaway). Al tavolo → menu normale del ristorante.
    publicAPI.menu(slug, lang === 'it' ? null : lang, false, !table)
      .then(r => { if (alive) setMenu(r.data) })
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [slug, table, lang])

  const changeLang = (code) => { setLang(code); try { localStorage.setItem('rb_so_lang', code) } catch {} }
  const add = (item) => setCart(c => ({ ...c, [item.id]: { ...(c[item.id] || {}), item, qty: (c[item.id]?.qty || 0) + 1 } }))
  const sub = (id) => setCart(c => {
    const cur = c[id]?.qty || 0
    if (cur <= 1) { const n = { ...c }; delete n[id]; return n }
    return { ...c, [id]: { ...c[id], qty: cur - 1 } }
  })
  const setNote = (id, note) => setCart(c => (c[id] ? { ...c, [id]: { ...c[id], note } } : c))

  const lines = Object.values(cart)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const total = lines.reduce((s, l) => s + l.item.base_price * l.qty, 0)

  const send = async () => {
    if (name.trim().length < 2 || count === 0) return
    setSending(true); setSendError('')
    try {
      const r = await publicAPI.createOrder(slug, {
        order_type: table ? 'table' : 'takeaway',
        table_number: table || undefined,
        customer_name: name.trim(),
        items: lines.map(l => ({ menu_item_id: l.item.id, quantity: l.qty, notes: l.note || '' })),
      })
      setConfirm(r.data); setView('done'); setCart({})
    } catch (e) {
      setSendError(
        e?.response?.status === 429
          ? 'Ordine già inviato! Attendi qualche secondo prima di farne un altro.'
          : (e?.response?.data?.error || t.errSend)
      )
    } finally { setSending(false) }
  }

  return (
    <div className="so-root">
      <style>{CSS}</style>

      <header className="so-head">
        <div className="so-langs">
          {LANGS.map(l => (
            <button key={l.code} className={`so-lang ${lang === l.code ? 'on' : ''}`} onClick={() => changeLang(l.code)}>{l.flag}</button>
          ))}
        </div>
        <div className="so-brand">Riva Beach <span>Salento</span></div>
        <div className="so-sub">{table ? `${t.table} ${table}` : t.takeaway} · {t.sub}</div>
      </header>

      {loading && <div className="so-center"><Loader2 className="so-spin" size={28} /> {t.loading}</div>}
      {error && <div className="so-center">{t.error}</div>}

      {!loading && !error && menu && view === 'menu' && (
        <main className="so-menu">
          {menu.menu.map(cat => (
            <section key={cat.id} className="so-cat">
              <h2 className="so-cat-name">{cat.name}</h2>
              {cat.items.map(item => {
                const qty = cart[item.id]?.qty || 0
                return (
                  <div key={item.id} className="so-item">
                    <div className="so-item-info">
                      <div className="so-item-name">{item.name}</div>
                      {item.description && <div className="so-item-desc">{item.description}</div>}
                      <div className="so-item-price">{formatPrice(item.base_price)}</div>
                    </div>
                    {qty === 0 ? (
                      <button className="so-add" onClick={() => add(item)} aria-label="+"><Plus size={20} strokeWidth={2.5} /></button>
                    ) : (
                      <div className="so-stepper">
                        <button onClick={() => sub(item.id)}><Minus size={16} strokeWidth={2.5} /></button>
                        <span>{qty}</span>
                        <button onClick={() => add(item)}><Plus size={16} strokeWidth={2.5} /></button>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
          <div className="so-foot-note">{t.vat}</div>
        </main>
      )}

      {view === 'cart' && (
        <main className="so-cartview">
          <button className="so-back" onClick={() => setView('menu')}><ArrowLeft size={18} /> {t.keepOrdering}</button>
          <h2 className="so-cart-title">{t.yourOrder}</h2>
          {lines.length === 0 && <div className="so-center">{t.empty}</div>}
          {lines.map(l => (
            <div key={l.item.id} className="so-cart-item">
              <div className="so-cart-row">
                <div className="so-cart-q">{l.qty}×</div>
                <div className="so-cart-n">{l.item.name}</div>
                <div className="so-cart-p">{formatPrice(l.item.base_price * l.qty)}</div>
                <div className="so-stepper sm">
                  <button onClick={() => sub(l.item.id)}><Minus size={14} /></button>
                  <button onClick={() => add(l.item)}><Plus size={14} /></button>
                </div>
              </div>
              <input className="so-note" placeholder={t.notePh} value={l.note || ''} onChange={e => setNote(l.item.id, e.target.value)} maxLength={200} />
            </div>
          ))}
          {lines.length > 0 && (
            <>
              <div className="so-cart-total"><span>{t.total}</span><span>{formatPrice(total)}</span></div>
              <label className="so-name-lbl">{t.yourName}</label>
              <input className="so-name" value={name} onChange={e => setName(e.target.value)} placeholder={t.namePh} maxLength={40} autoComplete="name" />
              {sendError && <div className="so-err-banner">⚠️ {sendError}</div>}
              <button className="so-send" disabled={sending || name.trim().length < 2} onClick={send}>
                {sending ? <><Loader2 className="so-spin" size={18} /> {t.sending}</> : t.send}
              </button>
              <div className="so-foot-note">{t.startsPaid}</div>
            </>
          )}
        </main>
      )}

      {view === 'done' && confirm && (
        <main className="so-done">
          <CheckCircle2 size={64} className="so-done-ico" />
          <h2>{t.received}</h2>
          <p className="so-done-name">{confirm.customer_name}</p>
          <div className="so-done-box">
            <div className="so-done-row"><span>{t.toPay}</span><b>{formatPrice(confirm.total)}</b></div>
            {confirm.takeaway_number && <div className="so-done-row"><span>{t.taNum}</span><b>#{confirm.takeaway_number}</b></div>}
          </div>
          <p className="so-done-cta">{t.goPay} <b>{t.goPay2}</b>.<br/>{t.startsAfter}</p>
          <button className="so-again" onClick={() => { setView('menu'); setConfirm(null) }}>{t.again}</button>
        </main>
      )}

      {view === 'menu' && count > 0 && (
        <button className="so-bar" onClick={() => setView('cart')}>
          <ShoppingCart size={20} />
          <span className="so-bar-count">{count}</span>
          <span className="so-bar-txt">{t.seeOrder}</span>
          <span className="so-bar-total">{formatPrice(total)}</span>
        </button>
      )}
    </div>
  )
}

const CSS = `
.so-root{min-height:100dvh;background:#f6efe1;color:#1a1c20;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding-bottom:90px;max-width:560px;margin:0 auto;}
.so-head{background:#0a2540;color:#fff;padding:12px 18px 16px;text-align:center;position:sticky;top:0;z-index:5;box-shadow:0 2px 10px rgba(0,0,0,.15);}
.so-langs{display:flex;gap:6px;justify-content:center;margin-bottom:8px;}
.so-lang{font-size:18px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:8px;width:34px;height:30px;cursor:pointer;opacity:.55;transition:.15s;}
.so-lang.on{opacity:1;background:rgba(212,175,55,.3);border-color:#d4af37;}
.so-brand{font-family:Georgia,Times,serif;font-size:24px;font-weight:700;letter-spacing:.5px;}
.so-brand span{color:#d4af37;}
.so-sub{font-size:12.5px;opacity:.8;margin-top:3px;letter-spacing:.3px;}
.so-center{text-align:center;padding:48px 20px;color:#6b6a64;display:flex;flex-direction:column;align-items:center;gap:10px;}
.so-spin{animation:sospin 1s linear infinite;}@keyframes sospin{to{transform:rotate(360deg);}}
.so-menu{padding:8px 14px;}
.so-cat{margin-top:18px;}
.so-cat-name{font-family:Georgia,serif;font-size:19px;color:#0a2540;margin:0 0 8px;padding-bottom:5px;border-bottom:2px solid #d4af37;}
.so-item{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #e7ddc8;}
.so-item-info{flex:1;min-width:0;}
.so-item-name{font-weight:600;font-size:15px;line-height:1.25;}
.so-item-desc{font-size:12.5px;color:#6b6a64;margin-top:2px;font-style:italic;line-height:1.3;}
.so-item-price{font-weight:700;color:#1c5b86;font-size:14.5px;margin-top:4px;}
.so-add{flex-shrink:0;width:40px;height:40px;border-radius:50%;border:none;background:#1c5b86;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 6px rgba(28,91,134,.35);}
.so-add:active{transform:scale(.9);}
.so-stepper{flex-shrink:0;display:flex;align-items:center;gap:10px;background:#0a2540;border-radius:999px;padding:4px;}
.so-stepper button{width:30px;height:30px;border-radius:50%;border:none;background:#1c5b86;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;}
.so-stepper span{color:#fff;font-weight:700;min-width:18px;text-align:center;font-size:15px;}
.so-stepper.sm{background:transparent;gap:6px;}
.so-stepper.sm button{width:28px;height:28px;background:#e7ddc8;color:#0a2540;}
.so-foot-note{text-align:center;font-size:12px;color:#9a937f;padding:20px 0 8px;}
.so-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:14px;width:calc(100% - 28px);max-width:532px;background:#0a2540;color:#fff;border:none;border-radius:14px;padding:15px 18px;display:flex;align-items:center;gap:12px;cursor:pointer;box-shadow:0 6px 20px rgba(10,37,64,.4);z-index:10;}
.so-bar-count{background:#d4af37;color:#0a2540;font-weight:800;border-radius:999px;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;padding:0 6px;}
.so-bar-txt{flex:1;text-align:left;font-weight:600;font-size:15px;}
.so-bar-total{font-weight:800;font-size:16px;}
.so-cartview{padding:16px;}
.so-back{background:none;border:none;color:#1c5b86;font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 0;margin-bottom:6px;}
.so-cart-title{font-family:Georgia,serif;font-size:22px;color:#0a2540;margin:4px 0 14px;}
.so-cart-item{border-bottom:1px solid #e7ddc8;padding:4px 0;}
.so-cart-row{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:10px;padding:9px 0 4px;}
.so-cart-q{font-weight:700;color:#1c5b86;}
.so-cart-n{font-size:14.5px;font-weight:500;}
.so-cart-p{font-weight:700;font-size:14px;}
.so-note{width:100%;box-sizing:border-box;margin:0 0 8px;padding:8px 10px;border:1.5px dashed #c9b48e;border-radius:9px;font-size:13px;background:#fff;outline:none;color:#1a1c20;}
.so-note:focus{border-color:#1c5b86;border-style:solid;}
.so-note::placeholder{color:#b3a98f;}
.so-cart-total{display:flex;justify-content:space-between;font-size:20px;font-weight:800;color:#0a2540;padding:16px 0;margin-top:4px;border-top:2px solid #0a2540;}
.so-name-lbl{display:block;font-size:13px;font-weight:600;color:#6b6a64;margin:6px 0 6px;}
.so-name{width:100%;box-sizing:border-box;padding:14px;border:2px solid #c9b48e;border-radius:12px;font-size:16px;background:#fff;outline:none;}
.so-name:focus{border-color:#1c5b86;}
.so-send{width:100%;margin-top:16px;background:#1c5b86;color:#fff;border:none;border-radius:14px;padding:17px;font-size:17px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(28,91,134,.35);}
.so-send:disabled{opacity:.5;}
.so-err-banner{margin-top:12px;background:#fdecea;border:1.5px solid #e57373;color:#b3261e;border-radius:12px;padding:12px 14px;font-size:14px;font-weight:600;text-align:center;}
.so-done{padding:48px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;}
.so-done-ico{color:#15803d;margin-bottom:8px;}
.so-done h2{font-family:Georgia,serif;font-size:26px;color:#0a2540;margin:6px 0;}
.so-done-name{font-size:18px;color:#1c5b86;font-weight:600;margin:0 0 18px;}
.so-done-box{width:100%;max-width:300px;background:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 2px 8px rgba(0,0,0,.08);}
.so-done-row{display:flex;justify-content:space-between;font-size:15px;padding:5px 0;}
.so-done-cta{font-size:16px;line-height:1.5;color:#1a1c20;margin:22px 0;}
.so-again{background:#0a2540;color:#fff;border:none;border-radius:12px;padding:13px 28px;font-size:15px;font-weight:600;cursor:pointer;}
`
