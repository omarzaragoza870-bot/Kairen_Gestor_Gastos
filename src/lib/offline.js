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

export function pareceErrorDeRed(err) {
  const msg = (err?.message || '').toLowerCase()
  return !navigator.onLine || msg.includes('fetch') || msg.includes('network') || msg.includes('failed')
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
    return await new Promise(async (resolve) => {
      const db = await abrirDB()
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

/** Agrega una operación a la cola (ej. { tipo: 'crearTransaccion', datos: {...} }). */
export async function encolarOperacion(operacion) {
  return conTienda(STORE_COLA, 'readwrite', tienda => {
    tienda.add({ ...operacion, creadoEn: new Date().toISOString() })
  })
}

export async function obtenerColaPendiente() {
  return new Promise(async (resolve) => {
    const db = await abrirDB()
    const tx = db.transaction(STORE_COLA, 'readonly')
    const req = tx.objectStore(STORE_COLA).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => resolve([])
  })
}

export async function eliminarDeCola(id) {
  return conTienda(STORE_COLA, 'readwrite', tienda => {
    tienda.delete(id)
  })
}

/**
 * Procesa toda la cola pendiente ejecutando `ejecutor(operacion)` por cada una.
 * Si una falla, se detiene ahí (no borra las que quedan) para no perder el orden.
 * Regresa cuántas se sincronizaron con éxito.
 */
export async function sincronizarCola(ejecutor) {
  const pendientes = await obtenerColaPendiente()
  let sincronizadas = 0
  for (const op of pendientes) {
    try {
      await ejecutor(op)
      await eliminarDeCola(op.id)
      sincronizadas++
    } catch (err) {
      console.warn('[Kairen Finanzas] No se pudo sincronizar una operación pendiente:', err.message)
      break
    }
  }
  return sincronizadas
}