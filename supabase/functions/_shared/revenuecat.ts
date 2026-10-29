// supabase/functions/_shared/revenuecat.ts
//
// Fuente de verdad del premium pagado: la API de RevenueCat, nunca lo que
// diga el teléfono ni el cuerpo de un webhook. Se pregunta por el usuario y
// se escribe el resultado en perfiles.plan con la service_role (el trigger
// proteger_plan_perfil solo bloquea a anon/authenticated).
//
// acceso_fundador (premium de por vida) no se toca aquí.
//
// Secretos: REVENUECAT_SECRET_KEY (llave secreta v1 del proyecto en RevenueCat).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0'

export const ENTITLEMENT_PREMIUM = 'premium'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Los app_user_id de RevenueCat que son usuarios de Supabase (descarta los $RCAnonymousID). */
export function esUsuarioSupabase(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id)
}

/** Consulta RevenueCat y deja perfiles.plan en 'premium' o 'gratis'. Devuelve si quedó activo. */
export async function sincronizarPremium(admin: SupabaseClient, userId: string): Promise<boolean> {
  const llave = Deno.env.get('REVENUECAT_SECRET_KEY')
  if (!llave) throw new Error('Falta el secreto REVENUECAT_SECRET_KEY')

  const resp = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' }
  })
  if (!resp.ok) throw new Error(`RevenueCat respondió ${resp.status}`)
  const { subscriber } = await resp.json()

  const derecho = subscriber?.entitlements?.[ENTITLEMENT_PREMIUM]
  // expires_date null = sin vencimiento (compra única de por vida)
  const activo = Boolean(derecho) &&
    (derecho.expires_date === null || new Date(derecho.expires_date).getTime() > Date.now())

  // upsert: si el usuario no tuviera fila en perfiles, un update no tocaría
  // nada y el pago se quedaría sin premium sin que nadie se entere
  const { error } = await admin
    .from('perfiles')
    .upsert({ user_id: userId, plan: activo ? 'premium' : 'gratis' }, { onConflict: 'user_id' })
  if (error) throw error
  return activo
}
