import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      devOptions: {
        enabled: true,
        type: 'module'
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
          { src: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/favicon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})