/**
 * Kairen Finanzas — Web Push (cliente)
 *
 * Gestiona la suscripción del navegador al servicio de notificaciones push.
 * Usa la API estándar de Web Push (VAPID) — funciona en cualquier navegador
 * moderno y en la PWA instalada tanto en Android como en iOS 16.4+.
 */
import { supabase } from './supabaseClient.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/** Convierte la clave pública VAPID de base64url a Uint8Array */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

/** true si el navegador soporta notificaciones push */
export function pushSoportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Estado actual del permiso de notificaciones */
export function permisoPush() {
  if (!('Notification' in window)) return 'no-soportado'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

/**
 * Solicita permiso y suscribe el navegador al push.
 * Guarda la suscripción en Supabase.
 * Retorna true si se suscribió correctamente.
 */
export async function suscribirPush(userId) {
  if (!pushSoportado()) return false
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[push] VITE_VAPID_PUBLIC_KEY no configurada en .env')
    return false
  }

  // Pedir permiso al usuario
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return false

  // Obtener el service worker registrado
  const registration = await navigator.serviceWorker.ready

  // Suscribir al push manager
  let subscription
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })
  } catch (err) {
    console.warn('[push] Error al suscribir:', err.message)
    return false
  }

  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys?.auth) return false

  // Guardar en Supabase (upsert por si ya existe)
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth
    }, { onConflict: 'user_id,endpoint' })

  if (error) {
    console.warn('[push] Error al guardar suscripción:', error.message)
    return false
  }

  return true
}

/**
 * Desuscribe el navegador y elimina la suscripción de Supabase.
 */
export async function desuscribirPush(userId) {
  if (!pushSoportado()) return

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
}

/**
 * Verifica si este navegador ya está suscrito.
 */
export async function estaSuscrito() {
  if (!pushSoportado()) return false
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return Boolean(subscription) && Notification.permission === 'granted'
}
