import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, Timer, Wine, UtensilsCrossed, RefreshCw } from 'lucide-react'
import { serviceAPI, assignmentsAPI } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useSocket } from '../context/SocketContext'
import { Card, Badge, Button } from '../components/v2'

function elapsed(readyAt) {
  if (!readyAt) return 0
  return Math.floor((Date.now() - new Date(readyAt).getTime()) / 60000)
}

// Soglie: bevande raffreddano prima → warn 3min danger 5min; piatti 15/20.
function elapsedTone(min, isBeverage) {
  const warn   = isBeverage ? 3 : 15
  const danger = isBeverage ? 5 : 20
  if (min >= danger) return 'err'
  if (min >= warn)   return 'warn'
  return 'ok'
}

export default function WaiterDashboardPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { socket } = useSocket()
  const [readyItems, setReadyItems] = useState([])
  const [myZones, setMyZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)

  const load = useCallback(async () => {
    try {
      const [itemsRes, zonesRes] = await Promise.all([
        serviceAPI.readyItems(),
        assignmentsAPI.my(),
      ])
      // JP 2026-06-16: gli ASPORTI non compaiono in "I Miei Piatti" del
      // cameriere (si ritirano al bancone, non si servono ai tavoli). Sala
      // e asporto sono separati.
      setReadyItems((itemsRes.data || []).filter(i => i.table_number !== 'ASPORTO'))
      setMyZones(zonesRes.data)
    } catch {
      toast({ type: 'error', title: 'Errore caricamento' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  // Aggiorna timer ogni 30s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  // Socket realtime
  useEffect(() => {
    if (!socket) return
    const refresh = () => load()
    socket.on('item-status-updated', refresh)
    socket.on('item-ready-notify', refresh)
    socket.on('item-served', refresh)
    return () => {
      socket.off('item-status-updated', refresh)
      socket.off('item-ready-notify', refresh)
      socket.off('item-served', refresh)
    }
  }, [socket, load])

  async function handleServed(itemId) {
    try {
      await serviceAPI.markServed(itemId)
      setReadyItems(prev => prev.filter(i => i.item_id !== itemId))
      toast({ type: 'success', title: 'Servito!' })
    } catch {
      toast({ type: 'error', title: 'Errore' })
    }
  }

  // Raggruppa per tavolo
  const byTable = {}
  for (const item of readyItems) {
    const key = item.table_number
    if (!byTable[key]) byTable[key] = { tableNumber: key, zoneName: item.zone_name, items: [] }
    byTable[key].items.push(item)
  }
  const tables = Object.values(byTable)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border-soft)] px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-20">
        <button
          onClick={() => navigate('/tables')}
          className="text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.04)] rounded-lg p-1.5 transition"
          aria-label="Indietro"
        >
          <ArrowLeft size={18} />
        </button>
        <UtensilsCrossed size={18} className="text-[var(--color-gold)]" />
        <h1 className="serif text-[var(--color-text)] font-bold tracking-tight text-lg">
          I Miei Piatti
        </h1>
        {readyItems.length > 0 && (
          <Badge tone="err" solid size="sm" className="animate-[pulse-err_1.6s_ease-in-out_infinite]">
            {readyItems.length}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {myZones.map(z => (
            <Badge key={z.zone_id} tone="neutral" size="sm">
              {z.zone_name}
            </Badge>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16 gap-2 text-[var(--color-text-2)]">
            <RefreshCw size={18} className="animate-spin text-[var(--color-gold)]" />
            <span className="text-sm">Caricamento piatti…</span>
          </div>
        ) : tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--color-text-3)]">
            <Check size={48} className="mb-3 text-[var(--color-ok)]/40" />
            <p className="serif text-[var(--color-text-2)] text-base font-bold">
              Nessun piatto in attesa
            </p>
            <p className="text-xs mt-1">Tutti serviti! 🎉</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {tables.map(table => (
              <motion.div
                key={table.tableNumber}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card padding="none" className="overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border-soft)] bg-[var(--color-surface-2)]">
                    <div className="flex items-center gap-2">
                      <span className="w-9 h-9 rounded-lg bg-[var(--color-gold-soft)] text-[var(--color-gold)] flex items-center justify-center text-sm font-bold tnum">
                        {table.tableNumber}
                      </span>
                      <span className="text-[var(--color-text-2)] text-xs font-medium">{table.zoneName}</span>
                    </div>
                    <span className="text-[var(--color-text-3)] text-[11px] tnum">
                      {table.items.length} piatt{table.items.length === 1 ? 'o' : 'i'}
                    </span>
                  </div>

                  <div className="divide-y divide-[var(--color-border-soft)]">
                    {table.items.map(item => {
                      const min = elapsed(item.ready_at)
                      const tone = elapsedTone(min, item.is_beverage)
                      const toneClass =
                        tone === 'err'  ? 'text-[var(--color-err)] bg-[var(--color-err-soft)] border-[var(--color-err)]/30 animate-[pulse-err_2s_ease-in-out_infinite]' :
                        tone === 'warn' ? 'text-[var(--color-warn)] bg-[var(--color-warn-soft)] border-[var(--color-warn)]/30' :
                                          'text-[var(--color-ok)] bg-[var(--color-ok-soft)] border-[var(--color-ok)]/30'
                      return (
                        <div key={item.item_id} className="flex items-center justify-between px-4 py-3 gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {item.is_beverage
                              ? <Wine size={15} className="text-[var(--color-park)] shrink-0" />
                              : <UtensilsCrossed size={15} className="text-[var(--color-gold)] shrink-0" />
                            }
                            <p className="text-[var(--color-text)] text-sm font-semibold truncate min-w-0">
                              <span className="text-[var(--color-gold)] tnum">{item.quantity}×</span>{' '}
                              {item.item_name}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold flex items-center gap-1 tnum ${toneClass}`}>
                              <Timer size={10} /> {min}m
                            </span>
                            <Button
                              size="sm"
                              variant="success"
                              leftIcon={<Check size={12} />}
                              onClick={() => handleServed(item.item_id)}
                            >
                              Servito
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
