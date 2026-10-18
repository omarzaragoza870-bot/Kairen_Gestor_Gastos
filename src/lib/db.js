import { supabase } from './supabaseClient.js'
import { fechaLocalISO, hoyLocal } from './fechas.js'

// Solo cuenta como "función no instalada" si Supabase/Postgres lo dice con
// su código específico. Antes bastaba con que el mensaje contuviera la
// palabra "function", y cualquier error legítimo podía confundirse.
const esFuncionNoDisponible = (error) =>
  error?.code === 'PGRST202' ||
  error?.code === '42883' ||
  /could not find the function/i.test(String(error?.message || ''))

const errorFuncionFaltante = (nombreFuncion, archivoSql) =>
  new Error(`Falta la función ${nombreFuncion} en Supabase. Ejecuta ${archivoSql} en el SQL Editor.`)

// Supabase devuelve como máximo ~1000 filas por consulta (según la
// configuración del proyecto). Esta función pide la información en páginas
// hasta traerla completa. `construirConsulta` debe regresar una consulta
// NUEVA cada vez y con un orden estable (por eso se agrega `id` al final).
const TAMANO_PAGINA = 1000

async function traerTodasLasPaginas(construirConsulta) {
  const filas = []
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await construirConsulta().range(desde, desde + TAMANO_PAGINA - 1)
    if (error) throw error
    const pagina = data || []
    filas.push(...pagina)
    if (pagina.length < TAMANO_PAGINA) break
  }
  return filas
}

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

/**
 * Crea una transferencia entre cuentas. `clientOpId` identifica la operación:
 * si la app la reintenta (por ejemplo, desde la cola sin conexión), el
 * servidor no la registra dos veces.
 */
export async function crearTransferencia({ clientOpId, cuentaOrigenId, cuentaDestinoId, monto, descripcion, fecha }) {
  const parametros = {
    p_cuenta_origen_id: cuentaOrigenId,
    p_cuenta_destino_id: cuentaDestinoId,
    p_monto: monto,
    p_descripcion: descripcion || null,
    p_fecha: fecha
  }

  if (clientOpId) {
    const { data, error } = await supabase.rpc('crear_transferencia_idempotente', { p_client_op_id: clientOpId, ...parametros })
    if (!error) return data
    if (!esFuncionNoDisponible(error)) throw error
    // upgrade_v2_8 aún no se ejecuta: se usa la versión atómica sin protección contra duplicados
  }

  const { data, error } = await supabase.rpc('crear_transferencia_segura', parametros)
  if (error) {
    if (esFuncionNoDisponible(error)) throw errorFuncionFaltante('crear_transferencia_segura', 'src/sql/upgrade_v1_5_transferencias.sql')
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
      throw errorFuncionFaltante('pagar_tarjeta_credito', 'src/sql/upgrade_v2_3_tarjetas_credito.sql')
    }
    throw error
  }
  return data
}

/** Todas las transferencias del usuario (para respaldos). */
export async function obtenerTodasLasTransferencias(userId) {
  try {
    return await traerTodasLasPaginas(() => supabase
      .from('transferencias')
      .select('*')
      .eq('user_id', userId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true }))
  } catch (err) {
    console.warn('[Kairen Finanzas] Transferencias no disponibles aún:', err.message)
    return []
  }
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
      throw errorFuncionFaltante('eliminar_transferencia_segura', 'src/sql/upgrade_v1_5_transferencias.sql')
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
  const desde = fechaLocalISO(new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth(), 1))
  const hasta = fechaLocalISO(new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() + 1, 1))

  return traerTodasLasPaginas(() => supabase
    .from('transacciones')
    .select('*')
    .eq('user_id', userId)
    .gte('fecha', desde)
    .lt('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }))
}

export async function obtenerTransaccionesDelMes(userId) {
  return obtenerTransaccionesPorMes(userId, new Date())
}

export async function obtenerTodasLasTransacciones(userId) {
  return traerTodasLasPaginas(() => supabase
    .from('transacciones')
    .select('*')
    .eq('user_id', userId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }))
}

export async function obtenerTransaccionesEnRango(userId, desde, hasta) {
  return traerTodasLasPaginas(() => supabase
    .from('transacciones')
    .select('*')
    .eq('user_id', userId)
    .gte('fecha', desde)
    .lt('fecha', hasta)
    .order('fecha', { ascending: true })
    .order('id', { ascending: true }))
}

