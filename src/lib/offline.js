// ============================================================
// Kairen Finanzas — Offline
//
// Dos piezas, ambas en IndexedDB (persisten sin conexión y sobreviven
// a que se cierre la app — a diferencia de una variable en memoria):
//
// 1. "cache"  — guarda el último resultado exitoso de una consulta
//    (ej. transacciones del mes) para poder mostrarlo si no hay red.
// 2. "cola"   — guarda operaciones de escritura (crear transacción,
//    transferencia, etc.) que no se pudieron mandar por falta de red,
//    para reintentarlas automáticamente cuando vuelva la conexión.
//    Cada operación lleva un clientOpId: el servidor no la registra dos
//    veces aunque se reintente (ver upgrade_v2_8_estabilidad.sql).
//
// Esto es 100% web estándar (IndexedDB + evento 'online'), así que
// funciona igual dentro de un WebView de Capacitor cuando empaquetes
// la versión nativa — no requiere ningún plugin nativo extra.
// ============================================================

const DB_NAME = 'kairenOffline'
const DB_VERSION = 1
const STORE_CACHE = 'cache'
const STORE_COLA = 'cola'

// ---------- Conectividad combinada ----------
//
// navigator.onLine / los eventos 'online'-'offline' del navegador SOLO
// reaccionan a que tu WiFi/datos reales se desconecten a nivel de
// sistema operativo — el modo "Offline" de las DevTools bloquea
// peticiones, pero NO cambia navigator.onLine. Para que el banner
// funcione en ambos casos, combinamos dos señales:
//   1. El evento real del navegador (para desconexiones reales)
//   2. Que una petición de red de verdad haya fallado/tenido éxito
//      (esto sí lo detecta la simulación de DevTools)
const emisorConectividad = new EventTarget()
let conectividadActual = typeof navigator !== 'undefined' ? navigator.onLine : true

export function marcarConectividad(estado) {
  if (estado !== conectividadActual) {
    conectividadActual = estado
    emisorConectividad.dispatchEvent(new CustomEvent('cambio', { detail: estado }))
  }
}

export function obtenerConectividad() {
  return conectividadActual
}

export function suscribirseConectividad(callback) {
  const manejador = (e) => callback(e.detail)
  emisorConectividad.addEventListener('cambio', manejador)
  return () => emisorConectividad.removeEventListener('cambio', manejador)
}

/**
 * ¿El error se debe a que no hubo conexión con el servidor?
 *
 * Solo reconoce los mensajes que generan los navegadores/WebViews cuando la
 * petición nunca llegó o nunca regresó ("Failed to fetch" en Chrome/Android,
 * "Load failed" en Safari/iOS, "NetworkError…" en Firefox). Antes bastaba
 * con que el mensaje contuviera "failed", y eso hacía que errores reales del
 * servidor se guardaran como "pendientes sin conexión".
 */
export function pareceErrorDeRed(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = String(err?.message || err || '').toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('network error') ||
    msg.includes('fetch failed') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('err_network_changed') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  )
}

/**
 * Identificador único para una operación de escritura. Se genera UNA vez por
 * operación (al abrir el formulario) y viaja con ella hasta el servidor, que
 * lo usa para no registrarla dos veces aunque la app la reintente.
 */
export function generarIdOperacion() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* noop */ }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'clave' })
      }
      if (!db.objectStoreNames.contains(STORE_COLA)) {
        db.createObjectStore(STORE_COLA, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function conTienda(nombreTienda, modo, fn) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(nombreTienda, modo)
    const tienda = tx.objectStore(nombreTienda)
    const resultado = fn(tienda)
    tx.oncomplete = () => resolve(resultado)
    tx.onerror = () => reject(tx.error)
  })
}

// ---------- Caché de lectura ----------

/** Guarda el último resultado exitoso de una consulta, identificado por una clave. */
export async function guardarEnCache(clave, valor) {
  try {
    await conTienda(STORE_CACHE, 'readwrite', tienda => {
      tienda.put({ clave, valor, guardadoEn: new Date().toISOString() })
    })
  } catch {
    // Si IndexedDB falla (modo incógnito muy restringido, cuota llena, etc.)
    // simplemente no cacheamos — no es crítico, solo perdemos el offline fallback.
  }
}

