// ============================================================
// Kairen Finanzas — Fechas locales
//
// NUNCA usar `new Date().toISOString().slice(0, 10)` para "hoy":
// toISOString() convierte a UTC, y en México (UTC-6) cualquier cosa
// registrada después de las 6:00 pm quedaba con la fecha de MAÑANA
// (y el último día del mes caía en el mes siguiente).
//
// Estas funciones usan siempre la fecha del calendario del dispositivo.
// ============================================================

const dosDigitos = (n) => String(n).padStart(2, '0')

/** Convierte un Date a 'YYYY-MM-DD' usando la fecha LOCAL (no UTC). */
export function fechaLocalISO(fecha = new Date()) {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`
}

/** Fecha de hoy en el dispositivo, formato 'YYYY-MM-DD'. */
export function hoyLocal() {
  return fechaLocalISO(new Date())
}
