// Edge Function: sincronizar-premium
//
// La app la llama justo después de comprar o de "Restaurar compras" para no
// esperar al webhook. El usuario sale del token (nunca del cuerpo), así que
// cada quien solo puede sincronizar su propio plan.
//
// Despliegue:
//   npx supabase functions deploy sincronizar-premium

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0'
import { corsHeadersPara } from '../_shared/cors.ts'
import { sincronizarPremium } from '../_shared/revenuecat.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersPara(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const responder = (status: number, cuerpo: unknown) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return responder(401, { error: 'Falta token de autorización' })

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return responder(401, { error: 'Token inválido' })
  if (data.user.is_anonymous) return responder(403, { error: 'Crea tu cuenta para suscribirte' })

  try {
    const premium = await sincronizarPremium(admin, data.user.id)
    return responder(200, { premium })
  } catch (err) {
    console.error('[sincronizar-premium]', err)
    return responder(502, { error: 'No se pudo confirmar la suscripción' })
  }
})
