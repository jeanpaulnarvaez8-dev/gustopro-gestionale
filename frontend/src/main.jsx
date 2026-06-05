import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { SocketProvider } from './context/SocketContext'
import { CartProvider } from './context/CartContext'
import { ToastProvider } from './context/ToastContext'
import { ConfirmProvider } from './components/v2'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import './index.css'

// ToastProvider DEVE stare fuori da SocketProvider perche' SocketContext usa
// useToast() per notificare service-alert / inventory:* in arrivo via WS.

// PWA — registra il Service Worker generato da vite-plugin-pwa.
// `autoUpdate` mode: il SW viene rifreshato automaticamente al reload,
// ma per i client PWA installati (mobile / standalone) un reload manuale
// puo' non avvenire mai → restano bloccati su versioni vecchie.
//
// Soluzione: quando vite-plugin-pwa rileva una nuova versione del SW
// (precache changed), invoca onNeedRefresh. Settiamo un flag globale
// + dispatchamo un CustomEvent → un banner React (PWAUpdateBanner in
// App.jsx) intercetta e mostra prompt "Aggiorna ora". Su click,
// updateSW(true) → skipWaiting + reload pulito.
import { registerSW } from 'virtual:pwa-register'
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.info('[PWA] new version available')
    window.__SW_UPDATE_AVAILABLE = true
    window.dispatchEvent(new CustomEvent('pwa-need-refresh'))
    // Auto-aggiornamento sulle schermate SICURE (no carrello/pagamento in corso):
    // KDS, tavoli, admin, bar... cosi' i dispositivi prendono i cambiamenti da
    // soli senza dover toccare nulla. Su /order e /checkout mostriamo solo il
    // banner (per non perdere un carrello/pagamento in corso).
    try {
      const p = window.location.pathname || ''
      // Rischioso solo se sei su ordine/cassa CON roba nel carrello (la perderesti).
      // A carrello vuoto si aggiorna anche lì → i camerieri prendono le novità.
      const onCartScreen = p.startsWith('/order') || p.startsWith('/checkout')
      const risky = onCartScreen && window.__CART_HAS_ITEMS === true
      if (!risky) {
        setTimeout(() => { try { updateSW(true) } catch { window.location.reload() } }, 1200)
      }
    } catch { /* mostra solo il banner */ }
  },
  onOfflineReady() {
    console.info('[PWA] app ready offline')
  },
  onRegisteredSW(swUrl) {
    console.info('[PWA] Service Worker registered:', swUrl)
  },
  onRegisterError(error) {
    console.error('[PWA] Service Worker registration failed:', error)
  },
})
// Espone updateSW al banner React. Argomento true = skipWaiting + reload.
window.__SW_APPLY_UPDATE = () => updateSW(true)

// JP 2026-06-05 FIX: ChunkLoadError handler. Quando il WiFi spiaggia e'
// lento (>5s timeout NetworkFirst del SW), il chunk dynamic import puo'
// non scaricare → ErrorBoundary mostra schermata + 'Ricarica' manuale.
// Con vite:preloadError facciamo reload automatico, l'utente non se ne
// accorge.
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[PWA] preloadError → reload', event?.payload)
  // Tag per evitare loop reload se il chunk e' cached fallito.
  const last = Number(sessionStorage.getItem('__last_preload_reload') || 0)
  const now = Date.now()
  if (now - last > 5000) {
    sessionStorage.setItem('__last_preload_reload', String(now))
    window.location.reload()
  }
})

// Background sync della queue offline (mini-step D)
import { startBackgroundSync } from './lib/offlineSync'
startBackgroundSync()

// Client error reporting → backend (window.onerror + unhandledrejection).
// ErrorBoundary chiama reportError() separatamente per i crash React.
import { setupClientErrorReporting } from './lib/errorReporter'
setupClientErrorReporting()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <SocketProvider>
                <CartProvider>
                  <App />
                </CartProvider>
              </SocketProvider>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
)
