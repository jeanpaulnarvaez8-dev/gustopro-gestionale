/**
 * Client error reporter — fire-and-forget verso il backend.
 *
 * Architettura:
 *  - Backend: POST /api/_client-error (pubblico, rate-limit 30/min)
 *  - Trasporto: navigator.sendBeacon (preferito, sopravvive a page unload)
 *               con fallback a fetch + keepalive
 *  - Source:
 *      - 'errorBoundary'         → React error caught da ErrorBoundary
 *      - 'window'                → window.onerror (sync errors)
 *      - 'unhandledrejection'    → promise rejected senza catch
 *
 * Privacy:
 *  - NIENTE PII nei report (no email, no name, no phone)
 *  - Solo: message, stack, componentStack, url, userAgent, tenantId, userId (UUID)
 *  - Stack trace troncato a 4000 char lato backend
 *  - Rate-limit lato client + backend per evitare flood
 *
 * Initialize una volta da main.jsx (setupClientErrorReporting()).
 * ErrorBoundary chiama reportError(err, info, 'errorBoundary').
 */
import { storage } from './storage'

const ENDPOINT = '/api/_client-error'
const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown')

// Rate-limit client-side: max 5 errori in 30s. Previene spam in caso di
// loop infinito (es. setState in render → errore → setState ...).
let recentErrors = []
function shouldThrottle() {
  const now = Date.now()
  recentErrors = recentErrors.filter((t) => t > now - 30_000)
  if (recentErrors.length >= 5) return true
  recentErrors.push(now)
  return false
}

// De-dup: salta errori identici nella stessa "raffica" (5 min)
const recentMessages = new Map() // message → timestamp
function isDuplicate(message) {
  const now = Date.now()
  // Cleanup old entries
  for (const [k, t] of recentMessages) {
    if (t < now - 5 * 60_000) recentMessages.delete(k)
  }
  if (recentMessages.has(message)) return true
  recentMessages.set(message, now)
  return false
}

function decodeTenantId() {
  try {
    const token = storage.get('gustopro_token')
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.tenant_id || null
  } catch {
    return null
  }
}

function decodeUserId() {
  try {
    const u = storage.getJSON('gustopro_user')
    return u?.id || null
  } catch {
    return null
  }
}

export function reportError(err, info = {}, source = 'window') {
  try {
    const message = err?.message || String(err || 'unknown')
    if (shouldThrottle() || isDuplicate(message)) return

    const payload = {
      source,
      message,
      stack: err?.stack,
      componentStack: info?.componentStack, // solo per errorBoundary
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      appVersion: APP_VERSION,
      userId: decodeUserId(),
      tenantId: decodeTenantId(),
    }
    const body = JSON.stringify(payload)

    // Preferito: sendBeacon (sopravvive a unload, async garantito)
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      const ok = navigator.sendBeacon(ENDPOINT, blob)
      if (ok) return
    }
    // Fallback: fetch con keepalive (sopravvive a unload in browser moderni)
    if (typeof fetch === 'function') {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* ignore: niente recursion su questo errore */ })
    }
  } catch { /* ignore: il reporter non deve mai crashare */ }
}

/**
 * Setup global handler: window.onerror + unhandledrejection.
 * Chiamato una volta da main.jsx prima di renderizzare l'app.
 */
export function setupClientErrorReporting() {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    // event.error puo' essere null (es. CORS sui resource errors)
    const err = event.error || new Error(event.message || 'unknown error')
    reportError(err, {}, 'window')
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const err = reason instanceof Error
      ? reason
      : new Error(typeof reason === 'string' ? reason : JSON.stringify(reason))
    reportError(err, {}, 'unhandledrejection')
  })
}
