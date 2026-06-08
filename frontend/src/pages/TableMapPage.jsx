import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut, LayoutDashboard, ChefHat, Wifi, WifiOff, Users, RefreshCw,
  Package, UserCog, CalendarDays, ShoppingBag, X, Plus,
  CheckCircle2, FlaskConical, ClipboardList, MapPin, Trophy, UtensilsCrossed, Map, Building,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { useToast } from '../context/ToastContext'
import { tablesAPI, zonesAPI, assignmentsAPI } from '../lib/api'
import FloorPlanInteractive from '../components/FloorPlanInteractive'
import MobileTableList from '../components/MobileTableList'
import TableGridView from '../components/TableGridView'
import BarTableModal from '../components/BarTableModal'
import { BottomSheet, Badge, StatusDot } from '../components/v2'
import { storage } from '../lib/storage'
import { isWaiterSoundEnabled, toggleWaiterSound } from '../lib/kdsBeep'
import { List, Map as MapIcon, Bell, AlertTriangle, Wine, Clock as ClockIcon, Volume2, VolumeX, Trash2 } from 'lucide-react'

// Status config: usa i tokens Riva Beach.
// free=ok(verde), occupied=gold(oro Riva), reserved=sea(mare), dirty=warn(giallo), parked=park(viola)
const STATUS_CONFIG = {
  free:     { label: 'Libero',    tone: 'ok',   bg: 'bg-[var(--color-ok-soft)]',         border: 'border-[var(--color-ok)]/40 hover:border-[var(--color-ok)]',                 dot: 'bg-[var(--color-ok)]',         text: 'text-[var(--color-ok)]' },
  // 'seated' = cliente accomodato, comanda non ancora presa (timer 10min)
  seated:   { label: 'Accomodato',tone: 'sea',  bg: 'bg-[var(--color-sea-soft)]',        border: 'border-[var(--color-sea)]/40 hover:border-[var(--color-sea)]',               dot: 'bg-[var(--color-sea)]',        text: 'text-[var(--color-sea)]' },
  occupied: { label: 'Occupato',  tone: 'gold', bg: 'bg-[var(--color-gold-soft)]',       border: 'border-[var(--color-gold-ring)] hover:border-[var(--color-gold)]',           dot: 'bg-[var(--color-gold)]',       text: 'text-[var(--color-gold)]' },
  reserved: { label: 'Riservato', tone: 'sea',  bg: 'bg-[var(--color-sea-soft)]',        border: 'border-[var(--color-sea)]/40 hover:border-[var(--color-sea)]',               dot: 'bg-[var(--color-sea)]',        text: 'text-[var(--color-sea)]' },
  dirty:    { label: 'Pulizia',   tone: 'warn', bg: 'bg-[var(--color-warn-soft)]',       border: 'border-[var(--color-warn)]/40 hover:border-[var(--color-warn)]',             dot: 'bg-[var(--color-warn)]',       text: 'text-[var(--color-warn)]' },
  parked:   { label: 'In attesa', tone: 'park', bg: 'bg-[var(--color-park-soft)]',       border: 'border-[var(--color-park)]/40 hover:border-[var(--color-park)]',             dot: 'bg-[var(--color-park)]',       text: 'text-[var(--color-park)]' },
}

