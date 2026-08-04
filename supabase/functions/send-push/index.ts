// @ts-nocheck
// supabase/functions/send-push/index.ts
//
// Envía notificaciones push a:
// 1. Web Push (VAPID) — para PWA en navegador/iPhone
// 2. FCM V1 — para la app nativa Android
//
// Body esperado (JSON):
// {
//   "user_id": "uuid del usuario",
//   "title": "Título",
//   "body": "Cuerpo del mensaje",
//   "url": "/ruta-opcional"
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://kairen-gestor-gastos.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Obtener token de acceso OAuth2 para FCM V1 ───────────────────────────
async function getFCMAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encode = (obj: any) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const signingInput = `${encode(header)}.${encode(payload)}`

  // Importar la clave privada RSA
  const pemKey = serviceAccount.private_key
  const keyData = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

// ─── Enviar notificación FCM V1 ───────────────────────────────────────────
async function sendFCM(token: string, title: string, body: string, url: string, serviceAccount: any) {
  const accessToken = await getFCMAccessToken(serviceAccount)
  const projectId = serviceAccount.project_id

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { url: url || '/' },
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
          },
        },
      }),
    }
  )

  return res.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!
    const firebaseServiceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')

    webpush.setVapidDetails('mailto:soporte@kairen.mx', vapidPublic, vapidPrivate)

    const { user_id, title, body, url } = await req.json()
    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: 'Faltan campos requeridos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const adminClient = createClient(supabaseUrl, serviceKey)

    // Obtener suscripciones Web Push
    const { data: webSubs } = await adminClient
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', user_id)

    // Obtener tokens FCM de Android
    const { data: fcmTokens } = await adminClient
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', user_id)

    const payload = JSON.stringify({
      title, body,
      icon: '/favicon-192.png',
      badge: '/favicon-32.png',
      url: url || '/',
      timestamp: Date.now()
    })

    let enviadas = 0

    // Enviar Web Push
    if (webSubs && webSubs.length > 0) {
      const resultados = await Promise.allSettled(
        webSubs.map(sub =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
        )
      )

      // Limpiar suscripciones expiradas
      const expiradas = webSubs.filter((_, i) => {
        const r = resultados[i]
        return r.status === 'rejected' && r.reason?.statusCode === 410
      })
      if (expiradas.length > 0) {
        await adminClient.from('push_subscriptions').delete()
          .in('endpoint', expiradas.map(s => s.endpoint))
      }

      enviadas += resultados.filter(r => r.status === 'fulfilled').length
    }

    // Enviar FCM (Android nativo)
    if (fcmTokens && fcmTokens.length > 0 && firebaseServiceAccountStr) {
      const serviceAccount = JSON.parse(firebaseServiceAccountStr)
      const fcmResultados = await Promise.allSettled(
        fcmTokens.map(({ token }) => sendFCM(token, title, body, url || '/', serviceAccount))
      )
      enviadas += fcmResultados.filter(r => r.status === 'fulfilled' && r.value).length
    }

    return new Response(JSON.stringify({
      enviadas,
      web: webSubs?.length || 0,
      fcm: fcmTokens?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[send-push]', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})