/**
 * Trae TODAS las transacciones desde siempre hasta (sin incluir) la fecha
 * dada. Se usa para calcular el "Dinero Disponible" acumulado: si en un
 * mes anterior te sobró dinero, debe seguir contando en los meses
 * siguientes en vez de resetearse a $0 cada mes.
 */
export async function obtenerTransaccionesAcumuladasHasta(userId, hastaExclusiva) {
  return traerTodasLasPaginas(() => supabase
    .from('transacciones')
    .select('id, tipo, monto')
    .eq('user_id', userId)
    .lt('fecha', hastaExclusiva)
    .order('id', { ascending: true }))
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
      throw errorFuncionFaltante('obtener_disponible_historico', 'el respaldo del esquema de producción (supabase/schema_produccion.sql)')
    }
    throw error
  }
  return Number(data) || 0
}

/** Trae todas las transacciones de los últimos N meses, contados desde fechaReferencia (incluye ese mes). */
export async function obtenerTransaccionesUltimosMeses(userId, n = 6, fechaReferencia = new Date()) {
  const desde = fechaLocalISO(new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() - (n - 1), 1))
  const hasta = fechaLocalISO(new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() + 1, 1))
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

/**
 * Registra un abono o retiro y ajusta el total de la meta en UNA sola
 * operación del servidor: o se guardan las dos cosas, o ninguna. El nuevo
 * total lo calcula el servidor con el valor real de la base (no con el que
 * tenía la pantalla), así que dos abonos simultáneos —por ejemplo, de dos
 * colaboradores de una meta compartida— se suman correctamente.
 *
 * Regresa el nuevo monto acumulado de la meta.
 */
export async function registrarContribucionMeta({ metaId, tipo, monto, nota }) {
  const { data, error } = await supabase.rpc('registrar_contribucion_meta', {
    p_meta_id: metaId,
    p_tipo: tipo,
    p_monto: monto,
    p_nota: nota || null,
    p_fecha: hoyLocal()
  })
  if (error) {
    if (esFuncionNoDisponible(error)) throw errorFuncionFaltante('registrar_contribucion_meta', 'src/sql/upgrade_v2_8_estabilidad.sql')
    throw error
  }
  return Number(data)
}

/**
 * Crea un movimiento y ajusta el saldo de su cuenta en una sola operación
 * del servidor. `clientOpId` identifica la operación: si la app la
 * reintenta (por ejemplo, desde la cola sin conexión), el servidor no la
 * registra dos veces.
 *
 * Ya no existe el camino "legacy" que insertaba el movimiento y luego
 * escribía el saldo calculado en el teléfono: podía dejar saldos
 * desajustados. Si falta la función en Supabase, ahora se avisa.
 */
export async function crearTransaccion(datos) {
  const parametros = {
    p_cuenta_id: datos.cuentaId,
    p_categoria_nombre: datos.categoriaNombre,
    p_tipo: datos.tipo,
    p_monto: datos.monto,
    p_descripcion: datos.descripcion || null,
    p_fecha: datos.fecha
  }

  if (datos.clientOpId) {
    const { data, error } = await supabase.rpc('crear_transaccion_idempotente', { p_client_op_id: datos.clientOpId, ...parametros })
    if (!error) return data
    if (!esFuncionNoDisponible(error)) throw error
    // upgrade_v2_8 aún no se ejecuta: se usa la versión atómica sin protección contra duplicados
  }

  const { data, error } = await supabase.rpc('crear_transaccion_segura', parametros)
  if (error) {
    if (esFuncionNoDisponible(error)) throw errorFuncionFaltante('crear_transaccion_segura', 'src/sql/upgrade_v2_3_tarjetas_credito.sql')
    throw error
  }
  return data
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
      throw errorFuncionFaltante('editar_transaccion_segura', 'src/sql/upgrade_v2_3_tarjetas_credito.sql')
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
      throw errorFuncionFaltante('eliminar_transaccion_segura', 'src/sql/upgrade_v2_8_estabilidad.sql')
    }
    throw error
  }
  return data
}

// ============================================================
// Exportar / Importar / Reiniciar cuenta
// ============================================================

/**
 * Respaldo completo (versión 2). Incluye todo lo que el usuario puede
 * restaurar: cuentas (con la configuración de tarjetas), categorías,
 * movimientos, transferencias, presupuestos, recurrentes, metas propias y
 * sus contribuciones, y ahorro externo.
 *
 * Las metas compartidas por otras personas NO se incluyen: son de ellas.
 */