// ── NavButton: bottone barra navigazione del header (skin Riva) ──────────────
function NavButton({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-[var(--color-text-2)] hover:text-[var(--color-gold)] hover:bg-[rgba(255,255,255,0.04)] transition text-xs px-2 py-1.5 rounded-lg shrink-0 min-h-[36px]"
    >
      <Icon size={14} />
      <span className="hidden md:block">{label}</span>
    </button>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TableMapPage() {
  const { user, logout } = useAuth()
  const { socket, isConnected, serviceAlerts, setServiceAlerts } = useSocket()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [bellOpen, setBellOpen] = useState(false)

  // JP 2026-06-07: Alessandra (waiter+sub_role='asporto') non deve vedere
  // i tavoli della sala. Se atterra qui per qualsiasi via, redirect a
  // /asporto. Stesso pattern per bar.
  useEffect(() => {
    if (user?.role === 'waiter' && user?.sub_role === 'asporto') {
      navigate('/asporto', { replace: true })
    } else if (user?.role === 'waiter' && ['bar', 'bar/caffetteria'].includes(user?.sub_role)) {
      navigate('/bar', { replace: true })
    }
  }, [user?.role, user?.sub_role, navigate])

  const [zones, setZones] = useState([])
  const [tables, setTables] = useState([])
  const [activeZone, setActiveZone] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // editMode reso disponibile via FloorPlanInteractive (toolbar interna).
  // myZoneIds: zone assegnate al cameriere oggi. Array vuoto come default
  // cosi' .includes() non crasha quando il backend non ritorna assegnazioni
  // o l'utente non e' un waiter.
  const [myZoneIds, setMyZoneIds] = useState([])

  const canEdit = ['admin', 'manager'].includes(user?.role)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [zonesRes, tablesRes] = await Promise.all([
        zonesAPI.list(),
        tablesAPI.list(),
      ])

      // Cross-visibility (test reale 2026-05-18): tutti i camerieri vedono
      // TUTTE le zone, cosi' sanno chi sta servendo cosa anche fuori dal
      // proprio settore. Le zone assegnate restano evidenziate via spotlight
      // (lo spotlightZoneId continua a funzionare sull'active zone).
      let allowedZones = zonesRes.data
      if (user?.role === 'waiter') {
        try {
          const { data: myAssignments } = await assignmentsAPI.my()
          setMyZoneIds(myAssignments.map(a => a.zone_id))
        } catch { /* fallback */ }
      }

      setZones(allowedZones)
      setTables(tablesRes.data)
      // Auto-skip zone vuote nella selezione iniziale: durante il test di
      // Riva la zona "BAR" (sort_order=1, 0 tavoli) veniva selezionata
      // di default e mandava in spotlight zero tavoli — gli altri 48 erano
      // dimmed e l'utente pensava ne avesse solo 7 (la zona successiva
      // evidenziata era "Botti in Legno" con 7 tavoli).
      const zoneTableCount = (zoneId) =>
        tablesRes.data.filter(t => t.zone_id === zoneId).length
      const firstNonEmpty = allowedZones.find(z => zoneTableCount(z.id) > 0)
      // Admin vede SEMPRE tutti i tavoli di default — niente filtro zona iniziale.
      // Richiesta esplicita di JP: "quando entro come admin fammi vedere sempre
      // tutti i tavoli perche schiacciare ogni volta tutte mi rompo".
      // Camerieri/manager/cassiere mantengono la zona di default (firstNonEmpty)
      // per evitare overload visivo all'apertura.
      setActiveZone(prev => {
        if (user?.role === 'admin') {
          // Se l'admin ha gia' scelto una zona durante la sessione la rispettiamo;
          // altrimenti null = "Tutte".
          return prev && allowedZones.some(z => z.id === prev) ? prev : null
        }
        return prev && allowedZones.some(z => z.id === prev)
          ? prev
          : (firstNonEmpty?.id ?? allowedZones[0]?.id ?? null)
      })
    } catch {
      setError('Errore caricamento tavoli')
    } finally {
      setLoading(false)
    }
  }, [user?.role])

  useEffect(() => { loadData() }, [loadData])

  // Realtime updates via socket.io
  //
  // Fix 2026-05-19: il vecchio handler aggiornava SOLO {status, active_order_id}
  // localmente, ma la mappa mostra anche active_waiter_name, active_items_count,
  // order_opened_at (chip "Marco · 2", badge tempo) che restavano stale.
  // Plus nessun listener su new-order / order-item-added → aggiunte di item
  // a ordine esistente non aggiornavano la mappa.
  //
  // Nuovo approccio: a OGNI evento rilevante, ricarica i tavoli con
  // tablesAPI.list() debounced 250ms (single source of truth = backend
  // view tables_with_active_order). Niente race condition tra socket
  // payload parziale e stato locale.
  useEffect(() => {
    if (!socket) return
    let pendingRefresh = null
    const debouncedRefresh = () => {
      clearTimeout(pendingRefresh)
      pendingRefresh = setTimeout(() => {
        tablesAPI.list().then(r => setTables(r.data)).catch(() => {})
      }, 250)
    }
    socket.on('table-status-changed', debouncedRefresh)
    socket.on('new-order',             debouncedRefresh)
    socket.on('order-item-added',      debouncedRefresh)
    socket.on('order-settled',         debouncedRefresh)
    // JP 2026-05-31: il cameriere fa "Manda in cucina" su una voce IN ATTESA
    // (workflow waiting → production). Senza questi listener il badge
    // "IN ATTESA" rosa sul tavolo restava stale finche' non si refreshava
    // la pagina. Ora il backend emette workflow-status-changed +
    // item-released-to-production e la mappa si aggiorna in tempo reale.
    socket.on('workflow-status-changed',       debouncedRefresh)
    socket.on('item-released-to-production',   debouncedRefresh)
    return () => {
      clearTimeout(pendingRefresh)
      socket.off('table-status-changed', debouncedRefresh)
      socket.off('new-order',             debouncedRefresh)
      socket.off('order-item-added',      debouncedRefresh)
      socket.off('order-settled',         debouncedRefresh)
      socket.off('workflow-status-changed',       debouncedRefresh)
      socket.off('item-released-to-production',   debouncedRefresh)
    }
  }, [socket])

  // Polling fallback: se il socket e' disconnesso (WiFi cade, server restart,
  // backend SIGTERM), facciamo refresh dei tavoli ogni 30s per non lasciare
  // il cameriere con stato stale. Skip quando socket connesso (real-time).
  useEffect(() => {
    if (isConnected) return
    const interval = setInterval(() => {
      // Refresh silenzioso (no loading spinner, no overlay) — l'utente non
      // deve sapere che il fallback e' in atto, solo che i dati restano freschi.
      tablesAPI.list().then(r => setTables(r.data)).catch(() => { /* offline ok */ })
    }, 30000)
    return () => clearInterval(interval)
  }, [isConnected])

  const [coversSheet, setCoversSheet] = useState(null) // table object o null
  const [customCovers, setCustomCovers] = useState('') // numero persone oltre 10
  // BarTableModal: si apre quando bartender clicca un tavolo (vede solo bevande).
  const [barTableModal, setBarTableModal] = useState(null) // table object o null
  // ReservedSheet: click su tavolo prenotato → modal con scelte
  // (accomoda OR togli prenotazione).
  const [reservedSheet, setReservedSheet] = useState(null) // table object o null
  // SeatedSheet: click su tavolo accomodato → prendi comanda OR libera.
  const [seatedSheet, setSeatedSheet] = useState(null) // table object o null

  // Libera un tavolo ACCOMODATO (status seated → free), se l'accomodamento
  // era un errore o il cliente se n'e' andato. Admin/manager/cassa.
  async function handleFreeSeated(table) {
    if (!table) return
    if (!confirm(`Liberare il tavolo ${table.table_number}? (annulla l'accomodamento)`)) return
    try {
      await tablesAPI.setStatus(table.id, 'free')
      setSeatedSheet(null)
      await loadData()
      toast({ type: 'success', title: 'Tavolo liberato', message: `Tavolo ${table.table_number} libero` })
    } catch (e) {
      toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
    }
  }

  // Toglie la prenotazione di un tavolo (status reserved → free).
  // Disponibile per admin/manager/cassa: il cameriere normale di solito
  // non ha contesto sul perche' una prenotazione vada cancellata.
  async function handleRemoveReservation(table) {
    if (!table) return
    if (!confirm(`Togliere la prenotazione del tavolo ${table.table_number}?`)) return
    try {
      await tablesAPI.setStatus(table.id, 'free')
      setReservedSheet(null)
      await loadData()
      toast({ type: 'success', title: 'Prenotazione tolta', message: `Tavolo ${table.table_number} libero` })
    } catch (e) {
      toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
    }
  }

  // Segna un tavolo LIBERO come PRENOTATO manualmente (status free → reserved).
  // JP 2026-05-27: "io posso metterli prenotati e liberarli quando io voglio".
  // Controllo manuale senza data/ora: lo schiaccia quando vuole.
  async function handleMarkReserved(table) {
    if (!table) return
    try {
      await tablesAPI.setStatus(table.id, 'reserved')
      setCoversSheet(null)
      await loadData()
      toast({ type: 'success', title: 'Prenotato', message: `Tavolo ${table.table_number} segnato prenotato` })
    } catch (e) {
      toast({ type: 'error', title: 'Errore', message: e?.response?.data?.error || 'Riprova' })
    }
  }

  // Toggle audio "piatto pronto" per i camerieri (default ON).
  // Persistito in localStorage tramite kdsBeep helpers.
  const [waiterSoundOn, setWaiterSoundOn] = useState(() => isWaiterSoundEnabled())
  const handleToggleWaiterSound = () => setWaiterSoundOn(toggleWaiterSound())

  // Toggle vista tavoli: 'grid' (calendario, default JP 2026-05-27) o 'list'
  // (card classiche). Persistito in localStorage per ricordare la preferenza.
  const [mobileView, setMobileView] = useState(() =>
    storage.get('gustopro_mobile_view', 'grid')
  )
  const switchMobileView = (v) => {
    setMobileView(v)
    storage.set('gustopro_mobile_view', v)
  }

  // JP 2026-06-01: modalita' "Incrocia tavoli". Quando attiva, il tap sui
  // tavoli li SELEZIONA invece di aprire la comanda. Quando si conferma,
  // si apre una comanda condivisa per tutti i tavoli scelti — ogni piatto
  // aggiunto viene replicato su tutti (ognuno mantiene il proprio conto).
  const [crossMode, setCrossMode] = useState(false)
  const [crossSelected, setCrossSelected] = useState([]) // array di table id
  const toggleCrossSelect = (table) => {
    setCrossSelected(prev =>
      prev.includes(table.id) ? prev.filter(id => id !== table.id) : [...prev, table.id]
    )
  }
  const exitCrossMode = () => { setCrossMode(false); setCrossSelected([]) }
  // Conferma incroci: per ogni tavolo libero crea un ordine (covers=1), poi
  // naviga al primo con ?cross=otherIds. OrderPage gestisce la replica items.
  async function confirmCrossTables() {
    if (crossSelected.length < 2) {
      toast({ type: 'warning', title: 'Seleziona almeno 2 tavoli' })
      return
    }
    const selected = crossSelected.map(id => tables.find(t => t.id === id)).filter(Boolean)
    // Risolvi/crea ordine attivo per ciascun tavolo
    try {
      const ordered = []
      for (const t of selected) {
        let orderId = t.active_order_id
        if (!orderId) {
          // Crea ordine vuoto (covers=1, sara' aggiornato in cucina)
          const { data } = await (await import('../lib/api')).ordersAPI.create({
            table_id: t.id, items: [], covers: 1, order_type: 'table',
          })
          orderId = data.order_id || data.id
        }
        ordered.push({ tableId: t.id, orderId, tableNumber: t.table_number })
      }
      // Memorizza il "cross group" in storage per OrderPage
      try {
        storage.set('gustopro_cross_group', {
          createdAt: Date.now(),
          tables: ordered,
        })
      } catch {}
      exitCrossMode()
      await loadData()
      const first = ordered[0]
      const otherIds = ordered.slice(1).map(o => o.tableId).join(',')
      navigate(`/order/${first.tableId}?cross=${otherIds}`)
    } catch (e) {
      toast({ type: 'error', title: 'Errore incroci', message: e?.response?.data?.error || 'Riprova' })
    }
  }

  function handleNavigate(table) {
    // JP 2026-06-01: in modalita' incroci il tap SELEZIONA il tavolo invece
    // di aprire la comanda. Solo tavoli liberi/occupati possono essere
    // incrociati (no dirty/reserved).
    if (crossMode) {
      if (table.status === 'dirty' || table.status === 'reserved') {
        toast({ type: 'warning', title: 'Tavolo non disponibile per incroci' })
        return
      }
      toggleCrossSelect(table)
      return
    }
    // SBARAZZO (priorità a tutti): qualsiasi utente — sala, bar, cassa, admin —
    // può pulire un tavolo "da pulire" (dirty). Messo PER PRIMO così nessun
    // ruolo viene intercettato prima (es. il modal bar dei bartender).
    if (table.status === 'dirty') {
      if (!confirm(`Tavolo ${table.table_number}: confermi sbarazzo + pulizia completata?`)) return
      tablesAPI.setStatus(table.id, 'free')
        .then(() => loadData())
        .catch(() => toast({ type: 'error', title: 'Errore sbarazzo' }))
      return
    }
    // PRENOTATO: apri sheet con scelte (accomoda OR togli prenotazione).
    // JP 2026-05-27: "metti anche un tasto per togliere i tavoli gia'
    // prenotati". Sheet mostra il bottone "Togli prenotazione" per
    // admin/manager/cassa + "Accomoda cliente" per tutti.
    if (table.status === 'reserved') {
      setReservedSheet(table)
      return
    }
    const isCashier = ['cashier', 'admin', 'manager'].includes(user?.role)
    // Bartender (waiter/bar): click su tavolo NON apre l'ordine completo,
    // mostra invece il modal "Bevande di questo tavolo" filtrato. Cosi'
    // Desire' vede subito solo i drink senza navigare al conto.
    const isBartender = user?.role === 'waiter' &&
      (user?.sub_role === 'bar' || user?.sub_role === 'bar/caffetteria')
    if (isBartender && table.status !== 'free') {
      setBarTableModal(table)
      return
    }
    // Cassa/admin/manager su tavolo con ordine: vai alla pagina ORDINE
    // (vede cosa hanno mangiato, puo' aggiungere piatti) e da li' il
    // pulsante "Conto" porta al checkout. Niente piu' salto diretto al
    // conto: la cassa deve poter selezionare/integrare cio' che e' stato
    // consumato prima di chiudere.
    if (isCashier && table.active_order_id) {
      navigate(`/order/${table.id}`)
    } else if (table.status === 'free') {
      // Tavolo libero → chiedi coperti (poi accomoda → seated → ordine)
      setCoversSheet(table)
    } else if (table.status === 'seated') {
      // Cliente accomodato → sheet con scelte: prendi comanda OPPURE libera.
      // JP 2026-05-27: "se uno fa una prenotazione e dice accomodato poi
      // devo avere la possibilita' di toglierlo" → bottone "Libera tavolo".
      setSeatedSheet(table)
    } else if (!table.active_order_id) {
      setCoversSheet(table)
    } else {
      navigate(`/order/${table.id}`)
    }
  }

  async function handleCoversConfirm(covers) {
    if (!coversSheet) return
    const table = coversSheet
    setCoversSheet(null)
    // Sprint 4: se tavolo libero → setta 'seated' + parte timer 10min presa
    // comanda. Il backend traccia seated_at per analytics turnover.
    // Idempotent: se gia' seated/occupied, non rompe nulla (status check 409).
    if (table.status === 'free') {
      try {
        await tablesAPI.seat(table.id, { covers })
      } catch (e) {
        // 409 = altro cameriere ha gia' accomodato → ok, prosegui
        if (e?.response?.status !== 409) {
          toast({ type: 'error', title: 'Errore accomoda cliente' })
        }
      }
    }
    navigate(`/order/${table.id}?covers=${covers}`)
  }

  // Stats globali (per badge header live)
  const stats = {
    free:     tables.filter(t => t.status === 'free').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    total:    tables.length,
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">

      {/* ─── Header desktop ─────────────────────────────────────────── */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-2 sm:px-4 py-2 hidden md:flex items-center gap-3 shrink-0">
        {/* Brand: GP gradient + nome serif */}
        <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-[var(--color-border-soft)]">
          <div
            className="w-9 h-9 rounded-[8px] flex items-center justify-center font-extrabold text-[#13181C] text-[13px]"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #9c7e1f)' }}
          >
            GP
          </div>
          <div className="flex flex-col leading-tight">
            <span className="serif text-[15px] font-bold text-[var(--color-text)] tracking-tight">GustoPro</span>
            <span className="text-[10px] text-[var(--color-gold)] flex items-center gap-1 font-medium">
              <Building size={10} />Riva Beach
            </span>
          </div>
        </div>

        {/* Stato connessione */}
        <Badge tone={isConnected ? 'ok' : 'neutral'} size="sm" leftIcon={
          isConnected ? <Wifi size={11} /> : <WifiOff size={11} />
        }>
          {isConnected ? 'Live' : 'Offline'}
        </Badge>

        {/* Stats live in header */}
        {!loading && stats.total > 0 && (
          <div className="hidden lg:flex items-center gap-2 text-[11px] text-[var(--color-text-2)]">
            <span className="flex items-center gap-1.5">
              <StatusDot tone="ok" size="xs" />
              {stats.free}/{stats.total} liberi
            </span>
          </div>
        )}

        {/* Nav modules */}
        <nav className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0 scrollbar-none">
          {/* === CAMERIERE: solo le sue funzioni === */}
          {user?.role === 'waiter' && (
            <>
              <NavButton icon={UtensilsCrossed} label="I Miei Piatti" onClick={() => navigate('/my-tables')} />
              <NavButton icon={ShoppingBag} label="Asporto" onClick={() => navigate('/asporto')} />
              <NavButton icon={CalendarDays} label="Prenotazioni" onClick={() => navigate('/reservations')} />
            </>
          )}

          {/* === ADMIN/MANAGER: tutto === */}
          {['admin', 'manager'].includes(user?.role) && (
            <>
              <NavButton icon={ChefHat} label="KDS" onClick={() => navigate('/kds')} />
              <NavButton icon={UtensilsCrossed} label="I Miei Piatti" onClick={() => navigate('/my-tables')} />
              <NavButton icon={LayoutDashboard} label="Dashboard" onClick={() => navigate('/dashboard')} />
              <NavButton icon={ShoppingBag} label="Asporto" onClick={() => navigate('/asporto')} />
              <NavButton icon={CalendarDays} label="Prenotazioni" onClick={() => navigate('/reservations')} />
              <NavButton icon={MapPin} label="Zone" onClick={() => navigate('/assignments')} />
              <NavButton icon={Map} label="Pianta" onClick={() => navigate('/floor-plan')} />
              <NavButton icon={Trophy} label="Performance" onClick={() => navigate('/performance')} />
              <NavButton icon={Users} label="Clienti" onClick={() => navigate('/customers')} />
              <NavButton icon={Package} label="Inventario" onClick={() => navigate('/inventory')} />
              <NavButton icon={FlaskConical} label="Ingredienti" onClick={() => navigate('/ingredients')} />
              <NavButton icon={ClipboardList} label="Riconciliazione" onClick={() => navigate('/stock-reconciliation')} />
            </>
          )}
          {user?.role === 'admin' && (
            <NavButton icon={UserCog} label="Staff" onClick={() => navigate('/users')} />
          )}
        </nav>

        {/* Toggle audio "piatto pronto" — per camerieri (squilla quando chef segna ready) */}
        <button
          type="button"
          onClick={handleToggleWaiterSound}
          aria-label={waiterSoundOn ? 'Disattiva audio piatti pronti' : 'Attiva audio piatti pronti'}
          title={waiterSoundOn ? '🔔 Audio ON · suono quando i piatti sono pronti' : '🔕 Audio OFF · click per attivare'}
          className={`w-9 h-9 rounded-lg border flex items-center justify-center transition shrink-0 ${
            waiterSoundOn
              ? 'border-[var(--color-gold-ring)] bg-[var(--color-gold-soft)] text-[var(--color-gold)]'
              : 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text-3)]'
          }`}
        >
          {waiterSoundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* Notification bell con badge */}
        <button
          type="button"
          onClick={() => setBellOpen(true)}
          aria-label={`Notifiche (${serviceAlerts.length})`}
          className="relative w-9 h-9 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-text-2)] hover:text-[var(--color-gold)] hover:border-[var(--color-gold-ring)] transition shrink-0"
        >
          <Bell size={16} />
          {serviceAlerts.length > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-err)] text-white text-[10px] font-extrabold flex items-center justify-center tnum"
              style={{ animation: 'pulse-err 1.4s ease-in-out infinite' }}
            >
              {serviceAlerts.length > 9 ? '9+' : serviceAlerts.length}
            </span>
          )}
        </button>

        {/* User info + logout */}
        <div className="flex items-center gap-2 shrink-0 pl-2 border-l border-[var(--color-border-soft)]">
          <div className="hidden sm:flex flex-col leading-tight text-right">
            <span className="text-[12px] font-semibold text-[var(--color-text)]">{user?.name}</span>
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-gold)]">{user?.role}</span>
          </div>
          <button
            onClick={logout}
            title="Logout"
            className="text-[var(--color-text-3)] hover:text-[var(--color-err)] hover:bg-[rgba(239,68,68,0.08)] rounded-lg p-2 transition"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ─── Zone picker (sempre visibile, dopo header) ──────────────── */}
      {!loading && !error && zones.length > 1 && (
        <div className="bg-[var(--color-surface-2)] border-b border-[var(--color-border-soft)] px-3 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)] font-semibold mr-1 shrink-0">Zona</span>
          <button
            onClick={() => setActiveZone(null)}
            className={`shrink-0 px-3 py-1 rounded-md text-xs font-semibold transition ${
              activeZone === null
                ? 'bg-[var(--color-gold)] text-[#13181C]'
                : 'bg-[var(--color-surface)] text-[var(--color-text-2)] hover:text-[var(--color-text)] border border-[var(--color-border-soft)]'
            }`}
          >
            Tutte
          </button>
          {zones.map(z => {
            const count = tables.filter(t => t.zone_id === z.id).length
            const isMine = myZoneIds.includes(z.id)
            return (
              <button
                key={z.id}
                onClick={() => setActiveZone(z.id)}
                disabled={count === 0}
                className={`shrink-0 px-3 py-1 rounded-md text-xs font-semibold transition ${
                  count === 0
                    ? 'opacity-40 cursor-not-allowed bg-[var(--color-surface)] text-[var(--color-text-3)] border border-[var(--color-border-soft)]'
                    : activeZone === z.id
                      ? 'bg-[var(--color-gold)] text-[#13181C]'
                      : `bg-[var(--color-surface)] text-[var(--color-text-2)] hover:text-[var(--color-text)] border ${isMine ? 'border-[var(--color-gold-ring)]' : 'border-[var(--color-border-soft)]'}`
                }`}
              >
                {z.name}
                <span className="ml-1 opacity-70 tnum">({count})</span>
                {isMine && <span className="ml-1 text-[10px] opacity-80">·me</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Barra "Incrocia tavoli" — sticky in alto quando attiva */}
      {crossMode && (
        <div className="px-3 py-2 bg-[var(--color-gold)] text-[#13181C] flex items-center gap-2 shrink-0 z-20">
          <span className="font-extrabold text-sm flex-1">
            🔗 INCROCIA: tocca i tavoli da unire ({crossSelected.length} scelti)
          </span>
          <button
            onClick={confirmCrossTables}
            disabled={crossSelected.length < 2}
            className="px-3 py-1.5 rounded-lg bg-[#13181C] text-[var(--color-gold)] font-bold text-xs disabled:opacity-40 active:scale-95"
          >
            Conferma
          </button>
          <button
            onClick={exitCrossMode}
            className="px-3 py-1.5 rounded-lg bg-black/30 text-[#13181C] font-bold text-xs active:scale-95"
          >
            Annulla
          </button>
        </div>
      )}

      {/* Stats riga riepilogo (libero/occupato/totale) */}
      {!loading && !error && (
        <div className="px-3 py-1.5 bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] flex items-center gap-3 text-[11px] text-[var(--color-text-3)] shrink-0">
          <span className="flex items-center gap-1 tnum"><StatusDot tone="ok" size="xs" />{stats.free} liberi</span>
          <span className="flex items-center gap-1 tnum"><StatusDot tone="err" size="xs" />{stats.occupied} occupati</span>
          <span className="text-[var(--color-text-3)]">/ {stats.total} totali</span>


          {/* Toggle vista: Griglia (calendario) ↔ Lista (card) */}
          <div className="ml-auto flex items-center gap-1 bg-[var(--color-surface-2)] rounded-lg p-0.5 border border-[var(--color-border-soft)]">
            <button
              onClick={() => switchMobileView('grid')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition ${
                mobileView === 'grid' ? 'bg-[var(--color-gold)] text-[#13181C]' : 'text-[var(--color-text-3)] hover:text-[var(--color-text)]'
              }`}
              title="Vista griglia (calendario)"
            >
              <LayoutDashboard size={13} /> Griglia
            </button>
            <button
              onClick={() => switchMobileView('list')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition ${
                mobileView === 'list' ? 'bg-[var(--color-gold)] text-[#13181C]' : 'text-[var(--color-text-3)] hover:text-[var(--color-text)]'
              }`}
              title="Vista lista (card)"
            >
              <List size={13} /> Lista
            </button>
          </div>
          {canEdit && (
            <button onClick={() => navigate('/floor-plan')} className="text-[var(--color-text-3)] hover:text-[var(--color-gold)] underline">
              Editor pianta
            </button>
          )}
        </div>
      )}

      {/* ─── Body: LISTA tavoli numerata (telefono + tablet + desktop) ── */}
      {/* La pianta SVG e' stata rimossa dalla vista operativa (confondeva i
          camerieri). Resta accessibile all'admin via /floor-plan (editor). */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center h-64 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={16} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento tavoli…</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <Badge tone="err">{error}</Badge>
          </div>
        ) : mobileView === 'grid' ? (
          <TableGridView
            tables={tables}
            zones={zones}
            onTableClick={handleNavigate}
            activeZoneId={activeZone}
          />
        ) : (
          <MobileTableList
            tables={tables}
            zones={zones}
            onTableClick={handleNavigate}
            activeZoneId={activeZone}
          />
        )}
      </div>

      {/* ─── Modal bartender: bevande tavolo (solo waiter/bar) ───────────── */}
      {barTableModal && (
        <BarTableModal
          tableId={barTableModal.id}
          onClose={() => setBarTableModal(null)}
        />
      )}

      {/* ─── BottomSheet selezione coperti (sostituisce il Modal vecchio) ─── */}
      <BottomSheet
        open={!!coversSheet}
        onClose={() => setCoversSheet(null)}
        title={coversSheet ? `Tavolo ${coversSheet.table_number} · quante persone?` : ''}
      >
        <div className="grid grid-cols-5 gap-2">
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <motion.button
              key={n}
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => { setCustomCovers(''); handleCoversConfirm(n) }}
              className="aspect-square rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text)] font-bold text-2xl hover:bg-[var(--color-gold)] hover:text-[#13181C] hover:border-[var(--color-gold)] transition flex items-center justify-center tnum min-h-[56px]"
            >
              {n}
            </motion.button>
          ))}
        </div>

        {/* Oltre 10: numero persone libero */}
        <div className="mt-4 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={customCovers}
            onChange={e => setCustomCovers(e.target.value)}
            placeholder="Più di 10? scrivi qui (es. 14)"
            className="flex-1 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] focus:border-[var(--color-gold)] rounded-xl px-4 py-3 text-[var(--color-text)] text-xl text-center font-bold outline-none tnum"
          />
          <button
            type="button"
            disabled={!customCovers || parseInt(customCovers, 10) < 1}
            onClick={() => {
              const n = parseInt(customCovers, 10)
              if (n >= 1) { setCustomCovers(''); handleCoversConfirm(n) }
            }}
            className="px-6 py-3 rounded-xl bg-[var(--color-gold)] text-[#13181C] font-extrabold text-lg disabled:opacity-40"
          >
            OK
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-[var(--color-text-3)]">
          Tocca il numero (o scrivi quanti sono) per aprire l&apos;ordine coi coperti
        </p>

        {/* Segna come PRENOTATO (admin/manager/cassa): controllo manuale —
            il tavolo diventa "riservato" finche' non lo liberi tu. */}
        {['admin', 'manager', 'cashier'].includes(user?.role) && coversSheet && (
          <button
            type="button"
            onClick={() => handleMarkReserved(coversSheet)}
            className="mt-4 w-full py-3.5 rounded-xl bg-[var(--color-sea-soft)] border-2 border-[var(--color-sea)]/60 text-[var(--color-sea)] font-extrabold text-base active:scale-95 transition flex items-center justify-center gap-2"
          >
            <ClockIcon size={18} /> Segna come PRENOTATO
          </button>
        )}
      </BottomSheet>

      {/* ─── BottomSheet tavolo PRENOTATO: accomoda OR togli ─────────── */}
      <BottomSheet
        open={!!reservedSheet}
        onClose={() => setReservedSheet(null)}
        title={reservedSheet ? `Tavolo ${reservedSheet.table_number} · prenotato` : ''}
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-2)] text-center">
            Cosa vuoi fare con questa prenotazione?
          </p>
          <button
            type="button"
            onClick={() => {
              const t = reservedSheet
              setReservedSheet(null)
              setCoversSheet(t)
            }}
            className="w-full py-4 rounded-xl bg-[var(--color-gold)] text-[#13181C] font-extrabold text-lg active:scale-95 transition"
          >
            Accomoda cliente
          </button>
          {['admin', 'manager', 'cashier'].includes(user?.role) && (
            <button
              type="button"
              onClick={() => handleRemoveReservation(reservedSheet)}
              className="w-full py-4 rounded-xl bg-[var(--color-err-soft)] border-2 border-[var(--color-err)]/60 text-[var(--color-err)] font-extrabold text-lg active:scale-95 transition flex items-center justify-center gap-2"
            >
              <Trash2 size={20} /> Togli prenotazione
            </button>
          )}
        </div>
      </BottomSheet>

      {/* ─── BottomSheet tavolo ACCOMODATO: comanda OR libera ─────────── */}
      <BottomSheet
        open={!!seatedSheet}
        onClose={() => setSeatedSheet(null)}
        title={seatedSheet ? `Tavolo ${seatedSheet.table_number} · accomodato` : ''}
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-2)] text-center">
            Cliente accomodato. Cosa vuoi fare?
          </p>
          <button
            type="button"
            onClick={() => {
              const t = seatedSheet
              setSeatedSheet(null)
              navigate(`/order/${t.id}`)
            }}
            className="w-full py-4 rounded-xl bg-[var(--color-gold)] text-[#13181C] font-extrabold text-lg active:scale-95 transition"
          >
            Prendi comanda
          </button>
          {['admin', 'manager', 'cashier'].includes(user?.role) && (
            <button
              type="button"
              onClick={() => handleFreeSeated(seatedSheet)}
              className="w-full py-4 rounded-xl bg-[var(--color-err-soft)] border-2 border-[var(--color-err)]/60 text-[var(--color-err)] font-extrabold text-lg active:scale-95 transition flex items-center justify-center gap-2"
            >
              <Trash2 size={20} /> Libera tavolo
            </button>
          )}
        </div>
      </BottomSheet>

      {/* ─── BottomSheet notifiche (campanella header) ───────────────── */}
      <BottomSheet
        open={bellOpen}
        onClose={() => setBellOpen(false)}
        title={`Notifiche · ${serviceAlerts.length} attive`}
      >
        {serviceAlerts.length === 0 ? (
          <div className="py-8 text-center text-[var(--color-text-3)]">
            <Bell size={28} className="mx-auto mb-2 opacity-50" />
            <p className="serif italic text-sm">Nessuna notifica al momento</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {serviceAlerts.map((alert) => {
              const isWine = alert.isBeverage
              const isLate = alert.elapsedMinutes >= 20
              const Icon = isWine ? Wine : isLate ? AlertTriangle : ClockIcon
              const tone = isLate ? 'err' : isWine ? 'sea' : 'warn'
              return (
                <div
                  key={alert.alertId}
                  className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-xl p-3 flex items-start gap-3"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftColor: `var(--color-${tone})`,
                  }}
                >
                  <Icon size={18} className={`text-[var(--color-${tone})] shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-[var(--color-text)]">
                        Tavolo {alert.tableNumber}
                      </span>
                      <Badge tone={tone} size="sm" pulse={isLate}>
                        {alert.elapsedMinutes} min
                      </Badge>
                    </div>
                    <p className="text-sm text-[var(--color-text-2)]">
                      {alert.quantity}× {alert.itemName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setServiceAlerts((prev) => prev.filter((a) => a.alertId !== alert.alertId))
                    }}
                    className="text-[var(--color-text-3)] hover:text-[var(--color-text)] text-xs px-2 py-1 shrink-0"
                    aria-label="Rimuovi notifica"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
            {serviceAlerts.length > 0 && (
              <button
                type="button"
                onClick={() => { setServiceAlerts([]); setBellOpen(false) }}
                className="w-full mt-3 py-2 text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-2)] border border-[var(--color-border-soft)] rounded-lg transition"
              >
                Pulisci tutte
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* FAB "Incrocia tavoli" — JP 2026-06-01: bottone GRANDE in basso a
          sinistra (per non collidere con la campanella admin in bottom-right).
          Visibile sempre quando NON in crossMode. */}
      {!crossMode && (
        <button
          onClick={() => { setCrossMode(true); setCrossSelected([]) }}
          className="fixed bottom-3 left-3 z-[80] flex items-center gap-2 px-4 py-3 rounded-full bg-[var(--color-gold)] text-[#13181C] font-extrabold text-sm shadow-2xl border-2 border-[var(--color-gold-ring)] hover:brightness-110 active:scale-95 transition"
          title="Servi più tavoli insieme"
        >
          🔗 INCROCIA TAVOLI
        </button>
      )}

      {/* Placeholder esistente — non rendiamo nulla */}
      <AnimatePresence>{null}</AnimatePresence>
    </div>
  )
}
// Esportiamo STATUS_CONFIG nel caso serva ad altri componenti per la legenda.
export { STATUS_CONFIG }
