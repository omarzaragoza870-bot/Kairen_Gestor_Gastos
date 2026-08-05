/**
 * Kairen Finanzas — PKCE manual para OAuth con Google en Capacitor
 *
 * El problema: Supabase guarda el flow_state de PKCE en localStorage del
 * WebView, pero el login de Google abre un navegador externo (Safari/Chrome)
 * que no comparte ese localStorage. Cuando el deep link regresa al WebView,
 * el flow_state ya no existe → "flow_state_not_found".
 *
 * La solución: implementamos PKCE nosotros mismos usando Web Crypto API
 * y guardamos el code_verifier en @capacitor/preferences (que SÍ persiste
 * entre el WebView y el proceso nativo).
 */

import { Preferences } from '@capacitor/preferences'

const VERIFIER_KEY = 'kairen_pkce_verifier'

// Genera un string aleatorio seguro de 64 bytes en base64url
function generarVerifier() {
  const arr = new Uint8Array(64)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// SHA-256 del verifier, en base64url — este es el challenge que va a Google
async function generarChallenge(verifier) {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// Guarda el verifier en Preferences y devuelve el challenge
export async function iniciarPKCE() {
  const verifier = generarVerifier()
  const challenge = await generarChallenge(verifier)
  await Preferences.set({ key: VERIFIER_KEY, value: verifier })
  return { verifier, challenge }
}

// Lee el verifier guardado
export async function obtenerVerifier() {
  const { value } = await Preferences.get({ key: VERIFIER_KEY })
  return value
}

// Limpia el verifier después de usarlo
export async function limpiarVerifier() {
  await Preferences.remove({ key: VERIFIER_KEY })
}
