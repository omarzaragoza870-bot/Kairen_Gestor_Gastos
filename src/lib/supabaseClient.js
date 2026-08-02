import { createClient } from '@supabase/supabase-js'

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
    flowType: 'pkce'
  }
})