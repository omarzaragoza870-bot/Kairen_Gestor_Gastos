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

const CATEGORIAS_GASTO_DEFECTO = {
  es: [
    ['Alimentación', 'UtensilsCrossed'], ['Transporte', 'Car'], ['Servicios', 'Zap'],
    ['Entretenimiento', 'Clapperboard'], ['Ropa', 'Shirt'], ['Salud', 'Heart']
  ],
  en: [
    ['Food', 'UtensilsCrossed'], ['Transportation', 'Car'], ['Utilities', 'Zap'],
    ['Entertainment', 'Clapperboard'], ['Clothing', 'Shirt'], ['Health', 'Heart']
  ]
}
const CATEGORIAS_INGRESO_DEFECTO = {
  es: [
    ['Salario', 'Banknote'], ['Inversiones', 'TrendingUp'], ['Negocios', 'Briefcase'],
    ['Reembolsos', 'RotateCcw'], ['Regalos', 'Gift']
  ],
  en: [
    ['Salary', 'Banknote'], ['Investments', 'TrendingUp'], ['Business', 'Briefcase'],
    ['Refunds', 'RotateCcw'], ['Gifts', 'Gift']
  ]
}

export async function asegurarCategoriasPorDefecto(userId) {
  const { data: existentes, error } = await supabase
    .from('categorias')
    .select('id')
    .eq('user_id', userId)

  if (error) throw error

  if (!existentes || existentes.length === 0) {
    // Usa el idioma real del usuario (guardado por PreferenciasContext) en
    // vez de crear siempre en español — así nunca quedan categorías
    // mezcladas entre idiomas sin importar cuándo se generen.
    let idioma = 'es'
    try { idioma = localStorage.getItem('kairen_idioma') || 'es' } catch { /* noop */ }
    const gastoDefecto = CATEGORIAS_GASTO_DEFECTO[idioma] || CATEGORIAS_GASTO_DEFECTO.es
    const ingresoDefecto = CATEGORIAS_INGRESO_DEFECTO[idioma] || CATEGORIAS_INGRESO_DEFECTO.es
    const filas = [
      ...gastoDefecto.map(([nombre, icono]) => ({ user_id: userId, nombre, tipo: 'gasto', icono })),
      ...ingresoDefecto.map(([nombre, icono]) => ({ user_id: userId, nombre, tipo: 'ingreso', icono }))
    ]
    const { error: insertError } = await supabase.from('categorias').insert(filas)
    if (insertError) throw insertError
  }
}

