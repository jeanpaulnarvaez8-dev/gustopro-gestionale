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

// Precache hash-fingerprinted assets generati da Vite
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

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
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Click sulla notifica → apri o focus la tab GustoPro alla URL specificata
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Se c'e' gia' una finestra GustoPro aperta, naviga + focus
    for (const c of all) {
      if (c.url.includes(self.location.origin)) {
        try {
          await c.focus()
          if ('navigate' in c) await c.navigate(targetUrl)
          return
        } catch { /* fallback openWindow */ }
      }
    }
    // Altrimenti apre nuova tab
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl)
  })())
})
