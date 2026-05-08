import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Manifest gestito dal plugin (sostituisce public/manifest.json esistente).
      manifest: {
        name: 'GustoPro Gestionale',
        short_name: 'GustoPro',
        description: 'Sistema di gestione ristorante',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1A1A1A',
        theme_color: '#1A1A1A',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Precache di tutti gli asset hashed di Vite (HTML, JS, CSS, immagini)
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // index.html è una SPA: redirect navigation requests al cache hit
        navigateFallback: '/index.html',
        // Non precacheare /api: gestito a runtime (NetworkFirst con fallback)
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/health$/],
        runtimeCaching: [
          {
            // Risposte GET API → network first, fallback cache (per resilienza temporanea)
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'gustopro-api-get',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 }, // 1 giorno
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Backend POST/PUT/DELETE non vanno cachati: gestiti dalla queue offline
        // (ancora da implementare in mini-step C)
      },
      devOptions: {
        // SW NON attivo in dev di default (causa problemi HMR); abilitato solo in build
        enabled: false,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          ui: ['lucide-react'],
        },
      },
    },
  },
})
