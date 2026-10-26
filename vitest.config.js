import { defineConfig } from 'vitest/config'

// Configuración propia para las pruebas: así Vitest no carga vite.config.js
// (el plugin de PWA y el service worker no hacen falta para probar lib/).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'supabase/tests/**/*.test.js'],
  },
})