/** Recupera el último resultado guardado para una clave, o null si no hay nada. */
export async function leerDeCache(clave) {
  try {
    const db = await abrirDB()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_CACHE, 'readonly')
      const req = tx.objectStore(STORE_CACHE).get(clave)
      req.onsuccess = () => resolve(req.result?.valor ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

/**
 * Envuelve una función async (ej. obtenerTransaccionesPorMes) para que:
 * - si tiene éxito, guarde el resultado en caché y lo regrese normal
 * - si falla por falta de red, regrese el último resultado cacheado
 *   en vez de tronar (el aviso de "sin conexión" ya lo muestra el
 *   banner global — aquí solo nos importa no dejar la pantalla en blanco)
 */
export async function conRespaldoOffline(clave, fnRed) {
  try {
    const resultado = await fnRed()
    guardarEnCache(clave, resultado) // no esperamos a que termine, no bloquea la UI
    marcarConectividad(true)
    return resultado
  } catch (err) {
    if (pareceErrorDeRed(err)) {
      marcarConectividad(false)
      const cacheado = await leerDeCache(clave)
      if (cacheado !== null) return cacheado
    }
    throw err
  }
}

// ---------- Cola de escritura pendiente ----------

// Tras este número de intentos fallidos por un error que NO es de red
// (ej. la cuenta ya no existe), la operación sale de la cola y se guarda
// aparte para no bloquear ni reintentar para siempre.
const MAX_INTENTOS = 5
const CLAVE_FALLIDAS = 'cola-fallidas'

/** Agrega una operación a la cola (ej. { accion: 'crearTransaccion', datos: {...} }). */
export async function encolarOperacion(operacion) {
  return conTienda(STORE_COLA, 'readwrite', tienda => {
    tienda.add({ ...operacion, intentos: 0, creadoEn: new Date().toISOString() })
  })
}

export async function obtenerColaPendiente() {
  try {
    const db = await abrirDB()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_COLA, 'readonly')
      const req = tx.objectStore(STORE_COLA).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

export async function eliminarDeCola(id) {
  return conTienda(STORE_COLA, 'readwrite', tienda => {
    tienda.delete(id)
  })
}

async function actualizarEnCola(op) {
  return conTienda(STORE_COLA, 'readwrite', tienda => {
    tienda.put(op)
  })
}

/** Operaciones que el servidor rechazó varias veces y ya no se reintentan. */
export async function obtenerOperacionesFallidas() {
  return (await leerDeCache(CLAVE_FALLIDAS)) || []
}

async function moverAFallidas(op, err) {
  const fallidas = await obtenerOperacionesFallidas()
  fallidas.push({ ...op, error: String(err?.message || err), descartadaEn: new Date().toISOString() })
  await guardarEnCache(CLAVE_FALLIDAS, fallidas)
  await eliminarDeCola(op.id)
}

/**
 * Clave estable para operaciones encoladas por versiones anteriores de la
 * app (que no traían clientOpId): siempre es la misma para la misma
 * operación, así el servidor tampoco la duplica.
 */
export function idOperacionDe(op) {
  return op?.datos?.clientOpId || `legacy-${op.id}-${op.creadoEn || ''}`
}

// Sesión vencida o inexistente: no es culpa de la operación, así que no
// cuenta como intento fallido.
function esErrorDeSesion(err) {
  const msg = String(err?.message || '').toLowerCase()
  return (
    err?.status === 401 ||
    err?.code === 'PGRST301' ||
    err?.code === 'PGRST303' ||
    msg.includes('jwt') ||
    msg.includes('sesión expiró')
  )
}

let sincronizando = null

/**
 * Procesa la cola pendiente ejecutando `ejecutor(operacion)` por cada una.
 * - Si falla por red: se detiene (se reintenta cuando vuelva la conexión).
 * - Si el servidor la rechaza: suma un intento y sigue con las demás; tras
 *   MAX_INTENTOS se mueve a "fallidas" para no bloquear la cola.
 * Nunca corre dos veces en paralelo.
 * Regresa cuántas se sincronizaron con éxito.
 */
export async function sincronizarCola(ejecutor) {
  if (sincronizando) return sincronizando
  sincronizando = (async () => {
    const pendientes = await obtenerColaPendiente()
    let sincronizadas = 0
    for (const op of pendientes) {
      try {
        await ejecutor(op)
        await eliminarDeCola(op.id)
        sincronizadas++
      } catch (err) {
        if (pareceErrorDeRed(err)) {
          marcarConectividad(false)
          break
        }
        if (esErrorDeSesion(err)) break // se reintenta cuando haya sesión válida, sin gastar intentos
        console.warn('[Kairen Finanzas] El servidor rechazó una operación pendiente:', err?.message)
        const intentos = (op.intentos || 0) + 1
        if (intentos >= MAX_INTENTOS) {
          await moverAFallidas(op, err)
        } else {
          await actualizarEnCola({ ...op, intentos, ultimoError: String(err?.message || err) })
        }
      }
    }
    return sincronizadas
  })()
  try {
    return await sincronizando
  } finally {
    sincronizando = null
  }
}