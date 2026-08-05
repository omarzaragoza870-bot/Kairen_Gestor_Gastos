import { createClient } from '@supabase/supabase-js'
import { esNativo } from './capacitor.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Kairen Finanzas] Faltan variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en tu .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // En nativo usamos implicit para la sesión normal, pero el login con
    // Google usa PKCE manual (ver src/screens/Login.jsx y src/lib/pkce.js)
    // En web usamos PKCE nativo de Supabase (más seguro, no tiene el problema
    // del localStorage compartido porque todo ocurre en el mismo contexto)
    flowType: esNativo() ? 'implicit' : 'pkce',
    detectSessionInUrl: !esNativo()
  }
})