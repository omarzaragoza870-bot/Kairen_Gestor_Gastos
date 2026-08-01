const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function sumar(transacciones, tipo) {
  return transacciones
    .filter(t => t.tipo === tipo)
    .reduce((acc, t) => acc + Number(t.monto), 0)
}

/** Agrupa por categoría, sumando montos y calculando % del total. */
export function agruparPorCategoria(transacciones, tipo) {
  const filtradas = transacciones.filter(t => t.tipo === tipo)
  const total = filtradas.reduce((acc, t) => acc + Number(t.monto), 0)
  const mapa = new Map()

  for (const t of filtradas) {
    const actual = mapa.get(t.categoria_nombre) || 0
    mapa.set(t.categoria_nombre, actual + Number(t.monto))
  }

  return [...mapa.entries()]
    .map(([nombre, monto]) => ({ nombre, monto, pct: total > 0 ? (monto / total) * 100 : 0 }))
    .sort((a, b) => b.monto - a.monto)
}

/** Agrupa por cuenta (Efectivo/Tarjeta), igual que por categoría. */
export function agruparPorCuenta(transacciones, tipo, cuentasPorId) {
  const filtradas = transacciones.filter(t => t.tipo === tipo)
  const total = filtradas.reduce((acc, t) => acc + Number(t.monto), 0)
  const mapa = new Map()

  for (const t of filtradas) {
    const nombre = cuentasPorId[t.cuenta_id]?.nombre || 'Cuenta eliminada'
    mapa.set(nombre, (mapa.get(nombre) || 0) + Number(t.monto))
  }

  return [...mapa.entries()]
    .map(([nombre, monto]) => ({ nombre, monto, pct: total > 0 ? (monto / total) * 100 : 0 }))
    .sort((a, b) => b.monto - a.monto)
}

/** Suma ingresos/gastos por mes, para las últimas N ventanas mensuales. */
export function agruparPorMes(transacciones, n = 6) {
  const ahora = new Date()
  const meses = []

  for (let i = n - 1; i >= 0; i--) {
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
    const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
    meses.push({
      clave,
      etiqueta: fecha.toLocaleDateString('es-MX', { month: 'short' }),
      ingresos: 0,
      gastos: 0
    })
  }

  const indice = new Map(meses.map(m => [m.clave, m]))

  for (const t of transacciones) {
    const [anio, mes] = t.fecha.split('-')
    const clave = `${anio}-${mes}`
    const bucket = indice.get(clave)
    if (!bucket) continue
    if (t.tipo === 'ingreso') bucket.ingresos += Number(t.monto)
    else bucket.gastos += Number(t.monto)
  }

  return meses
}

/** Estadísticas de hábitos del mes: mayor gasto, categoría frecuente, día que más gasta, promedio. */
export function calcularHabitos(transacciones) {
  const gastos = transacciones.filter(t => t.tipo === 'gasto')
  if (gastos.length === 0) return null

  const mayorGasto = gastos.reduce((max, t) => Number(t.monto) > Number(max.monto) ? t : max, gastos[0])

  const conteoCategoria = new Map()
  for (const t of gastos) conteoCategoria.set(t.categoria_nombre, (conteoCategoria.get(t.categoria_nombre) || 0) + 1)
  const [categoriaFrecuente, vecesFrecuente] = [...conteoCategoria.entries()].sort((a, b) => b[1] - a[1])[0]

  const gastoPorDia = new Map()
  for (const t of gastos) {
    const diaSemana = new Date(`${t.fecha}T12:00:00`).getDay()
    gastoPorDia.set(diaSemana, (gastoPorDia.get(diaSemana) || 0) + Number(t.monto))
  }
  const [diaTop] = [...gastoPorDia.entries()].sort((a, b) => b[1] - a[1])[0]

  const promedio = gastos.reduce((acc, t) => acc + Number(t.monto), 0) / gastos.length

  return {
    mayorGasto: Number(mayorGasto.monto),
    mayorGastoCategoria: mayorGasto.categoria_nombre,
    categoriaFrecuente,
    vecesFrecuente,
    diaTop: DIAS[diaTop],
    promedio
  }
}

