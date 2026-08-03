import { createClient } from '@supabase/supabase-js'
import { esNativo } from './capacitor.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Kairen Finanzas] Faltan variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en tu .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE explícito: no depender del default de la librería para el
    // flujo OAuth (más seguro que el flujo implícito, y queda auditable
    // directo en el código en vez de asumir el comportamiento de la versión instalada).
    flowType: 'pkce',
    // En la app nativa, nosotros procesamos el deep link a mano (ver
    // App.jsx, listener 'appUrlOpen') — si dejamos esto prendido ahí,
    // Supabase también intenta consumir el mismo código de autorización
    // por su cuenta, y el segundo intento falla con
    // "flow_state_already_used" porque el código ya se usó una vez.
    // En la web sí debe quedar prendido (true, el default) — ahí SÍ
    // dependemos de que Supabase detecte la sesión solo tras el redirect.
    detectSessionInUrl: !esNativo()
  }
})