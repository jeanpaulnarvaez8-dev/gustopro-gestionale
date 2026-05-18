/**
 * Helper Web Push: registrazione subscription + invio al backend.
 *
 * Flow:
 *   1. SW gia' registrato da vite-plugin-pwa (in main.jsx)
 *   2. fetchKey() → GET /api/push/key (VAPID public)
 *   3. subscribe() → permission + pushManager.subscribe + POST /api/push/subscribe
 *   4. unsubscribe() → pushManager.unsubscribe + DELETE /api/push/unsubscribe
 *
 * Idempotente: subscribe() puo' essere chiamato N volte, il backend
 * upserta sull'endpoint.
 */
import { api } from './api'

const STORAGE = 'gustopro_push_subscribed'

export function isPushSupported() {
  return typeof window !== 'undefined' &&
         'serviceWorker' in navigator &&
         'PushManager' in window &&
         'Notification' in window
}

export function pushPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const base = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null
  return await navigator.serviceWorker.ready
}

/** Subscribe questo device alle push. Restituisce true se ok, false se denied/error. */
export async function subscribePush() {
  if (!isPushSupported()) return false
  try {
    let perm = pushPermission()
    if (perm === 'default') perm = await Notification.requestPermission()
    if (perm !== 'granted') return false

    const reg = await getRegistration()
    if (!reg) return false

    // Recupera VAPID public key dal backend
    const { data } = await api.get('/push/key')
    if (!data?.publicKey) return false

    // Subscribe (riusa se gia' attiva)
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      })
    }

    // Send to backend
    const json = sub.toJSON()
    await api.post('/push/subscribe', {
      endpoint: json.endpoint,
      keys: json.keys,
      user_agent: navigator.userAgent,
    })

    try { localStorage.setItem(STORAGE, '1') } catch {}
    return true
  } catch (err) {
    console.error('[push] subscribe failed', err)
    return false
  }
}

export async function unsubscribePush() {
  try {
    const reg = await getRegistration()
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return true
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    try { await api.post('/push/unsubscribe', { endpoint }) } catch {}
    try { localStorage.removeItem(STORAGE) } catch {}
    return true
  } catch (err) {
    console.error('[push] unsubscribe failed', err)
    return false
  }
}

export async function sendTestPush() {
  try {
    await api.post('/push/test')
    return true
  } catch { return false }
}

export function wasEverSubscribed() {
  try { return localStorage.getItem(STORAGE) === '1' } catch { return false }
}
