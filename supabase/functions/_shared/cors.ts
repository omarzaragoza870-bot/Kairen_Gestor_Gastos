// supabase/functions/_shared/cors.ts
//
// Orígenes desde los que la app llama a las Edge Functions:
//   - la versión web/PWA en Vercel
//   - la app nativa de Capacitor: Android usa https://localhost
//     (androidScheme: 'https') e iOS usa capacitor://localhost
//   - Vite en desarrollo
//
// Antes solo se permitía el dominio de Vercel, así que el navegador del
// APK bloqueaba las respuestas (Kairen IA y Eliminar cuenta en Android).
//
// Para agregar orígenes sin tocar código (ej. la URL de un Codespace):
//   npx supabase secrets set ALLOWED_ORIGINS="https://otro-dominio.com,https://xyz-5173.app.github.dev"

const ORIGENES_BASE = [
  'https://kairen-gestor-gastos.vercel.app',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost:5173',
  'http://localhost:4173'
]

const ORIGENES_EXTRA = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

const PERMITIDOS = new Set([...ORIGENES_BASE, ...ORIGENES_EXTRA])

export function corsHeadersPara(req: Request, metodos = 'POST, OPTIONS'): Record<string, string> {
  const origen = req.headers.get('Origin') || ''
  return {
    'Access-Control-Allow-Origin': PERMITIDOS.has(origen) ? origen : 'https://kairen-gestor-gastos.vercel.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': metodos,
    'Vary': 'Origin'
  }
}
