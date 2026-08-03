import { supabase } from './supabaseClient.js'

/**
 * Logger mínimo con contexto estructurado (LOG-03/05/07): agrega quién
 * (usuario actual, si hay sesión), cuándo (timestamp ISO 8601 UTC), y
 * el mensaje/error tal cual. No sustituye un sistema de logging real
 * con agregación remota — sigue siendo console.* — pero deja cada
 * entrada con los campos mínimos para poder correlacionar un reporte
 * de un usuario con lo que pasó en su sesión.
 */
async function contexto() {
  try {
    const { data } = await supabase.auth.getSession()
    return { usuario: data.session?.user?.id || 'anónimo', timestamp: new Date().toISOString() }
  } catch {
    return { usuario: 'desconocido', timestamp: new Date().toISOString() }
  }
}

export async function logError(mensaje, err) {
  const ctx = await contexto()
  console.error(`[Kairen Finanzas] ${mensaje}`, {
    usuario: ctx.usuario,
    timestamp: ctx.timestamp,
    error: err?.message || err
  })
}

export async function logWarn(mensaje, err) {
  const ctx = await contexto()
  console.warn(`[Kairen Finanzas] ${mensaje}`, {
    usuario: ctx.usuario,
    timestamp: ctx.timestamp,
    detalle: err?.message || err
  })
}