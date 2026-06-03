import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Wifi, WifiOff, RefreshCw, ChefHat, CheckCircle2, Clock,
  LayoutDashboard, Package, LogOut, Volume2, VolumeX, UtensilsCrossed, History, Wine,
} from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { kdsAPI, barAPI, workflowAPI, wineAPI } from '../lib/api'
import { formatElapsed, elapsedMinutes } from '../lib/utils'
import { Card, Badge } from '../components/v2'
import { playNewOrderBeep, isSoundEnabled, toggleSound } from '../lib/kdsBeep'
import AbbinaPanel from '../components/AbbinaPanel'

// ─── Status config (tokens Riva) ─────────────────────────────────────────────
// pending=warn (giallo), cooking=terracotta (arancio caldo), ready=ok (verde)
// oven_done=sea (blu) → solo pizza, fase intermedia tra cottura e impiattamento
const ITEM_STATUS = {
  pending: {
    label: 'Da fare',
    bg: 'bg-[var(--color-warn-soft)]',
    border: 'border-[var(--color-warn)]/50',
    text: 'text-[var(--color-warn)]',
    // JP 2026-06-01: "togli IN LAVORAZIONE, metti START".
    // 1° tap: il cuoco INIZIA a cuocere il piatto.
    next: 'cooking',
    nextLabel: 'START',
    nextBtn: 'bg-[var(--color-terracotta)] hover:brightness-110 text-white',
  },
  cooking: {
    label: 'IN COTTURA',
    bg: 'bg-[var(--color-terracotta-soft)]',
    border: 'border-[var(--color-terracotta)]/50',
    text: 'text-[var(--color-terracotta)]',
    // JP 2026-06-01: "quando e' finito, chiama cameriere".
    // 2° tap: piatto pronto → notifica il cameriere per il ritiro.
    next: 'ready',
    nextLabel: 'CHIAMA CAMERIERE',
    nextBtn: 'bg-[var(--color-ok)] hover:brightness-110 text-white',
  },
  // Fase intermedia solo per pizza: sfornata, in attesa di impiattamento.
  // Visualizzato in blu, pulsante "Impiatta" verde porta a ready.
  oven_done: {
    label: 'Sfornata',
    bg: 'bg-[var(--color-sea-soft)]',
    border: 'border-[var(--color-sea)]/50',
    text: 'text-[var(--color-sea)]',
    next: 'ready',
    nextLabel: 'Impiatta',
    nextBtn: 'bg-[var(--color-ok)] hover:brightness-110 text-white',
  },
  ready: {
    label: 'PRONTO',
    bg: 'bg-[var(--color-ok-soft)]',
    border: 'border-[var(--color-ok)]/50',
    text: 'text-[var(--color-ok)]',
    // Dopo "Pronto" lo chef non fa piu' nulla: la comanda resta verde sul KDS
    // e sparisce da sola quando il cameriere segna servito dal suo dispositivo.
    next: null,
    nextLabel: null,
    nextBtn: null,
  },
}

// Soglie tempo: <10 min ok, 10-20 warn, >20 err
function elapsedTone(minutes) {
  if (minutes < 10) return 'ok'
  if (minutes < 20) return 'warn'
  return 'err'
}

function ElapsedTick({ sentAt }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])
  const mins = elapsedMinutes(sentAt)
  const tone = elapsedTone(mins)
  return (
    <span className={`text-xs flex items-center gap-1 tnum font-semibold ${
      tone === 'ok'   ? 'text-[var(--color-ok)]'   :
      tone === 'warn' ? 'text-[var(--color-warn)]' :
                        'text-[var(--color-err)]'
    }`}>
      <Clock size={11} /> {formatElapsed(sentAt)}
    </span>
  )
}