export async function exportarTodosLosDatos(userId) {
  const [cuentas, categorias, transacciones, transferencias, presupuestos, recurrentes, metasVisibles, ahorroExterno] = await Promise.all([
    obtenerCuentas(userId),
    obtenerCategorias(userId),
    obtenerTodasLasTransacciones(userId),
    obtenerTodasLasTransferencias(userId),
    obtenerPresupuestos(userId),
    obtenerRecurrentes(userId),
    obtenerMetas(userId),
    obtenerAhorroExterno(userId)
  ])

  const metas = metasVisibles.filter(m => m.user_id === userId)
  const idsMetas = metas.map(m => m.id)

  const meta_contribuciones = idsMetas.length === 0 ? [] : await traerTodasLasPaginas(() => supabase
    .from('meta_contribuciones')
    .select('*')
    .eq('user_id', userId)
    .in('meta_id', idsMetas)
    .order('fecha', { ascending: true })
    .order('id', { ascending: true }))

  return {
    app: 'kairen-finanzas',
    version: 2,
    exportado_en: new Date().toISOString(),
    cuentas,
    categorias,
    transacciones,
    transferencias,
    presupuestos,
    recurrentes,
    metas,
    meta_contribuciones,
    ahorro_externo: ahorroExterno
  }
}

/**
 * Restaura un respaldo (versión 1 o 2) en UNA sola operación del servidor:
 * si algo falla, no se guarda nada. Solo funciona sobre una cuenta vacía
 * (sin movimientos, metas, recurrentes ni ahorro externo) para no duplicar
 * información; el servidor lo valida y da un mensaje claro si no lo está.
 *
 * Regresa cuántas filas se restauraron de cada tipo y si coinciden con el
 * contenido del archivo.
 */
export async function importarTodosLosDatos(userId, datos) {
  const { data, error } = await supabase.rpc('importar_respaldo', { p_datos: datos })
  if (error) {
    if (esFuncionNoDisponible(error)) throw errorFuncionFaltante('importar_respaldo', 'src/sql/upgrade_v2_8_estabilidad.sql')
    throw error
  }

  const restaurado = data || {}
  // Comprobación posterior: lo que entró contra lo que traía el archivo.
  // (Las metas de otras personas en respaldos v1 se omiten a propósito.)
  const esperado = {
    cuentas: (datos.cuentas || []).length,
    categorias: (datos.categorias || []).length,
    transacciones: (datos.transacciones || []).length,
    transferencias: (datos.transferencias || []).length,
    recurrentes: (datos.recurrentes || []).length,
    ahorro_externo: (datos.ahorro_externo || []).length
  }
  const diferencias = Object.entries(esperado)
    .filter(([tabla, cantidad]) => Number(restaurado[tabla] ?? 0) !== cantidad)
    .map(([tabla, cantidad]) => ({ tabla, esperado: cantidad, restaurado: Number(restaurado[tabla] ?? 0) }))

  return { restaurado, diferencias }
}

/** Borra todos los datos del usuario pero conserva su sesión/cuenta. */
export async function reiniciarCuentaActual(userId) {
  // Todo el borrado + reseteo de saldos ocurre en una sola transacción
  // atómica del servidor — si algo falla, lanza un error real (a diferencia
  // de antes, que hacía updates individuales sin verificar si fallaban).
  const { error } = await supabase.rpc('reiniciar_cuenta_segura')
  if (error) {
    if (esFuncionNoDisponible(error)) {
      throw errorFuncionFaltante('reiniciar_cuenta_segura', 'el respaldo del esquema de producción (supabase/schema_produccion.sql)')
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
    // Se manda la fecha local del dispositivo: el servidor está en UTC y,
    // sin esto, después de las 6 pm en México procesaba las del día siguiente.
    let { data, error } = await supabase.rpc('procesar_recurrentes', { p_hoy: hoyLocal() })
    if (error && esFuncionNoDisponible(error)) {
      // upgrade_v2_8 aún no se ejecuta: versión anterior, sin parámetros
      ;({ data, error } = await supabase.rpc('procesar_recurrentes'))
    }
    if (error) throw error
    return data || 0
  } catch (err) {
    console.warn('[Kairen Finanzas] No se pudieron procesar recurrentes:', err.message)
    return 0
  }
}