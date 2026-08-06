// Edge Function: delete-account
//
// Por qué existe esta función: borrar un usuario de auth.users requiere
// la "service_role key" de Supabase, una llave con permisos totales que
// JAMÁS debe usarse en el frontend (cualquiera podría verla y borrar
// cuentas ajenas). Esta función vive en el servidor de Supabase, recibe
// el token del usuario que hace la petición, confirma quién es, y solo
// entonces borra ESA cuenta (nunca otra).
//
// Cómo desplegarla (una sola vez, desde tu terminal con Supabase CLI):
//   npx supabase login
//   npx supabase link --project-ref iemyltuapdpdjxegxjhn
//   npx supabase functions deploy delete-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// Headers CORS — sin esto, el navegador bloquea la respuesta antes
// de que tu app pueda leerla, aunque la función funcione bien por dentro.
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://kairen-gestor-gastos.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

Deno.serve(async (req) => {
  // El navegador manda un "preflight" OPTIONS antes del POST real —
  // hay que responderlo explícitamente o nunca deja pasar el POST.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Falta token de autorización' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')

    // Cliente con la service_role key, solo vive aquí en el servidor
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Confirma quién es el usuario dueño de este token
    const { data: userData, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userId = userData.user.id

    // Borra al usuario — gracias a "on delete cascade" en el schema.sql,
    // esto también borra automáticamente sus cuentas, categorías,
    // transacciones y registros de ahorro externo.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})