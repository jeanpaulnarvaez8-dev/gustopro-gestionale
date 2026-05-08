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
// `autoUpdate` significa: ad ogni reload, se c'è una nuova versione
// del SW disponibile la installa automaticamente. Con un toast per
// notificare il refresh user-side lo aggiungeremo nel mini-step F.
import { registerSW } from 'virtual:pwa-register'
registerSW({
  immediate: true,
  onRegisteredSW(swUrl) {
    console.info('[PWA] Service Worker registered:', swUrl)
  },
  onRegisterError(error) {
    console.error('[PWA] Service Worker registration failed:', error)
  },
})

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
