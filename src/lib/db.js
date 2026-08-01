import { supabase } from './supabaseClient.js'

const esFuncionNoDisponible = (error) =>
  error?.code === 'PGRST202' ||
  error?.code === '42883' ||
  String(error?.message || '').toLowerCase().includes('function')

export async function asegurarCuentasPorDefecto(userId) {
  const { data: existentes, error } = await supabase
    .from('cuentas')
    .select('id')
    .eq('user_id', userId)

  if (error) throw error

  if (!existentes || existentes.length === 0) {
    const { error: insertError } = await supabase.from('cuentas').insert([
      { user_id: userId, nombre: 'Efectivo', tipo: 'efectivo', saldo: 0 },
      { user_id: userId, nombre: 'Tarjeta', tipo: 'tarjeta', saldo: 0 }
    ])
    if (insertError) throw insertError
  }
}

export async function obtenerCuentas(userId) {
  const { data, error } = await supabase
    .from('cuentas')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function obtenerTransaccionesPorMes(userId, fechaReferencia = new Date()) {
  const inicioMes = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth(), 1)
  const inicioSiguiente = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() + 1, 1)
  const desde = inicioMes.toISOString().slice(0, 10)
  const hasta = inicioSiguiente.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('transacciones')
    .select('*')
    .eq('user_id', userId)
    .gte('fecha', desde)
    .lt('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function obtenerTransaccionesDelMes(userId) {
  return obtenerTransaccionesPorMes(userId, new Date())
}

export async function obtenerTodasLasTransacciones(userId) {
  const { data, error } = await supabase
    .from('transacciones')
    .select('*')
    .eq('user_id', userId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

async function crearTransaccionLegacy({ userId, cuentaId, categoriaNombre, tipo, monto, descripcion, fecha, cuentaSaldoActual }) {
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
    .eq('user_id', userId)

  if (updateError) throw updateError
}

export async function crearTransaccion(datos) {
  const { data, error } = await supabase.rpc('crear_transaccion_segura', {
    p_cuenta_id: datos.cuentaId,
    p_categoria_nombre: datos.categoriaNombre,
    p_tipo: datos.tipo,
    p_monto: datos.monto,
    p_descripcion: datos.descripcion || null,
    p_fecha: datos.fecha
  })

  if (!error) return data

  // Mantiene compatibilidad hasta que se ejecute upgrade_v1_1.sql.
  if (esFuncionNoDisponible(error)) return crearTransaccionLegacy(datos)
  throw error
}

export async function editarTransaccion({ transaccionId, cuentaId, categoriaNombre, tipo, monto, descripcion, fecha }) {
  const { data, error } = await supabase.rpc('editar_transaccion_segura', {
    p_transaccion_id: transaccionId,
    p_cuenta_id: cuentaId,
    p_categoria_nombre: categoriaNombre,
    p_tipo: tipo,
    p_monto: monto,
    p_descripcion: descripcion || null,
    p_fecha: fecha
  })

  if (error) {
    if (esFuncionNoDisponible(error)) {
      throw new Error('Falta ejecutar src/sql/upgrade_v1_1.sql en Supabase para poder editar movimientos.')
    }
    throw error
  }
  return data
}

export async function eliminarTransaccion(transaccionId) {
  const { data, error } = await supabase.rpc('eliminar_transaccion_segura', {
    p_transaccion_id: transaccionId
  })

  if (error) {
    if (esFuncionNoDisponible(error)) {
      throw new Error('Falta ejecutar src/sql/upgrade_v1_1.sql en Supabase para poder eliminar movimientos.')
    }
    throw error
  }
  return data
}