// Header nav button (riusa pattern)
function NavButton({ icon: Icon, label, onClick, hoverColor = 'gold' }) {
  const HOVER = {
    gold: 'hover:text-[var(--color-gold)]',
    warn: 'hover:text-[var(--color-warn)]',
  }
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-[var(--color-text-2)] ${HOVER[hoverColor]} hover:bg-[rgba(255,255,255,0.04)] transition text-xs px-2 py-1.5 rounded-lg`}
    >
      <Icon size={13} /> {label}
    </button>
  )
}

/**
 * KDSPage — coda comande con stati pending/cooking/ready.
 *
 * Props:
 *   - mode:    'kitchen' (default) o 'bar'
 *   - station: opzionale. Se passato (route dedicata /kds/pizzeria) forza
 *              quella stazione. Se NON passato (route /kds generica), l'utente
 *              sceglie la stazione dal picker (persistito per device in
 *              localStorage). Stazioni reali Riva: all, frittura,
 *              primi_secondi, antipasti, pizzeria, pasticceria.
 */
const STATION_TITLES = {
  all:           'KDS Cucina',
  cucina:        'KDS Cucina',
  frittura:      'KDS Frittura',
  primi_secondi: 'KDS Primi + Secondi',
  antipasti:     'KDS Antipasti',
  pizzeria:      'KDS Pizzeria/Panini',
  pasticceria:   'KDS Pasticceria',
}
// Pills picker: stazioni reali cucina Riva.
const STATION_PICKER = [
  { id: 'all',           label: 'Tutte' },
  { id: 'frittura',      label: 'Frittura' },
  { id: 'primi_secondi', label: 'Primi+Secondi' },
  { id: 'antipasti',     label: 'Antipasti' },
  { id: 'pizzeria',      label: 'Pizzeria/Panini' },
  { id: 'pasticceria',   label: 'Pasticceria' },
]
const STATION_LS_KEY = 'gustopro_kds_station'

export default function KDSPage({ mode = 'kitchen', station: stationProp = null, emphasize = null }) {
  const isBar = mode === 'bar'
  // emphasize='pizzeria' (schermo Simone): pizze GRANDI, resto cucina piccolo.
  // default (cucina): pizze PICCOLE (awareness), resto grande.
  const focusPizza = emphasize === 'pizzeria'
  // Station: prop (route dedicata) ha priorita'. Altrimenti URL ?station=X
  // (utile per sub_role kitchen senza route dedicata), poi localStorage,
  // altrimenti 'all'. Picker visibile solo se station NON forzata da prop.
  const [stationSel, setStationSel] = useState(() => {
    if (stationProp) return stationProp
    try {
      const qsStation = new URLSearchParams(window.location.search).get('station')
      const VALID = ['all','cucina','frittura','primi','secondi','primi_secondi','antipasti','pizzeria','pasticceria','crudi']
      if (qsStation && VALID.includes(qsStation)) {
        localStorage.setItem(STATION_LS_KEY, qsStation)
        return qsStation
      }
      return localStorage.getItem(STATION_LS_KEY) || 'all'
    } catch { return 'all' }
  })
  const station = stationProp || stationSel
  const showPicker = !isBar && !stationProp
  const changeStation = (s) => {
    setStationSel(s)
    try { localStorage.setItem(STATION_LS_KEY, s) } catch {}
  }
  const pageTitle = isBar ? 'Bar' : (STATION_TITLES[station] || 'KDS Cucina')
  // Wrapper attorno a kdsAPI.pending(station) per non passare il param ovunque
  const dataAPI = isBar ? barAPI : {
    pending: () => kdsAPI.pending(station),
    updateItemStatus: kdsAPI.updateItemStatus,
  }

  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()
  const { toast } = useToast()
  const { user, logout } = useAuth()
  const [orders, setOrders] = useState([])
  const [crossmatches, setCrossmatches] = useState([])
  const [waitingItems, setWaitingItems] = useState([]) // preview "in arrivo"
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState({})
  const loadedRef = useRef(false)
  const updatingRef = useRef({})
  // Set degli orderId arrivati negli ultimi 8s → mostrare flash oro
  const [recentOrderIds, setRecentOrderIds] = useState(() => new Set())
  // Toggle audio: stato React + LocalStorage. Default 'on'.
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled())
  const handleToggleSound = () => setSoundOn(toggleSound())

  const loadOrders = useCallback(async () => {
    try {
      // Bar mode: niente crossmatches/waiting (sono concetti specifici della cucina).
      const pendingCall = isBar ? barAPI.pending() : kdsAPI.pending(station)
      const [ordersRes, crossRes, waitingRes] = await Promise.all([
        pendingCall,
        isBar ? Promise.resolve({ data: [] }) : workflowAPI.getCrossmatches().catch(() => ({ data: [] })),
        isBar ? Promise.resolve({ data: [] }) : workflowAPI.getWaiting().catch(() => ({ data: [] })),
      ])
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : [])
      setCrossmatches(Array.isArray(crossRes.data) ? crossRes.data : [])
      setWaitingItems(Array.isArray(waitingRes.data) ? waitingRes.data : [])
    } catch {
      // keep existing data
    } finally {
      setLoading(false)
    }
  }, [isBar, station])

  // Render-safe combo selections: gestisce sia format nuovo {course: name|names[]}
  // che format legacy [{menu_item_id: "..."}] (pre-Phase 2).
  const formatComboSelections = (sel) => {
    if (!sel) return []
    // Legacy: array di {menu_item_id} senza nomi → mostriamo il count
    if (Array.isArray(sel)) {
      const valid = sel.filter(s => s && typeof s === 'object')
      if (valid.length === 0) return []
      return [{ course: 'Selezione menù', label: `${valid.length} portate (legacy)` }]
    }
    // Nuovo: { courseName: itemName | [itemNames] }
    if (typeof sel === 'object') {
      return Object.entries(sel).map(([course, value]) => {
        let label = '—'
        if (Array.isArray(value)) {
          label = value.map(v => typeof v === 'string' ? v : '').filter(Boolean).join(', ')
        } else if (typeof value === 'string' || typeof value === 'number') {
          label = String(value)
        }
        return { course: String(course), label }
      })
    }
    return []
  }

  useEffect(() => {
    if (!loadedRef.current) { loadedRef.current = true; loadOrders() }
  }, [loadOrders])

  // Re-fetch quando cambia la stazione selezionata (picker).
  useEffect(() => {
    if (loadedRef.current) { setLoading(true); loadOrders() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station])

  // Socket real-time updates
  useEffect(() => {
    if (!socket) return

    const onNewOrder = (payload) => {
      // Beep audio (no-op se utente ha disattivato)
      playNewOrderBeep()
      // Flash visivo sulla card del nuovo ordine per 8s
      const orderId = payload?.orderId || payload?.id
      if (orderId) {
        setRecentOrderIds((prev) => {
          const next = new Set(prev)
          next.add(orderId)
          return next
        })
        setTimeout(() => {
          setRecentOrderIds((prev) => {
            const next = new Set(prev)
            next.delete(orderId)
            return next
          })
        }, 8000)
      }
      loadOrders()
    }
    const onItemAdded = () => loadOrders()
    // JP 2026-06-01: il backend emette 'pizza-added' quando spinge una nuova
    // pizza al pizzaiolo (sia su new-order che su addItems). Simone (focusPizza)
    // suona il beep su quell'evento, cosi' sente immediatamente la pizza anche
    // se e' stata AGGIUNTA a un ordine gia' aperto.
    const onPizzaAdded = () => {
      if (focusPizza) {
        try { playNewOrderBeep() } catch {}
      }
      loadOrders()
    }

    const onItemUpdated = ({ orderId, itemId, status }) => {
      setOrders(prev => {
        const updated = prev.map(order => {
          if (order.order_id !== orderId) return order
          const newItems = order.items.map(it =>
            it.id === itemId ? { ...it, status } : it
          )
          // JP 2026-05-29: la comanda deve restare visibile in cucina (anche
          // con voci in PRONTO) fino a che il cameriere non fa SERVITO.
          // Solo allora sparisce. Quindi consideriamo "active" tutto cio' che
          // NON e' served/cancelled (incluso 'ready').
          const active = newItems.filter(it => it.status !== 'served' && it.status !== 'cancelled')
          if (active.length === 0) return null
          return { ...order, items: newItems }
        })
        return updated.filter(Boolean)
      })
    }

    const onWorkflowChanged = () => loadOrders()

    socket.on('new-order', onNewOrder)
    socket.on('order-item-added', onItemAdded)
    socket.on('pizza-added', onPizzaAdded)
    socket.on('item-status-updated', onItemUpdated)
    socket.on('workflow-status-changed', onWorkflowChanged)
    socket.on('item-released-to-production', onWorkflowChanged)

    const onReconnect = () => loadOrders()
    socket.on('connect', onReconnect)

    return () => {
      socket.off('new-order', onNewOrder)
      socket.off('order-item-added', onItemAdded)
      socket.off('pizza-added', onPizzaAdded)
      socket.off('item-status-updated', onItemUpdated)
      socket.off('workflow-status-changed', onWorkflowChanged)
      socket.off('item-released-to-production', onWorkflowChanged)
      socket.off('connect', onReconnect)
    }
  }, [socket, loadOrders])

  // Fallback polling 15s
  useEffect(() => {
    const interval = setInterval(() => {
      if (Object.keys(updatingRef.current).length === 0) loadOrders()
    }, 15000)
    return () => clearInterval(interval)
  }, [loadOrders])

  const handleAdvance = async (itemId, nextStatus) => {
    if (!nextStatus) return
    setUpdating(prev => { const n = { ...prev, [itemId]: true }; updatingRef.current = n; return n })

    // Optimistic update — vedi commento su onItemUpdated: la comanda resta
    // visibile in cucina anche dopo PRONTO, sparisce solo quando il cameriere
    // fa SERVITO (status=served).
    setOrders(prev => {
      const updated = prev.map(order => {
        const newItems = order.items.map(it => it.id === itemId ? { ...it, status: nextStatus } : it)
        const active = newItems.filter(it => it.status !== 'served' && it.status !== 'cancelled')
        if (active.length === 0) return null
        return { ...order, items: newItems }
      })
      return updated.filter(Boolean)
    })

    try {
      await dataAPI.updateItemStatus(itemId, nextStatus)
    } catch {
      toast({ type: 'error', title: 'Errore aggiornamento stato' })
      loadOrders()
    } finally {
      setUpdating(prev => { const n = { ...prev }; delete n[itemId]; updatingRef.current = n; return n })
    }
  }

  const pendingCount = orders.reduce((sum, o) =>
    sum + o.items.filter(i => i.status === 'pending').length, 0)
  const cookingCount = orders.reduce((sum, o) =>
    sum + o.items.filter(i => i.status === 'cooking').length, 0)

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)]">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-20">
        {/* Back button: NON mostrato se questa pagina e' la "home" del ruolo
            (kitchen → /kds, bartender → /bar). Per gli altri (admin/manager
            che navigano qui da admin-home) torna ad admin-home, mai a /admin
            che non esiste come route (bug 2026-05-19 segnalato in test reale).
            Per waiter sala su KDS → /tables. */}
        {(() => {
          const isKitchenHome = user?.role === 'kitchen'
          const isBartenderHome = isBar && user?.role === 'waiter' &&
            (user?.sub_role === 'bar' || user?.sub_role === 'bar/caffetteria')
          if (isKitchenHome || isBartenderHome) return null

          // Destinazione del back: admin/manager → admin-home; altri → /tables
          const backTo = ['admin','manager'].includes(user?.role) ? '/admin-home' : '/tables'
          return (
            <button
              onClick={() => navigate(backTo)}
              className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
              aria-label="Indietro"
            >
              <ArrowLeft size={18} />
            </button>
          )
        })()}
        <ChefHat size={20} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          {pageTitle}
        </h1>

        {/* Stats live */}
        <div className="flex items-center gap-2 text-xs ml-2">
          <Badge tone="warn" size="sm">{pendingCount} in attesa</Badge>
          <Badge tone="terracotta" size="sm">{cookingCount} in prep.</Badge>
          <span className="text-[var(--color-text-3)] text-[11px] tnum">
            {orders.length} ordini
          </span>
        </div>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-2">
          {/* Bar mode: pulsante "Tavoli" per accedere alla mappa (bartender
              puo' cliccare un tavolo → modal bevande di quel tavolo). */}
          {isBar && (
            <NavButton icon={UtensilsCrossed} label="Tavoli" hoverColor="gold" onClick={() => navigate('/tables')} />
          )}
          {/* Sprint 10: bevandista chiama sommelier per servizio vino. */}
          {isBar && (
            <NavButton icon={Wine} label="Chiama Vino" hoverColor="gold" onClick={async () => {
              try {
                await wineAPI.call(null, 'Richiesta dal bar')
                toast({ type: 'success', title: '🍷 Sommelier chiamato', message: 'In arrivo al banco' })
              } catch {
                toast({ type: 'error', title: 'Errore chiamata vino' })
              }
            }} />
          )}
          {/* Storico: visibile sia kitchen che bar */}
          <NavButton icon={History} label="Storico" hoverColor="gold" onClick={() => navigate('/kds/history')} />
          {/* Attese/waiting-monitor e' kitchen-only — bar non lo usa */}
          {!isBar && (
            <NavButton icon={Clock} label="Attese" hoverColor="warn" onClick={() => navigate('/waiting-monitor')} />
          )}
          {['admin', 'manager'].includes(user?.role) && (
            <>
              <NavButton icon={LayoutDashboard} label="Dashboard" onClick={() => navigate('/dashboard')} />
              <NavButton icon={Package} label="Inventario" onClick={() => navigate('/inventory')} />
            </>
          )}
          <button
            onClick={handleToggleSound}
            title={soundOn ? 'Audio attivo (click per disattivare)' : 'Audio disattivo (click per attivare)'}
            aria-label={soundOn ? 'Disattiva audio' : 'Attiva audio'}
            className={`p-1.5 rounded-lg transition ${
              soundOn
                ? 'text-[var(--color-gold)] hover:bg-[rgba(212,175,55,0.08)]'
                : 'text-[var(--color-text-3)] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={loadOrders}
            className="text-[var(--color-text-2)] hover:text-[var(--color-gold)] transition p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)]"
            aria-label="Ricarica"
          >
            <RefreshCw size={14} />
          </button>
          <Badge
            tone={isConnected ? 'ok' : 'err'}
            size="sm"
            leftIcon={isConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          >
            {isConnected ? 'Live' : 'Offline'}
          </Badge>
          {user?.role === 'kitchen' && (
            <button
              onClick={logout}
              title="Logout"
              className="text-[var(--color-text-3)] hover:text-[var(--color-err)] hover:bg-[rgba(239,68,68,0.08)] rounded-lg p-2 transition"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </header>

      {/* Station picker: ogni tablet cucina sceglie la propria stazione
          (frittura, primi+secondi, antipasti, pizzeria, pasticceria) o
          "Tutte". Persistito per device in localStorage. Visibile solo
          su /kds generico (non sulle route dedicate /kds/pizzeria). */}
      {showPicker && (
        <div className="bg-[var(--color-surface-2)] border-b border-[var(--color-border-soft)] px-3 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)] font-semibold mr-1 shrink-0">Stazione</span>
          {STATION_PICKER.map(s => (
            <button
              key={s.id}
              onClick={() => changeStation(s.id)}
              className={`shrink-0 px-3 py-1 rounded-md text-xs font-semibold transition ${
                station === s.id
                  ? 'bg-[var(--color-gold)] text-[#13181C]'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-2)] border border-[var(--color-border-soft)] hover:text-[var(--color-text)]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* AbbinaPanel disabilitato JP 2026-06-02 ("toglimi gli incroci al KDS").
          Componente ancora importato per riattivazione futura senza rimuovere
          le sue dipendenze. Per riabilitarlo decommentare il blocco sotto. */}
      {false && !isBar && (
        <AbbinaPanel station={station} socket={socket} onUpdate={loadOrders} />
      )}

      {/* ─── Content ─────────────────────────────────────────── */}
      <div className="flex-1 p-4 overflow-auto">

        {loading && (
          <div className="flex items-center justify-center h-64 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={20} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento ordini cucina…</span>
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <CheckCircle2 size={56} className="text-[var(--color-ok)]/40" />
            <p className="serif text-[var(--color-text-2)] text-lg font-bold">Nessun ordine in coda</p>
            <p className="text-[var(--color-text-3)] text-xs">La cucina è in pari · ottimo lavoro!</p>
          </div>
        )}

        {/* Sezione "IN ARRIVO" rimossa su richiesta: lo chef vede solo le
            comande da fare, niente anteprime. */}

        {/* Incroci disabilitati JP 2026-06-02 ("toglimi gli incroci al KDS").
            Per riattivare: cambia false in true. */}
        {false && !loading && crossmatches.length > 0 && (
          <Card variant="elevated" padding="md" className="mb-4 border-[var(--color-park)]/40">
            <div className="flex items-center gap-2 mb-3">
              <Badge tone="park" solid>INCROCI</Badge>
              <span className="text-[var(--color-text-3)] text-xs">
                Piatti uguali su più tavoli — ottimizza la produzione
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {crossmatches.map((cm, idx) => {
                // Difensivo: cast tutti i campi a primitive
                const id = String(cm?.menu_item_id ?? `cm-${idx}`)
                const name = String(cm?.item_name ?? 'Piatto')
                const qty = String(cm?.total_quantity ?? 0)
                const tables = Array.isArray(cm?.orders)
                  ? cm.orders.map(o => String(o?.table_number ?? '')).filter(Boolean).join(', ')
                  : ''
                return (
                  <div
                    key={id}
                    className="bg-[var(--color-park-soft)] border border-[var(--color-park)]/30 rounded-lg px-3 py-2 flex items-center gap-2"
                  >
                    <span className="text-[var(--color-text)] text-sm font-bold">{name}</span>
                    <span className="text-[var(--color-park)] text-xs font-bold tnum">
                      {qty}×
                    </span>
                    {tables && (
                      <span className="text-[var(--color-text-3)] text-[10px]">
                        ({tables})
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <AnimatePresence>
              {orders.map(order => {
                // Schermo Simone: salta gli ordini SENZA pizza (non lo riguardano).
                if (focusPizza && !order.items.some(it => (it.prep_station || 'cucina') === 'pizzeria')) return null
                const oldest = order.items.reduce((min, it) =>
                  !min || new Date(it.sent_at) < new Date(min) ? it.sent_at : min, null)
                const mins = elapsedMinutes(oldest)
                const urgency = elapsedTone(mins) // ok | warn | err
                const isFresh = recentOrderIds.has(order.order_id) // 8s gold flash post-arrival
                // Conteggio piatti della comanda (somma quantita', esclusi i gia'
                // consegnati). Mostrato in GRANDE: il cuoco capisce a colpo d'occhio
                // se e' 1 piatto o una comanda da 8.
                const totalPlates = order.items.reduce((s, it) =>
                  it.display_status === 'delivered' ? s : s + Number(it.quantity || 1), 0)

                return (
                  <motion.div
                    key={order.order_id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className={`bg-[var(--color-surface)] rounded-xl border-2 flex flex-col overflow-hidden ${
                      // Priorità: isFresh (8s post-arrival) → halo oro pulsante,
                      // poi urgency rosso/giallo, infine border soft.
                      isFresh ? 'border-[var(--color-gold)] shadow-[0_0_0_4px_rgba(212,175,55,0.25)] animate-[pulse-gold_1.4s_ease-in-out_infinite]' :
                      urgency === 'err'  ? 'border-[var(--color-err)]/60 animate-[pulse-err_2.4s_ease-in-out_infinite]' :
                      urgency === 'warn' ? 'border-[var(--color-warn)]/40' :
                                            'border-[var(--color-border-soft)]'
                    }`}
                  >

                    {/* Order header (urgency tinted) */}
                    <div className={`px-3 py-2 flex items-center justify-between ${
                      urgency === 'err'  ? 'bg-[var(--color-err-soft)]'  :
                      urgency === 'warn' ? 'bg-[var(--color-warn-soft)]' :
                                            'bg-[var(--color-surface-2)]'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {order.order_type === 'takeaway' ? (
                          <div className="flex flex-col min-w-0">
                            <Badge tone="warn" size="sm">ASPORTO</Badge>
                            {order.order_customer_name && (
                              <span className="text-[var(--color-text-2)] text-xs truncate mt-1">
                                {order.order_customer_name}
                              </span>
                            )}
                            {order.pickup_time && (
                              <span className="text-[var(--color-gold)] text-xs font-semibold tnum">
                                ⏱ {order.pickup_time.slice(0, 5)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <>
                            <span className="serif text-[var(--color-text)] font-extrabold text-4xl tnum leading-none">
                              {order.table_number}
                            </span>
                            <span className="text-[var(--color-text-2)] text-xs font-semibold">{order.zone_name}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Conteggio piatti — PICCOLO (JP 2026-05-29: era grande
                            e si confondeva col numero del tavolo). Pill compatto. */}
                        {totalPlates > 0 && (
                          <div className="flex items-center gap-1 rounded-md bg-[var(--color-gold-soft)] text-[var(--color-gold)] px-1.5 py-0.5 leading-none">
                            <span className="text-xs font-bold tnum">{totalPlates}</span>
                            <span className="text-[8px] font-semibold tracking-wider">{totalPlates === 1 ? 'PIATTO' : 'PIATTI'}</span>
                          </div>
                        )}
                        <ElapsedTick sentAt={oldest} />
                      </div>
                    </div>

                    {/* Items: gerarchia visiva active > waiting > delivered */}
                    <div className="flex-1 p-3 flex flex-col gap-1.5">
                      {order.items.map(item => {
                        const cfg = ITEM_STATUS[item.status] ?? ITEM_STATUS.pending
                        const isUpdating = updating[item.id]
                        const ds = item.display_status || 'active'

                        // ── PIATTO DI UN ALTRO REPARTO — piccolo, solo per sapere ──
                        // Cucina vede le pizze piccole; Simone (focusPizza) vede la
                        // cucina piccola. Solo in vista 'Tutte'.
                        const itemStation = item.prep_station || 'cucina'
                        const isMine = focusPizza ? itemStation === 'pizzeria' : itemStation !== 'pizzeria'
                        if (station === 'all' && !isMine) {
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 px-2 py-1 rounded border border-[var(--color-border-soft)] bg-[var(--color-surface-2)]/40 opacity-70"
                            >
                              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-3)] shrink-0">
                                {focusPizza ? 'CUCINA' : '🍕 PIZZA'}
                              </span>
                              <span className="text-[var(--color-text-2)] text-xs truncate">
                                {item.quantity > 1 ? `×${item.quantity} ` : ''}{item.name}
                              </span>
                              <span className="ml-auto text-[9px] text-[var(--color-text-3)] shrink-0">{cfg.label}</span>
                            </div>
                          )
                        }

                        // ── DELIVERED (c) — minimo impatto visivo ──
                        if (ds === 'delivered') {
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 px-2 py-0.5 opacity-30"
                            >
                              <span className="text-[9px] font-mono text-[var(--color-text-3)]">c</span>
                              <span className="text-[var(--color-text-3)] text-[10px] line-through">
                                {item.quantity > 1 ? `×${item.quantity} ` : ''}{item.name}
                              </span>
                            </div>
                          )
                        }

                        // ── WAITING (ATTESA) — JP 2026-06-02: BEN EVIDENZIATO.
                        // Lo chef deve vederla a colpo d'occhio: bordo spesso
                        // giallo + sfondo tinto + ring pulsante + nome grande.
                        if (ds === 'waiting') {
                          const minsToFire = item.fire_at
                            ? Math.max(0, Math.round((new Date(item.fire_at).getTime() - Date.now()) / 60000))
                            : null
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-[var(--color-warn)] bg-[var(--color-warn-soft)]/60 shadow-[0_0_0_2px_rgba(212,175,55,0.18)]"
                            >
                              <span className="px-2 py-0.5 rounded-md bg-[var(--color-warn)] text-black text-xs font-extrabold tracking-widest shrink-0 animate-pulse">
                                ⏳ ATTESA
                              </span>
                              {minsToFire !== null && (
                                <span className="px-2 py-0.5 rounded-md bg-[var(--color-sea)] text-white text-xs font-bold tnum shrink-0">
                                  ⏰ {minsToFire}m
                                </span>
                              )}
                              <span className="text-[var(--color-text)] text-lg font-bold">
                                {item.quantity > 1 ? `×${item.quantity} ` : ''}{item.name}
                              </span>
                              {item.course_type && (
                                <span className="ml-auto text-[10px] text-[var(--color-text-3)] italic uppercase tracking-wider">
                                  {item.course_type}
                                </span>
                              )}
                            </div>
                          )
                        }

                        // ── ACTIVE — da eseguire ORA (grande, dominante) ──
                        return (
                          <div
                            key={item.id}
                            className={`rounded-lg border-2 p-2.5 flex flex-col gap-2 ${cfg.bg} ${cfg.border}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Quantita' SEMPRE visibile: ×1, ×2, ×3… (mai confusione) */}
                                  <span className="text-[var(--color-gold)] tnum font-extrabold text-3xl leading-none shrink-0">×{item.quantity}</span>
                                  <span className="text-[var(--color-text)] font-extrabold text-xl uppercase tracking-wide leading-tight">
                                    {item.name}
                                  </span>
                                  {item.is_combo && (
                                    <Badge tone="gold" size="sm">MENU</Badge>
                                  )}
                                  {item.course_type && item.course_type !== 'altro' && (
                                    <Badge tone="neutral" size="sm">{item.course_type}</Badge>
                                  )}
                                </div>
                                {item.is_combo && item.combo_selections && (
                                  <div className="mt-1 flex flex-col gap-0.5">
                                    {formatComboSelections(item.combo_selections).map((c, i) => (
                                      <p key={`${c.course}-${i}`} className="text-[var(--color-text-2)] text-xs">
                                        <span className="text-[var(--color-text-3)]">{c.course}:</span>{' '}
                                        {c.label}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {!item.is_combo && item.modifiers?.length > 0 && (
                                  <p className="text-[var(--color-text-2)] text-sm mt-0.5 font-semibold">
                                    {item.modifiers.join(', ')}
                                  </p>
                                )}
                                {item.notes && (
                                  // JP 2026-06-02: la nota cliente deve essere
                                  // grande quasi quanto il nome del piatto,
                                  // cosi' lo chef non rischia di ignorarla.
                                  <p className="text-[var(--color-warn)] text-xl mt-1 italic font-extrabold leading-tight bg-[var(--color-warn-soft)]/70 px-2 py-1 rounded inline-block">
                                    ⚠ {item.notes}
                                  </p>
                                )}
                                {/* Crudi: badge sicurezza alimentare. Anche se mostrati
                                    con gli antipasti, devono saltare la fila (freschezza). */}
                                {item.requires_preallerta && (
                                  <p className="text-[var(--color-sea)] text-sm mt-0.5 font-bold flex items-center gap-1">
                                    🦪 CRUDO — priorità freschezza
                                  </p>
                                )}
                                {/* Kit utensili al pass: astice→schiaccianoci, granchio→pinza, ecc.
                                    Mostrato in arancione per attirare attenzione: il cameriere
                                    DEVE portare il kit prima di arrivare al tavolo. */}
                                {Array.isArray(item.required_kit) && item.required_kit.length > 0 && (
                                  <p className="text-[var(--color-gold)] text-sm mt-0.5 font-bold flex items-center gap-1">
                                    🛠️ Kit: {item.required_kit.join(' · ')}
                                  </p>
                                )}
                                {/* Sprint 8: hint priorita' cottura.
                                    cooking_modes.start_early_min → cottura lunga, anticipare.
                                    cooking_modes.notes → dettaglio per chef. */}
                                {item.cooking_modes && (item.cooking_modes.start_early_min || item.cooking_modes.notes) && (
                                  <p className="text-[var(--color-warn)] text-[10px] mt-0.5 font-semibold flex items-center gap-1">
                                    ⏱️ {item.cooking_modes.start_early_min ? `Inizia subito (cottura ${item.cooking_modes.default || item.cooking_modes.per_kg}min` : ''}
                                    {item.cooking_modes.start_early_min ? `, anticipa ${item.cooking_modes.start_early_min}min)` : ''}
                                    {item.cooking_modes.notes && ` — ${item.cooking_modes.notes}`}
                                  </p>
                                )}
                              </div>
                              <span className={`text-base font-bold whitespace-nowrap ${cfg.text}`}>
                                {cfg.label}
                              </span>
                            </div>

                            {(() => {
                              // Flusso unico per tutti: Da fare → IN LAVORAZIONE → PRONTO.
                              let nextStatus = cfg.next
                              let nextLabel = cfg.nextLabel
                              const btnColor = nextStatus === 'ready'
                                ? 'bg-[var(--color-ok)] hover:brightness-110 text-white'
                                : nextStatus === 'oven_done'
                                  ? 'bg-[var(--color-sea)] hover:brightness-110 text-white'
                                  : nextStatus === 'served'
                                    ? 'bg-[var(--color-sea)] hover:brightness-110 text-white'
                                    : 'bg-[var(--color-terracotta)] hover:brightness-110 text-white'

                              return nextStatus && (
                                <button
                                  onClick={() => handleAdvance(item.id, nextStatus)}
                                  disabled={isUpdating}
                                  className={`w-full py-2.5 rounded-lg text-lg font-extrabold uppercase tracking-wide transition flex items-center justify-center gap-1 ${btnColor} disabled:opacity-50 min-h-[48px]`}
                                >
                                  {isUpdating
                                    ? <RefreshCw size={22} className="animate-spin" />
                                    : nextLabel
                                  }
                                </button>
                              )
                            })()}
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
