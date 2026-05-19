/**
 * KDS beep notifications — Web Audio API sintetico (zero asset).
 *
 * Genera un beep "ding-dong" rapido (2 toni 880Hz + 660Hz, 180ms totali)
 * quando arriva un nuovo ordine in cucina.
 *
 * UX:
 *  - Web Audio richiede `user gesture` per partire (autoplay policy).
 *    Su KDS che resta aperta tutto il giorno, basta un click iniziale
 *    per attivare il context audio.
 *  - Preferenza utente persistita in localStorage `gustopro_kds_sound`
 *    ('on' default | 'off').
 *  - API: playNewOrderBeep(), toggleSound(), isSoundEnabled()
 *
 * Privacy: niente network, niente PII. Solo oscillator JS.
 */
import { storage } from './storage'

const KEY = 'gustopro_kds_sound'         // toggle KDS (chef)
const KEY_WAITER = 'gustopro_waiter_sound' // toggle cameriere

let audioCtx = null

function getCtx() {
  if (audioCtx) return audioCtx
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return null
    audioCtx = new Ctor()
    return audioCtx
  } catch {
    return null
  }
}

function tone(ctx, freq, startMs, durMs, gain = 0.15) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, ctx.currentTime + startMs / 1000)
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + (startMs + 10) / 1000)
  g.gain.setValueAtTime(gain, ctx.currentTime + (startMs + durMs - 20) / 1000)
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + (startMs + durMs) / 1000)
  osc.connect(g).connect(ctx.destination)
  osc.start(ctx.currentTime + startMs / 1000)
  osc.stop(ctx.currentTime + (startMs + durMs) / 1000)
}

/** Beep "ding-dong" — 2 toni rapidi. */
export function playNewOrderBeep() {
  if (!isSoundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return
  // iOS Safari: resume context se sospeso (richiede user gesture pregresso)
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => { /* user hasn't interacted yet */ })
  }
  try {
    tone(ctx, 880, 0, 100)   // 880 Hz, 100ms
    tone(ctx, 660, 110, 100) // 660 Hz, 100ms, +10ms gap
  } catch {
    /* ignore — non-critical */
  }
}

/** Beep "urgent" — 3 toni più alti per service-alert escalation. */
export function playUrgentBeep() {
  if (!isSoundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  try {
    tone(ctx, 1100, 0,   80, 0.2)
    tone(ctx, 1100, 90,  80, 0.2)
    tone(ctx, 1100, 180, 80, 0.2)
  } catch { /* ignore */ }
}

export function isSoundEnabled() {
  return storage.get(KEY, 'on') !== 'off'
}

export function toggleSound() {
  const next = isSoundEnabled() ? 'off' : 'on'
  storage.set(KEY, next)
  return next === 'on'
}

/** Forza set audio on/off (usato dal NotificationsPrompt al login per
 *  riabilitare audio anche se l'utente lo aveva spento in sessione prec). */
export function setSoundEnabled(on) {
  storage.set(KEY, on ? 'on' : 'off')
  storage.set(KEY_WAITER, on ? 'on' : 'off')
}

/**
 * unlockAudio — sblocca AudioContext (alcuni browser, in particolare iOS
 * Safari, bloccano l'audio finche' l'utente non interagisce). Chiamata
 * dal click "Attiva" → suona un beep silente che attiva il context per
 * tutti i beep successivi (anche se l'app va in background+riapre).
 */
let _unlocked = false
export function unlockAudio() {
  if (_unlocked) return
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    // Resume del context (richiede gesture utente)
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    // Beep silente per attivare effettivamente l'audio
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    g.gain.value = 0.0001
    o.connect(g); g.connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + 0.01)
    _unlocked = true
  } catch { /* fallback: niente */ }
}

// ─── Cameriere: beep "piatto pronto" + toggle separato ──────────────
export function isWaiterSoundEnabled() {
  return storage.get(KEY_WAITER, 'on') !== 'off'
}

export function toggleWaiterSound() {
  const next = isWaiterSoundEnabled() ? 'off' : 'on'
  storage.set(KEY_WAITER, next)
  return next === 'on'
}

/**
 * Beep "campanellino" — squilla quando lo chef segna un piatto pronto
 * e il cameriere lo riceve via socket item-ready-notify.
 * Toni 1320Hz + 990Hz (squillanti) per distinguersi dal beep KDS
 * (880Hz + 660Hz, "ding-dong" più basso).
 */
export function playReadyBeep() {
  if (!isWaiterSoundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  try {
    tone(ctx, 1320, 0,   120, 0.16) // campanellino acuto
    tone(ctx, 990,  130, 140, 0.14) // risonanza più morbida
  } catch { /* ignore */ }
}
