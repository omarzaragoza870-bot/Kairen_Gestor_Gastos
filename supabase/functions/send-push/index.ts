// @ts-nocheck
// supabase/functions/send-push/index.ts
//
// Envía una notificación Web Push a todos los dispositivos suscritos
// de un usuario. Se llama desde el cliente o desde otras Edge Functions.
//
// Body esperado (JSON):
// {
//   "user_id": "uuid del usuario",
//   "title": "Título de la notificación",
//   "body": "Cuerpo del mensaje",
//   "url": "/ruta-opcional-al-abrir"   (opcional)
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://kairen-gestor-gastos.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verificar que la petición viene de un usuario autenticado o del service role
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!

    // Configurar VAPID
    webpush.setVapidDetails(
      'mailto:soporte@kairen.mx',
      vapidPublic,
      vapidPrivate
    )

    const { user_id, title, body, url } = await req.json()
    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: 'Faltan campos requeridos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Obtener todas las suscripciones del usuario
    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: subs, error } = await adminClient
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', user_id)

    if (error) throw error
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ enviadas: 0, mensaje: 'Sin suscripciones activas' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/favicon-192.png',
      badge: '/favicon-32.png',
      url: url || '/',
      timestamp: Date.now()
    })

    // Enviar a todas las suscripciones del usuario en paralelo
    const resultados = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      )
    )

    // Si una suscripción ya no es válida (410 Gone), la eliminamos
    const expiradas = subs.filter((_, i) => {
      const r = resultados[i]
      return r.status === 'rejected' && r.reason?.statusCode === 410
    })
    if (expiradas.length > 0) {
      await adminClient
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expiradas.map(s => s.endpoint))
    }

    const enviadas = resultados.filter(r => r.status === 'fulfilled').length
    return new Response(JSON.stringify({ enviadas, total: subs.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[send-push]', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