/** Insights tipo "tendencias detectadas", igual espíritu que la app original. */
export function calcularInsights(transacciones, cuentasPorId) {
  const insights = []
  const gastos = transacciones.filter(t => t.tipo === 'gasto')
  const ingresos = transacciones.filter(t => t.tipo === 'ingreso')
  const totalGastos = sumar(transacciones, 'gasto')
  const totalIngresos = sumar(transacciones, 'ingreso')

  if (gastos.length > 0) {
    const porCategoria = agruparPorCategoria(transacciones, 'gasto')
    const top = porCategoria[0]
    insights.push({
      icono: '🔴',
      titulo: `Tu mayor gasto es en ${top.nombre}`,
      detalle: `El ${top.pct.toFixed(0)}% de tus gastos fueron en ${top.nombre} (${top.monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })})`
    })

    const gastosFinDeSemana = gastos.filter(t => {
      const dia = new Date(`${t.fecha}T12:00:00`).getDay()
      return dia === 0 || dia === 6
    })
    if (gastosFinDeSemana.length === 0) {
      insights.push({ icono: '🟢', titulo: 'Cuidas tu dinero los fines de semana', detalle: 'No tienes gastos los fines de semana. ¡Excelente control!' })
    }
  }

  if (totalIngresos > 0) {
    const ahorro = totalIngresos - totalGastos
    const pctAhorro = (ahorro / totalIngresos) * 100
    if (pctAhorro >= 0) {
      insights.push({
        icono: '🌿',
        titulo: '¡Excelente control financiero!',
        detalle: `Ahorraste ${ahorro.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} este período (${pctAhorro.toFixed(0)}% de tus ingresos)`
      })
    }
  }

  if (gastos.length > 0) {
    const porDia = new Map()
    for (const t of gastos) {
      porDia.set(t.fecha, { total: (porDia.get(t.fecha)?.total || 0) + Number(t.monto), n: (porDia.get(t.fecha)?.n || 0) + 1 })
    }
    const [fechaTop, datosTop] = [...porDia.entries()].sort((a, b) => b[1].total - a[1].total)[0]
    const etiquetaFecha = new Date(`${fechaTop}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    insights.push({
      icono: '🔥',
      titulo: `Tu día más activo fue el ${etiquetaFecha}`,
      detalle: `Hiciste ${datosTop.n} ${datosTop.n === 1 ? 'compra' : 'compras'} por ${datosTop.total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} ese día`
    })

    const porCuenta = agruparPorCuenta(transacciones, 'gasto', cuentasPorId)
    if (porCuenta.length > 0) {
      const top = porCuenta[0]
      insights.push({
        icono: '💳',
        titulo: `Gastas más desde ${top.nombre}`,
        detalle: `El ${top.pct.toFixed(0)}% de tus gastos fueron desde esta cuenta (${top.monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })})`
      })
    }
  }

  return insights
}

export function compararConMesAnterior(mesActual, mesAnterior) {
  const ingresoActual = sumar(mesActual, 'ingreso')
  const gastoActual = sumar(mesActual, 'gasto')
  const ingresoAnterior = sumar(mesAnterior, 'ingreso')
  const gastoAnterior = sumar(mesAnterior, 'gasto')

  const variacion = (actual, anterior) => {
    if (anterior === 0) return actual === 0 ? null : 'Nuevo'
    const pct = ((actual - anterior) / anterior) * 100
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`
  }

  return {
    ingresoActual,
    gastoActual,
    variacionIngreso: variacion(ingresoActual, ingresoAnterior),
    variacionGasto: variacion(gastoActual, gastoAnterior)
  }
}

export { DIAS, DIAS_CORTO }
