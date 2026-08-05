import { createClient } from '@supabase/supabase-js'
import { esNativo } from './capacitor.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Kairen Finanzas] Faltan variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en tu .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // En la app nativa usamos implicit flow: el navegador externo no comparte
    // localStorage con el WebView, así que el PKCE "flow state" se pierde y
    // exchangeCodeForSession falla con "flow_state_not_found". Con implicit
    // flow el token llega directo en el hash de la URL, sin necesitar el state.
    // En la web sí usamos PKCE (más seguro) — se selecciona automáticamente
    // según esNativo().
    flowType: esNativo() ? 'implicit' : 'pkce',
    detectSessionInUrl: !esNativo()
  }
})