export async function obtenerCategorias(userId) {
  const { data, error } = await supabase
    .from('categorias')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function crearCategoria({ userId, nombre, tipo, icono }) {
  const { error } = await supabase.from('categorias').insert({
    user_id: userId, nombre, tipo, icono: icono || '🏷️'
  })
  if (error) throw error
}

export async function eliminarCategoria(id, userId) {
  const { error } = await supabase
    .from('categorias')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
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

export async function crearCuenta({ userId, nombre, tipo, saldo, limiteCredito, fechaCorte, fechaPago }) {
  const { error } = await supabase.from('cuentas').insert({
    user_id: userId, nombre, tipo: tipo || 'otro', saldo: saldo || 0,
    limite_credito: tipo === 'tarjeta_credito' ? (limiteCredito || 0) : null,
    fecha_corte: tipo === 'tarjeta_credito' ? (fechaCorte || null) : null,
    fecha_pago: tipo === 'tarjeta_credito' ? (fechaPago || null) : null
  })
  if (error) throw error
}

export async function editarCuenta({ id, userId, nombre, tipo, saldo, limiteCredito, fechaCorte, fechaPago }) {
  const { error } = await supabase
    .from('cuentas')
    .update({
      nombre, tipo, saldo,
      limite_credito: tipo === 'tarjeta_credito' ? (limiteCredito || 0) : null,
      fecha_corte: tipo === 'tarjeta_credito' ? (fechaCorte || null) : null,
      fecha_pago: tipo === 'tarjeta_credito' ? (fechaPago || null) : null
    })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

/**
 * Al eliminar una cuenta, sus transacciones NO se borran — se quedan con
 * cuenta_id en null (por el "on delete set null" del schema) pero
 * conservan su monto y fecha, así el historial no se rompe.
 */
export async function eliminarCuenta(id, userId) {
  const { error } = await supabase
    .from('cuentas')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function crearTransferencia({ cuentaOrigenId, cuentaDestinoId, monto, descripcion, fecha }) {
  const { data, error } = await supabase.rpc('crear_transferencia_segura', {
    p_cuenta_origen_id: cuentaOrigenId,
    p_cuenta_destino_id: cuentaDestinoId,
    p_monto: monto,
    p_descripcion: descripcion || null,
    p_fecha: fecha
  })
  if (error) {
    if (esFuncionNoDisponible(error)) {
      throw new Error('Falta ejecutar src/sql/upgrade_v1_5_transferencias.sql en Supabase para poder transferir entre cuentas.')
    }
    throw error
  }
  return data
}

/**
 * Pago a una tarjeta de crédito: sale de una cuenta normal (efectivo/débito)
 * y reduce la deuda de la tarjeta. Se guarda en la misma tabla de
 * transferencias para que aparezca en el historial de "Administrar Cuentas".
 */
export async function pagarTarjetaCredito({ tarjetaId, cuentaOrigenId, monto, fecha, descripcion }) {
  const { data, error } = await supabase.rpc('pagar_tarjeta_credito', {
    p_tarjeta_id: tarjetaId,
    p_cuenta_origen_id: cuentaOrigenId,
    p_monto: monto,
    p_fecha: fecha,
    p_descripcion: descripcion || null
  })
  if (error) {
    if (esFuncionNoDisponible(error)) {
      throw new Error('Falta ejecutar src/sql/upgrade_v2_2_tarjetas_credito.sql en Supabase para poder pagar tarjetas de crédito.')
    }
    throw error
  }
  return data
}

export async function obtenerTransferencias(userId, limite = 20) {
  try {
    const { data, error } = await supabase
      .from('transferencias')
      .select('*')
      .eq('user_id', userId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limite)

    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('[Kairen Finanzas] Transferencias no disponibles aún:', { timestamp: new Date().toISOString(), detalle: err.message })
    return []
  }
}

export async function eliminarTransferencia(transferenciaId) {
  const { error } = await supabase.rpc('eliminar_transferencia_segura', {
    p_transferencia_id: transferenciaId
  })
  if (error) {
    if (esFuncionNoDisponible(error)) {
      throw new Error('Falta ejecutar src/sql/upgrade_v1_5_transferencias.sql en Supabase para poder eliminar transferencias.')
    }
    throw error
  }
}

export async function obtenerPresupuestos(userId) {
  try {
    const { data, error } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('[Kairen Finanzas] Presupuestos no disponibles aún:', { timestamp: new Date().toISOString(), detalle: err.message })
    return []
  }
}

/** Crea o actualiza el límite de una categoría (una sola fila por categoría). */
export async function guardarPresupuesto({ userId, categoriaNombre, montoLimite }) {
  const { error } = await supabase
    .from('presupuestos')
    .upsert({ user_id: userId, categoria_nombre: categoriaNombre, monto_limite: montoLimite }, { onConflict: 'user_id,categoria_nombre' })
  if (error) throw error
}

export async function eliminarPresupuesto(id, userId) {
  const { error } = await supabase
    .from('presupuestos')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
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

export async function obtenerTransaccionesEnRango(userId, desde, hasta) {
  const { data, error } = await supabase
    .from('transacciones')
    .select('*')
    .eq('user_id', userId)
    .gte('fecha', desde)
    .lt('fecha', hasta)
    .order('fecha', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Trae TODAS las transacciones desde siempre hasta (sin incluir) la fecha
 * dada. Se usa para calcular el "Dinero Disponible" acumulado: si en un
 * mes anterior te sobró dinero, debe seguir contando en los meses
 * siguientes en vez de resetearse a $0 cada mes.
 */
export async function obtenerTransaccionesAcumuladasHasta(userId, hastaExclusiva) {
  const { data, error } = await supabase
    .from('transacciones')
    .select('tipo, monto')
    .eq('user_id', userId)
    .lt('fecha', hastaExclusiva)

  if (error) throw error
  return data || []
}

/**
 * "Dinero Disponible" real: ingresos - gastos de cuentas líquidas (efectivo,
 * débito, banco, otro) hasta la fecha dada, menos los pagos ya hechos hacia
 * tarjetas de crédito. Los gastos hechos CON tarjeta de crédito no bajan
 * este número — esa deuda se ve aparte, en la tarjeta misma — solo bajan
 * cuando de verdad pagas la tarjeta desde una cuenta real.
 */
export async function obtenerDisponibleHistorico(userId, hastaExclusiva) {
  const { data, error } = await supabase.rpc('obtener_disponible_historico', {
    p_hasta: hastaExclusiva
  })
  if (error) {
    if (esFuncionNoDisponible(error)) {
      throw new Error('Falta ejecutar src/sql/upgrade_v2_3_disponible_sin_credito.sql en Supabase.')
    }
    throw error
  }
  return Number(data) || 0
}

/** Trae todas las transacciones de los últimos N meses, contados desde fechaReferencia (incluye ese mes). */
export async function obtenerTransaccionesUltimosMeses(userId, n = 6, fechaReferencia = new Date()) {
  const desde = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() - (n - 1), 1).toISOString().slice(0, 10)
  const hasta = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() + 1, 1).toISOString().slice(0, 10)
  return obtenerTransaccionesEnRango(userId, desde, hasta)
}

export async function obtenerTransaccionesMesAnterior(userId) {
  const ahora = new Date()
  return obtenerTransaccionesPorMes(userId, new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1))
}

export async function obtenerAhorroExterno(userId) {
  const { data, error } = await supabase
    .from('ahorro_externo')
    .select('*')
    .eq('user_id', userId)
    .order('fecha_registro', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function crearAhorroExterno({ userId, nombreBanco, monto, fechaRegistro, nota }) {
  const { error } = await supabase.from('ahorro_externo').insert({
    user_id: userId,
    nombre_banco: nombreBanco,
    monto,
    fecha_registro: fechaRegistro,
    nota: nota || null
  })
  if (error) throw error
}

export async function editarAhorroExterno({ id, userId, nombreBanco, monto, fechaRegistro, nota }) {
  const { error } = await supabase
    .from('ahorro_externo')
    .update({ nombre_banco: nombreBanco, monto, fecha_registro: fechaRegistro, nota: nota || null })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function eliminarAhorroExterno(id, userId) {
  const { error } = await supabase
    .from('ahorro_externo')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function obtenerMetas(userId) {
  // Usa la función RPC que incluye metas propias + compartidas en grupos
  const { data, error } = await supabase.rpc('obtener_metas_visibles')
  if (error) throw error
  return data || []
}

export async function crearMeta({ userId, nombre, descripcion, icono, prioridad, montoObjetivo, montoActual, fechaLimite }) {
  const { error } = await supabase.from('metas').insert({
    user_id: userId,
    nombre,
    descripcion: descripcion || null,
    icono: icono || '🎯',
    prioridad: prioridad || 'media',
    monto_objetivo: montoObjetivo,
    monto_actual: montoActual || 0,
    fecha_limite: fechaLimite || null,
    completada: (montoActual || 0) >= montoObjetivo
  })
  if (error) throw error
}

export async function editarMeta({ id, userId, nombre, descripcion, icono, prioridad, montoObjetivo, montoActual, fechaLimite }) {
  const { error } = await supabase
    .from('metas')
    .update({
      nombre,
      descripcion: descripcion || null,
      icono: icono || '🎯',
      prioridad: prioridad || 'media',
      monto_objetivo: montoObjetivo,
      monto_actual: montoActual,
      fecha_limite: fechaLimite || null,
      completada: montoActual >= montoObjetivo
    })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function marcarMetaCompletada(id, userId, completada) {
  const { error } = await supabase
    .from('metas')
    .update({ completada })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function eliminarMeta(id, userId) {
  const { error } = await supabase
    .from('metas')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function obtenerContribucionesMeta(metaId, userId) {
  const { data, error } = await supabase
    .from('meta_contribuciones')
    .select('*')
    .eq('meta_id', metaId)
    .eq('user_id', userId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/** Registra un abono o retiro y ajusta el monto_actual de la meta correspondiente. */
export async function registrarContribucionMeta({ metaId, userId, tipo, monto, nota, montoActualPrevio, montoObjetivo }) {
  const { error: insertError } = await supabase.from('meta_contribuciones').insert({
    user_id: userId,
    meta_id: metaId,
    tipo,
    monto,
    nota: nota || null,
    fecha: new Date().toISOString().slice(0, 10)
  })
  if (insertError) throw insertError

  const nuevoMonto = tipo === 'contribucion' ? montoActualPrevio + monto : Math.max(0, montoActualPrevio - monto)

  const { error: updateError } = await supabase
    .from('metas')
    .update({ monto_actual: nuevoMonto, completada: nuevoMonto >= montoObjetivo })
    .eq('id', metaId)
    .eq('user_id', userId)
  if (updateError) throw updateError

  return nuevoMonto
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

// ============================================================
// Exportar / Importar / Reiniciar cuenta
// ============================================================

export async function exportarTodosLosDatos(userId) {
  const [cuentas, categorias, transacciones, metas, ahorroExterno] = await Promise.all([
    obtenerCuentas(userId),
    obtenerCategorias(userId),
    obtenerTodasLasTransacciones(userId),
    obtenerMetas(userId),
    obtenerAhorroExterno(userId)
  ])

  // Contribuciones de todas las metas juntas
  const contribuciones = []
  for (const meta of metas) {
    const propias = await obtenerContribucionesMeta(meta.id, userId)
    contribuciones.push(...propias)
  }

  return {
    version: 1,
    exportado_en: new Date().toISOString(),
    cuentas,
    categorias,
    transacciones,
    metas,
    meta_contribuciones: contribuciones,
    ahorro_externo: ahorroExterno
  }
}

/**
 * Importa un respaldo generado por exportarTodosLosDatos. Como los IDs
 * viejos no existen en esta base, se crean filas nuevas y se arma un
 * mapa id-viejo -> id-nuevo para que las referencias (cuenta_id,
 * categoria_id, meta_id) sigan apuntando correctamente.
 */
export async function importarTodosLosDatos(userId, datos) {
  const mapaCuentas = new Map()
  const mapaCategorias = new Map()
  const mapaMetas = new Map()

  for (const c of datos.cuentas || []) {
    const { data, error } = await supabase.from('cuentas')
      .insert({ user_id: userId, nombre: c.nombre, tipo: c.tipo, saldo: c.saldo })
      .select('id').single()
    if (error) throw error
    mapaCuentas.set(c.id, data.id)
  }

  for (const c of datos.categorias || []) {
    const { data, error } = await supabase.from('categorias')
      .insert({ user_id: userId, nombre: c.nombre, tipo: c.tipo, icono: c.icono })
      .select('id').single()
    if (error) throw error
    mapaCategorias.set(c.id, data.id)
  }

  for (const m of datos.metas || []) {
    const { data, error } = await supabase.from('metas')
      .insert({
        user_id: userId, nombre: m.nombre, descripcion: m.descripcion, icono: m.icono,
        prioridad: m.prioridad, monto_objetivo: m.monto_objetivo, monto_actual: m.monto_actual,
        fecha_limite: m.fecha_limite, completada: m.completada
      })
      .select('id').single()
    if (error) throw error
    mapaMetas.set(m.id, data.id)
  }

  for (const t of datos.transacciones || []) {
    const { error } = await supabase.from('transacciones').insert({
      user_id: userId,
      cuenta_id: mapaCuentas.get(t.cuenta_id) || null,
      categoria_id: mapaCategorias.get(t.categoria_id) || null,
      categoria_nombre: t.categoria_nombre,
      tipo: t.tipo, monto: t.monto, descripcion: t.descripcion, fecha: t.fecha
    })
    if (error) throw error
  }

  for (const mc of datos.meta_contribuciones || []) {
    const metaNueva = mapaMetas.get(mc.meta_id)
    if (!metaNueva) continue
    const { error } = await supabase.from('meta_contribuciones').insert({
      user_id: userId, meta_id: metaNueva, tipo: mc.tipo, monto: mc.monto, nota: mc.nota, fecha: mc.fecha
    })
    if (error) throw error
  }

  for (const a of datos.ahorro_externo || []) {
    const { error } = await supabase.from('ahorro_externo').insert({
      user_id: userId, nombre_banco: a.nombre_banco, monto: a.monto, fecha_registro: a.fecha_registro, nota: a.nota
    })
    if (error) throw error
  }
}

/** Borra todos los datos del usuario pero conserva su sesión/cuenta. */
export async function reiniciarCuentaActual(userId) {
  // Todo el borrado + reseteo de saldos ocurre en una sola transacción
  // atómica del servidor — si algo falla, lanza un error real (a diferencia
  // de antes, que hacía updates individuales sin verificar si fallaban).
  const { error } = await supabase.rpc('reiniciar_cuenta_segura')
  if (error) {
    if (esFuncionNoDisponible(error)) {
      throw new Error('Falta ejecutar src/sql/upgrade_v2_7_reiniciar_seguro.sql en Supabase para poder reiniciar la cuenta.')
    }
    throw error
  }

  await asegurarCategoriasPorDefecto(userId)
}
// ─── Transacciones Recurrentes ────────────────────────────────────────────

export async function obtenerRecurrentes(userId) {
  try {
    const { data, error } = await supabase
      .from('recurrentes')
      .select('*')
      .eq('user_id', userId)
      .order('proxima_fecha', { ascending: true })
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('[Kairen Finanzas] Recurrentes no disponibles aún:', err.message)
    return []
  }
}

export async function crearRecurrente({ userId, cuentaId, cuentaNombre, tipo, categoriaNombre, monto, descripcion, frecuencia, proximaFecha }) {
  const { error } = await supabase.from('recurrentes').insert({
    user_id: userId,
    cuenta_id: cuentaId,
    cuenta_nombre: cuentaNombre,
    tipo,
    categoria_nombre: categoriaNombre,
    monto,
    descripcion: descripcion || null,
    frecuencia,
    proxima_fecha: proximaFecha
  })
  if (error) throw error
}

export async function editarRecurrente({ id, userId, cuentaId, cuentaNombre, tipo, categoriaNombre, monto, descripcion, frecuencia, proximaFecha, activa }) {
  const { error } = await supabase
    .from('recurrentes')
    .update({ cuenta_id: cuentaId, cuenta_nombre: cuentaNombre, tipo, categoria_nombre: categoriaNombre, monto, descripcion: descripcion || null, frecuencia, proxima_fecha: proximaFecha, activa })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function eliminarRecurrente(id, userId) {
  const { error } = await supabase
    .from('recurrentes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function procesarRecurrentes() {
  try {
    const { data, error } = await supabase.rpc('procesar_recurrentes')
    if (error) throw error
    return data || 0
  } catch (err) {
    console.warn('[Kairen Finanzas] No se pudieron procesar recurrentes:', err.message)
    return 0
  }
}
