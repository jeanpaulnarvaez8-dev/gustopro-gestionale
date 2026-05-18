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
import { tablesAPI, zonesAPI, assignmentsAPI } from '../lib/api'
import FloorPlanInteractive from '../components/FloorPlanInteractive'
import MobileTableList from '../components/MobileTableList'
import { BottomSheet, Badge, StatusDot } from '../components/v2'
import { storage } from '../lib/storage'
import { isWaiterSoundEnabled, toggleWaiterSound } from '../lib/kdsBeep'
import { List, Map as MapIcon, Bell, AlertTriangle, Wine, Clock as ClockIcon, Volume2, VolumeX } from 'lucide-react'

// Status config: usa i tokens Riva Beach.
// free=ok(verde), occupied=gold(oro Riva), reserved=sea(mare), dirty=warn(giallo), parked=park(viola)
const STATUS_CONFIG = {
  free:     { label: 'Libero',    tone: 'ok',   bg: 'bg-[var(--color-ok-soft)]',         border: 'border-[var(--color-ok)]/40 hover:border-[var(--color-ok)]',                 dot: 'bg-[var(--color-ok)]',         text: 'text-[var(--color-ok)]' },
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
  const navigate = useNavigate()
  const [bellOpen, setBellOpen] = useState(false)

  const [zones, setZones] = useState([])
  const [tables, setTables] = useState([])
  const [activeZone, setActiveZone] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // editMode reso disponibile via FloorPlanInteractive (toolbar interna).
  const [, setMyZoneIds] = useState(null)

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
      setActiveZone(prev =>
        prev && allowedZones.some(z => z.id === prev)
          ? prev
          : (firstNonEmpty?.id ?? allowedZones[0]?.id ?? null)
      )
    } catch {
      setError('Errore caricamento tavoli')
    } finally {
      setLoading(false)
    }
  }, [user?.role])

  useEffect(() => { loadData() }, [loadData])

  // Realtime updates via socket.io
  useEffect(() => {
    if (!socket) return
    const handler = ({ tableId, status, active_order_id }) => {
      setTables(prev => prev.map(t => {
        if (t.id !== tableId) return t
        return {
          ...t,
          status,
          active_order_id: active_order_id !== undefined ? active_order_id : t.active_order_id,
        }
      }))
    }
    socket.on('table-status-changed', handler)
    return () => socket.off('table-status-changed', handler)
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

  // Toggle audio "piatto pronto" per i camerieri (default ON).
  // Persistito in localStorage tramite kdsBeep helpers.
  const [waiterSoundOn, setWaiterSoundOn] = useState(() => isWaiterSoundEnabled())
  const handleToggleWaiterSound = () => setWaiterSoundOn(toggleWaiterSound())

  // Toggle Lista ↔ Pianta su mobile. Persistito in localStorage per ricordare
  // la preferenza del cameriere tra sessioni.
  const [mobileView, setMobileView] = useState(() =>
    storage.get('gustopro_mobile_view', 'list')
  )
  const switchMobileView = (v) => {
    setMobileView(v)
    storage.set('gustopro_mobile_view', v)
  }

  function handleNavigate(table) {
    const isCashier = ['cashier', 'admin', 'manager'].includes(user?.role)
    if (isCashier && table.status === 'occupied' && table.active_order_id) {
      navigate(`/checkout/${table.active_order_id}`)
    } else if (table.status === 'free' || !table.active_order_id) {
      // Tavolo libero → chiedi coperti
      setCoversSheet(table)
    } else {
      navigate(`/order/${table.id}`)
    }
  }

  function handleCoversConfirm(covers) {
    if (!coversSheet) return
    navigate(`/order/${coversSheet.id}?covers=${covers}`)
    setCoversSheet(null)
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

      {/* ─── Body: pianta desktop / lista mobile ────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={16} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento tavoli…</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <Badge tone="err">{error}</Badge>
          </div>
        ) : (
          <>
            {/* ─── Mobile: toggle Lista ↔ Pianta + container ──────────────── */}
            <div className="md:hidden h-full flex flex-col">
              {/* Toolbar mobile con segmented control oro/nero */}
              <div className="px-3 py-2 bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] flex items-center gap-2 shrink-0">
                <div className="inline-flex rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => switchMobileView('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition min-h-[36px] ${
                      mobileView === 'list'
                        ? 'bg-[var(--color-gold)] text-[#13181C] shadow-sm'
                        : 'text-[var(--color-text-2)]'
                    }`}
                    aria-pressed={mobileView === 'list'}
                  >
                    <List size={13} />
                    Lista
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMobileView('plan')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition min-h-[36px] ${
                      mobileView === 'plan'
                        ? 'bg-[var(--color-gold)] text-[#13181C] shadow-sm'
                        : 'text-[var(--color-text-2)]'
                    }`}
                    aria-pressed={mobileView === 'plan'}
                  >
                    <MapIcon size={13} />
                    Pianta
                  </button>
                </div>
                <div className="ml-auto flex items-center gap-2 text-[10px] text-[var(--color-text-3)]">
                  <span className="flex items-center gap-1 tnum">
                    <StatusDot tone="ok" size="xs" />{stats.free}
                  </span>
                  <span className="flex items-center gap-1 tnum">
                    <StatusDot tone="gold" size="xs" />{stats.occupied}
                  </span>
                  <span className="text-[var(--color-text-3)]">/ {stats.total}</span>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                {mobileView === 'list' ? (
                  <MobileTableList
                    tables={tables}
                    zones={zones}
                    onTableClick={handleNavigate}
                  />
                ) : (
                  <FloorPlanInteractive
                    tables={tables}
                    zones={zones}
                    onTableClick={handleNavigate}
                    canEdit={false /* niente edit da mobile: schermo troppo piccolo */}
                    onRefresh={loadData}
                    spotlightZoneId={user?.role === 'waiter' ? activeZone : null}
                    serviceAlerts={serviceAlerts}
                  />
                )}
              </div>
            </div>

            {/* ─── Desktop: pianta SVG sempre ──────────────────────────── */}
            <div className="hidden md:block h-full">
              <FloorPlanInteractive
                tables={tables}
                zones={zones}
                onTableClick={handleNavigate}
                canEdit={canEdit}
                onRefresh={loadData}
                spotlightZoneId={user?.role === 'waiter' ? activeZone : null}
                /* Service alerts realtime: TableShape mostra halo escalation
                   rosso + beep per tavoli con piatti pronti da troppo. */
                serviceAlerts={serviceAlerts}
              />
            </div>
          </>
        )}
      </div>

      {/* ─── BottomSheet selezione coperti (sostituisce il Modal vecchio) ─── */}
      <BottomSheet
        open={!!coversSheet}
        onClose={() => setCoversSheet(null)}
        title={coversSheet ? `Tavolo ${coversSheet.table_number} · quante persone?` : ''}
      >
        <div className="grid grid-cols-5 gap-2">
          {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(n => (
            <motion.button
              key={n}
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => handleCoversConfirm(n)}
              className="aspect-square rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text)] font-bold text-lg hover:bg-[var(--color-gold)] hover:text-[#13181C] hover:border-[var(--color-gold)] transition flex items-center justify-center tnum min-h-[48px]"
            >
              {n}
            </motion.button>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-[var(--color-text-3)]">
          Tocca il numero per aprire l&apos;ordine con i coperti selezionati
        </p>
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

      {/* Placeholder esistente — non rendiamo nulla */}
      <AnimatePresence>{null}</AnimatePresence>
    </div>
  )
}
// Esportiamo STATUS_CONFIG nel caso serva ad altri componenti per la legenda.
export { STATUS_CONFIG }
