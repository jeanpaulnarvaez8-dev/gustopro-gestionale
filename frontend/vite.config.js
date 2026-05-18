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
      // Strategy injectManifest: custom SW in src/sw.js (per Web Push handler)
      // + precache automatico via __WB_MANIFEST.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
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
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      devOptions: {
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
