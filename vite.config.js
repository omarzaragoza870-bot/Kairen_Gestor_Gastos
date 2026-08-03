import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true // activa el service worker también en `npm run dev`, no solo en build de producción
      },
      manifest: {
        name: 'Kairen Finanzas',
        short_name: 'Kairen',
        description: 'Tu dinero, bajo control.',
        theme_color: '#0F0B1E',
        background_color: '#0F0B1E',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // network-first: mismo patrón que usamos en KAIREN para
        // evitar servir datos financieros viejos desde cache
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'kairen-finanzas-pages' }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'kairen-finanzas-api', networkTimeoutSeconds: 5 }
          }
        ]
      }
    })
  ]
})