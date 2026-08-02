/**
 * Convierte un error en un mensaje seguro para mostrar al usuario.
 *
 * Nuestras propias excepciones de Postgres (las que escribimos con
 * `raise exception '...'` en las funciones RPC) ya están redactadas
 * para ser amigables — esas se muestran tal cual. Cualquier otro error
 * (violación de constraint, permisos, nombres de columna/tabla, etc.)
 * se reemplaza por un mensaje genérico para no filtrar detalles
 * internos de la base de datos (DATA-03).
 */
export function mensajeAmigable(err, fallback = 'Algo salió mal. Intenta de nuevo.') {
  const msg = err?.message || ''

  const patronesInternos = [
    /violates?/i,
    /constraint/i,
    /duplicate key/i,
    /permission denied/i,
    /relation ".*" does not exist/i,
    /column ".*"/i,
    /null value in column/i,
    /invalid input syntax/i,
    /row-level security/i,
    /policy/i
  ]

  const pareceInterno = patronesInternos.some(regex => regex.test(msg))
  if (pareceInterno || !msg) return fallback

  return msg
}
