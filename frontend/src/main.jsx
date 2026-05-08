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

// Background sync della queue offline (mini-step D)
import { startBackgroundSync } from './lib/offlineSync'
startBackgroundSync()

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
