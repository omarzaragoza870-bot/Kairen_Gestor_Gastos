// ============================================================
// Kairen Finanzas — Compras a meses en la tarjeta
//
// La pantalla muestra el PRÓXIMO estado de cuenta: todo hasta el siguiente
// día de corte; las mensualidades posteriores siguen "a meses". Sin día de
// corte, fin de mes. (Los avisos de pago del servidor hablan del corte que
// ya pasó, así que entre el corte y la fecha de pago las cifras difieren a
// propósito.)
// ============================================================

import { fechaLocalISO } from './fechas.js'

/** Último día ('YYYY-MM-DD') que entra en el próximo estado de cuenta. */
export function fechaProximoCorte(diaCorte, hoy = new Date()) {
  const anio = hoy.getFullYear()
  const mes = hoy.getMonth()
  const ultimoDia = (a, m) => new Date(a, m + 1, 0).getDate()
  if (!diaCorte) return fechaLocalISO(new Date(anio, mes, ultimoDia(anio, mes)))

  const corteEsteMes = new Date(anio, mes, Math.min(diaCorte, ultimoDia(anio, mes)))
  if (corteEsteMes.getDate() >= hoy.getDate()) return fechaLocalISO(corteEsteMes)
  return fechaLocalISO(new Date(anio, mes + 1, Math.min(diaCorte, ultimoDia(anio, mes + 1))))
}

/**
 * Reparte la deuda de una tarjeta en { alCorte, aMeses }. `mensualidades` son
 * filas { cuenta_id, monto, fecha } de compras a meses. Lo que queda a meses
 * nunca pasa de la deuda: si ya se pagó la tarjeta, no queda nada.
 */
export function repartirDeuda(tarjeta, mensualidades, hoy = new Date()) {
  const deuda = Math.max(Number(tarjeta.saldo || 0), 0)
  const corte = fechaProximoCorte(tarjeta.fecha_corte, hoy)
  const futuras = mensualidades
    .filter(m => m.cuenta_id === tarjeta.id && m.fecha > corte)
    .reduce((s, m) => s + Number(m.monto), 0)
  const aMeses = Math.min(futuras, deuda)
  return { alCorte: deuda - aMeses, aMeses }
}
