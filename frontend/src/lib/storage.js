/**
 * Safe localStorage wrapper.
 *
 * Perché esiste:
 *  - Safari "Private Browsing" lancia QuotaExceededError sul setItem
 *  - iOS Safari < 11 con storage pieno fallisce setItem
 *  - Cookie disabilitato lato browser puo' rendere localStorage indisponibile
 *  - JSON corrotto in storage (es. dopo crash mid-write) crasha JSON.parse
 *
 * API:
 *   storage.get(key, defaultValue?)         → string | defaultValue
 *   storage.getJSON(key, defaultValue?)     → parsed | defaultValue
 *   storage.set(key, value)                 → boolean (true se OK)
 *   storage.setJSON(key, obj)               → boolean
 *   storage.remove(key)                     → boolean
 *   storage.clear()                         → boolean
 *
 * Tutti i metodi sono safe (no throw). Loggano via console.warn in caso di
 * errore non-recuperabile (storage non disponibile / quota piena).
 */

const PREFIX = '[storage]'

function isAvailable() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    const testKey = '__gustopro_storage_test__'
    window.localStorage.setItem(testKey, '1')
    window.localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

const available = isAvailable()
let warned = false
function warnUnavailable() {
  if (!warned) {
    console.warn(`${PREFIX} localStorage non disponibile (private mode? quota?)`)
    warned = true
  }
}

export const storage = {
  get(key, defaultValue = null) {
    if (!available) { warnUnavailable(); return defaultValue }
    try {
      const v = window.localStorage.getItem(key)
      return v === null ? defaultValue : v
    } catch (err) {
      console.warn(`${PREFIX} get(${key}) failed:`, err.message)
      return defaultValue
    }
  },

  getJSON(key, defaultValue = null) {
    if (!available) { warnUnavailable(); return defaultValue }
    try {
      const raw = window.localStorage.getItem(key)
      if (raw === null) return defaultValue
      return JSON.parse(raw)
    } catch (err) {
      console.warn(`${PREFIX} getJSON(${key}) failed:`, err.message)
      // Storage corrotto: rimuovi la chiave per evitare loop di crash
      try { window.localStorage.removeItem(key) } catch { /* ignore */ }
      return defaultValue
    }
  },

  set(key, value) {
    if (!available) { warnUnavailable(); return false }
    try {
      window.localStorage.setItem(key, value)
      return true
    } catch (err) {
      // QuotaExceededError, SecurityError (private mode iOS), etc.
      console.warn(`${PREFIX} set(${key}) failed:`, err.message)
      return false
    }
  },

  setJSON(key, obj) {
    try {
      return this.set(key, JSON.stringify(obj))
    } catch (err) {
      console.warn(`${PREFIX} setJSON(${key}) stringify failed:`, err.message)
      return false
    }
  },

  remove(key) {
    if (!available) return false
    try {
      window.localStorage.removeItem(key)
      return true
    } catch (err) {
      console.warn(`${PREFIX} remove(${key}) failed:`, err.message)
      return false
    }
  },

  clear() {
    if (!available) return false
    try {
      window.localStorage.clear()
      return true
    } catch {
      return false
    }
  },

  /** Diagnostic: usato dai test / dal backup view nel pannello superadmin. */
  get available() { return available },
}
