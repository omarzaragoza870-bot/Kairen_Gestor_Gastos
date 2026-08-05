import { createClient } from '@supabase/supabase-js'
import { esNativo } from './capacitor.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Kairen Finanzas] Faltan variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en tu .env')
}

// Storage personalizado que usa @capacitor/preferences en nativo
// — así el flow_state de PKCE persiste entre el WebView y el navegador externo
const capacitorStorage = {
  async getItem(key) {
    try {
      const { Preferences } = await import('@capacitor/preferences')
      const { value } = await Preferences.get({ key })
      return value
    } catch {
      return null
    }
  },
  async setItem(key, value) {
    try {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({ key, value })
    } catch {}
  },
  async removeItem(key) {
    try {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.remove({ key })
    } catch {}
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE en todos los entornos — en nativo usamos Capacitor Preferences
    // como storage para que el flow_state persista entre el WebView y el
    // navegador externo (Safari/Chrome) donde se hace el login de Google.
    flowType: 'pkce',
    detectSessionInUrl: !esNativo(),
    ...(esNativo() ? { storage: capacitorStorage } : {})
  }
})