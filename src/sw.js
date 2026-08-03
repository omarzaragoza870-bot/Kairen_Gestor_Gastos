// Service Worker de Kairen Finanzas
// Maneja precache de archivos estáticos (inyectado por vite-plugin-pwa)
// y eventos de notificaciones push.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

// Precache — vite-plugin-pwa inyecta aquí el manifiesto automáticamente
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Rutas de navegación — network first para siempre tener datos frescos
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'kairen-finanzas-pages' })
)

// Rutas de la API de Supabase — network first con timeout de 5s
registerRoute(
  ({ url }) => url.hostname.includes('.supabase.co'),
  new NetworkFirst({ cacheName: 'kairen-finanzas-api', networkTimeoutSeconds: 5 })
)

// ─── Push notifications ───────────────────────────────────────────────────

// Cuando llega una notificación push del servidor
self.addEventListener('push', (event) => {
  if (!event.data) return

  let datos
  try {
    datos = event.data.json()
  } catch {
    datos = { title: 'Kairen Finanzas', body: event.data.text() }
  }

  const opciones = {
    body: datos.body || '',
    icon: '/favicon-192.png',
    badge: '/favicon-32.png',
    data: { url: datos.url || '/' },
    vibrate: [100, 50, 100],
    tag: 'kairen-finanzas', // agrupa notificaciones del mismo tipo
    renotify: true
  }

  event.waitUntil(
    self.registration.showNotification(datos.title || 'Kairen Finanzas', opciones)
  )
})

// Cuando el usuario toca la notificación — abre o enfoca la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si ya hay una ventana abierta, la enfoca y navega
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Si no hay ventana abierta, abre una nueva
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

// Activación inmediata sin esperar que se cierren pestañas viejas
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
