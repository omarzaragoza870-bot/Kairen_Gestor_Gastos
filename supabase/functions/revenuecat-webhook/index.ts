// Edge Function: revenuecat-webhook
//
// RevenueCat avisa aquí cada compra, renovación, cancelación o vencimiento.
// No se confía en el contenido del evento: solo se toman los ids de usuario
// y se vuelve a preguntar a RevenueCat el estado real (_shared/revenuecat.ts).
// Así da igual si los eventos llegan repetidos o desordenados.
//
// Autenticación: RevenueCat manda en Authorization el valor que se configura
// en su panel (Integrations → Webhooks). Debe ser igual al secreto
// REVENUECAT_WEBHOOK_SECRET. No usa JWT de Supabase (verify_jwt = false en config.toml).
//
// Despliegue:
//   npx supabase secrets set REVENUECAT_WEBHOOK_SECRET=... REVENUECAT_SECRET_KEY=...
//   npx supabase functions deploy revenuecat-webhook --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0'
import { esUsuarioSupabase, sincronizarPremium } from '../_shared/revenuecat.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Comparación en tiempo constante para no filtrar el secreto por tiempos de respuesta
function iguales(a: string, b: string): boolean {
  const ta = new TextEncoder().encode(a)
  const tb = new TextEncoder().encode(b)
  let diferencia = ta.length ^ tb.length
  for (let i = 0; i < Math.max(ta.length, tb.length); i++) diferencia |= (ta[i] ?? 0) ^ (tb[i] ?? 0)
  return diferencia === 0
}

const responder = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder(405, { error: 'Método no permitido' })

  const secreto = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
  const recibido = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!secreto || !iguales(recibido, secreto)) return responder(401, { error: 'No autorizado' })

  let evento: Record<string, unknown>
  try {
    evento = (await req.json())?.event ?? {}
  } catch {
    return responder(400, { error: 'JSON inválido' })
  }

  // En una transferencia de compras cambian dos usuarios; los alias cubren
  // cuando la compra se hizo antes de iniciar sesión.
  const lista = (v: unknown) => (Array.isArray(v) ? v : [])
  const ids = new Set(
    [evento.app_user_id, evento.original_app_user_id, ...lista(evento.aliases),
      ...lista(evento.transferred_from), ...lista(evento.transferred_to)]
      .filter(esUsuarioSupabase)
  )

  const admin = createClient(supabaseUrl, serviceRoleKey)
  try {
    for (const id of ids) await sincronizarPremium(admin, id)
    return responder(200, { ok: true, usuarios: ids.size })
  } catch (err) {
    console.error('[revenuecat-webhook]', err)
    // 500 hace que RevenueCat reintente más tarde
    return responder(500, { error: 'No se pudo sincronizar' })
  }
})
