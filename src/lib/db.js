import { supabase } from './supabaseClient.js'

/**
 * Se llama justo después de loguearse. Si el usuario es nuevo (no tiene
 * cuentas todavía), le crea "Efectivo" y "Tarjeta" en $0.00 — así todo
 * usuario arranca limpio, sin datos de otros ni datos de prueba.
 */
export async function asegurarCuentasPorDefecto(userId) {
  const { data: existentes, error } = await supabase
    .from('cuentas')
    .select('id')
    .eq('user_id', userId)

  if (error) {
    console.error('[Kairen Finanzas] Error revisando cuentas:', error.message)
    return
  }

  if (existentes.length === 0) {
    const { error: insertError } = await supabase.from('cuentas').insert([
      { user_id: userId, nombre: 'Efectivo', tipo: 'efectivo', saldo: 0 },
      { user_id: userId, nombre: 'Tarjeta', tipo: 'tarjeta', saldo: 0 }
    ])
    if (insertError) console.error('[Kairen Finanzas] Error creando cuentas:', insertError.message)
  }
}

export async function obtenerCuentas(userId) {
  const { data, error } = await supabase
    .from('cuentas')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[Kairen Finanzas] Error obteniendo cuentas:', error.message)
    return []
  }
  return data
}

/** Trae las transacciones del mes actual, más recientes primero. */
export async function obtenerTransaccionesDelMes(userId) {
  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().slice(0, 10)
  const inicioSiguiente = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('transacciones')
    .select('*')
    .eq('user_id', userId)
    .gte('fecha', inicioMes)
    .lt('fecha', inicioSiguiente)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Kairen Finanzas] Error obteniendo transacciones:', error.message)
    return []
  }
  return data
}

/**
 * Crea una transacción y actualiza el saldo de la cuenta correspondiente.
 * No es una transacción SQL atómica (eso requeriría una función de
 * Postgres/RPC) pero para el volumen de una app personal es suficiente.
 */
export async function crearTransaccion({ userId, cuentaId, categoriaNombre, tipo, monto, descripcion, fecha, cuentaSaldoActual }) {
  const { error: insertError } = await supabase.from('transacciones').insert({
    user_id: userId,
    cuenta_id: cuentaId,
    categoria_nombre: categoriaNombre,
    tipo,
    monto,
    descripcion: descripcion || null,
    fecha
  })
  if (insertError) throw insertError

  const nuevoSaldo = tipo === 'gasto'
    ? cuentaSaldoActual - monto
    : cuentaSaldoActual + monto

  const { error: updateError } = await supabase
    .from('cuentas')
    .update({ saldo: nuevoSaldo })
    .eq('id', cuentaId)
  if (updateError) throw updateError
}
