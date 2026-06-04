/// <reference lib="webworker" />
/* eslint-env serviceworker */
/* global self */

/**
 * sw.js — Service Worker custom GustoPro.
 *
 * Mantiene il precache automatico di Workbox (per il funzionamento PWA
 * standalone offline) E aggiunge il push handler per le notifiche.
 *
 * Lifecycle:
 *  - install → skip waiting (subito attivo, no F5 manuale)
 *  - activate → clients.claim (controllo immediato delle tab gia' aperte)
 *  - push → mostra notifica con payload custom (titolo/body/tag/url)
 *  - notificationclick → apre/focusa la tab GustoPro alla URL specificata
 */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

// JP 2026-06-04: SW_VERSION bumped per invalidare tutte le cache stale
// sui tablet vecchi. Cambiare questo string forza il browser a vedere
// un SW diverso e a re-installare/attivare → precache nuova.
const SW_VERSION = '2026-06-04-21h35-kdsfix'
console.log('[SW] version', SW_VERSION)

// Precache hash-fingerprinted assets generati da Vite
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// JP 2026-06-04: alla nuova attivazione, svuoto TUTTE le cache runtime
// vecchie (Workbox precache si auto-pulisce, ma quelle nominate sotto
// sopravvivono). Cosi' tablet con bundle stale si refreshano davvero.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names
      .filter(n => n.startsWith('gustopro-') || n.startsWith('workbox-'))
      .map(n => caches.delete(n)))
  })())
})

// SPA fallback: ogni navigazione (es. /tables, /order/123) usa index.html
// dalla cache invece di hit-the-network. Cosi' app standalone funziona
// anche con server irraggiungibile (cold-start offline).
registerRoute(new NavigationRoute(
  new NetworkFirst({
    cacheName: 'gustopro-pages',
    networkTimeoutSeconds: 5,
  }),
  { denylist: [/^\/api\//, /^\/socket\.io\//, /^\/health$/] },
))

// API GET cache (1 giorno, network first)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') && self.location.origin === url.origin,
  new NetworkFirst({
    cacheName: 'gustopro-api-get',
    networkTimeoutSeconds: 5,
  }),
  'GET',
)

// ─── Skip-waiting + claim cosi' l'aggiornamento non richiede F5 ────
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ─── PUSH ──────────────────────────────────────────────────────────
// Payload atteso (JSON stringificato dal backend pushService):
//   { title, body, tag?, url?, vibrate?, icon?, badge?, requireInteraction? }
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() || {} } catch {
    try { data = { title: 'GustoPro', body: event.data?.text() || '' } } catch { data = {} }
  }
  const title = data.title || 'GustoPro'
  const options = {
    body: data.body || '',
    tag: data.tag || 'gustopro',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    vibrate: data.vibrate || [200, 100, 200],
    requireInteraction: !!data.requireInteraction,
    // Action buttons (es. "✓ Servito") cliccabili da notifica/orologio.
    // Su Apple Watch + Wear OS i bottoni-azione delle notifiche funzionano.
    actions: Array.isArray(data.actions) ? data.actions : [],
    data: {
      url: data.url || '/',
      actionToken: data.actionToken || null,  // JWT firmato per push-action
    },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Esegue una push-action (Servito/Ritirato) chiamando il backend col token
// firmato. Niente JWT di sessione necessario — il token E' l'auth.
async function runPushAction(action, actionToken) {
  if (!actionToken) return false
  try {
    const res = await fetch(`${self.location.origin}/api/push-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: actionToken, action }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Click sulla notifica: due casi.
//  1. Tap su un BOTTONE-AZIONE (es. "✓ Servito") → esegue push-action
//     col token, mostra conferma, NON apre l'app (mani libere dall'orologio).
//  2. Tap sul corpo della notifica → apri/focus la tab GustoPro.
self.addEventListener('notificationclick', (event) => {
  const action = event.action
  const data = event.notification.data || {}
  event.notification.close()

  // CASO 1: bottone azione (servito/pickup)
  if (action === 'served' || action === 'pickup') {
    event.waitUntil((async () => {
      const ok = await runPushAction(action, data.actionToken)
      // Feedback visivo: notifica breve di conferma (sparisce da sola)
      const title = ok
        ? (action === 'served' ? '✓ Servito confermato' : '✓ Ritiro confermato')
        : '⚠️ Errore — apri l\'app'
      try {
        await self.registration.showNotification(title, {
          tag: 'action-feedback',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          vibrate: ok ? [80] : [200, 100, 200],
          requireInteraction: false,
          silent: ok,
        })
        // Auto-dismiss feedback dopo 2.5s
        if (ok) {
          await new Promise(r => setTimeout(r, 2500))
          const notifs = await self.registration.getNotifications({ tag: 'action-feedback' })
          notifs.forEach(n => n.close())
        }
      } catch { /* ignore */ }
    })())
    return
  }

  // CASO 2: tap sul corpo → apri/focus app alla URL
  const targetUrl = data.url || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.includes(self.location.origin)) {
        try {
          await c.focus()
          if ('navigate' in c) await c.navigate(targetUrl)
          return
        } catch { /* fallback openWindow */ }
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl)
  })())
})
