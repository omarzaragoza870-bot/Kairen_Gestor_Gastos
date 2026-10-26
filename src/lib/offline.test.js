import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

// offline.js guarda estado en el módulo (conectividad y sincronización en
// curso), así que cada prueba lo vuelve a importar con un IndexedDB vacío.
let offline

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  vi.stubGlobal('navigator', { onLine: true })
  vi.resetModules()
  offline = await import('./offline.js')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const errorDeRed = () => new TypeError('Failed to fetch')
const errorDeServidor = (mensaje = 'Cuenta no válida') => new Error(mensaje)

describe('pareceErrorDeRed', () => {
  it('reconoce los mensajes de red de cada navegador', () => {
    expect(offline.pareceErrorDeRed(new TypeError('Failed to fetch'))).toBe(true)
    expect(offline.pareceErrorDeRed(new TypeError('Load failed'))).toBe(true)
    expect(offline.pareceErrorDeRed(new Error('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(offline.pareceErrorDeRed('net::ERR_INTERNET_DISCONNECTED')).toBe(true)
    expect(offline.pareceErrorDeRed(new Error('Request timed out'))).toBe(true)
  })

  it('no confunde un rechazo del servidor con falta de red', () => {
    expect(offline.pareceErrorDeRed(errorDeServidor())).toBe(false)
    expect(offline.pareceErrorDeRed(errorDeServidor('insert failed: violates check constraint'))).toBe(false)
    expect(offline.pareceErrorDeRed(null)).toBe(false)
  })

  it('cualquier error es de red si el sistema reporta que no hay conexión', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(offline.pareceErrorDeRed(errorDeServidor())).toBe(true)
  })
})

describe('generarIdOperacion', () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  it('genera UUID v4 distintos', () => {
    const a = offline.generarIdOperacion()
    const b = offline.generarIdOperacion()
    expect(a).toMatch(UUID_V4)
    expect(a).not.toBe(b)
  })

  it('arma un UUID v4 válido aunque no exista crypto.randomUUID', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: arr => real.getRandomValues(arr) })
    expect(offline.generarIdOperacion()).toMatch(UUID_V4)
  })
})

describe('idOperacionDe', () => {
  it('usa el clientOpId de la operación', () => {
    expect(offline.idOperacionDe({ id: 3, datos: { clientOpId: 'abc-123' } })).toBe('abc-123')
  })

  it('da una clave estable a operaciones antiguas sin clientOpId', () => {
    const op = { id: 7, creadoEn: '2026-10-01T10:00:00.000Z', datos: {} }
    expect(offline.idOperacionDe(op)).toBe('legacy-7-2026-10-01T10:00:00.000Z')
    expect(offline.idOperacionDe(op)).toBe(offline.idOperacionDe({ ...op }))
  })
})

describe('conectividad', () => {
  it('avisa solo cuando el estado cambia y deja de avisar al desuscribirse', () => {
    const cambios = []
    const desuscribir = offline.suscribirseConectividad(estado => cambios.push(estado))

    offline.marcarConectividad(false)
    offline.marcarConectividad(false)
    offline.marcarConectividad(true)
    desuscribir()
    offline.marcarConectividad(false)

    expect(cambios).toEqual([false, true])
    expect(offline.obtenerConectividad()).toBe(false)
  })
})

describe('conRespaldoOffline', () => {
  it('devuelve el resultado de la red, lo guarda en caché y marca conexión', async () => {
    offline.marcarConectividad(false)
    const datos = [{ id: 1, monto: 50 }]

    await expect(offline.conRespaldoOffline('mes-2026-10', async () => datos)).resolves.toEqual(datos)

    expect(offline.obtenerConectividad()).toBe(true)
    await vi.waitFor(async () => expect(await offline.leerDeCache('mes-2026-10')).toEqual(datos))
  })

  it('sin red devuelve lo último guardado y marca sin conexión', async () => {
    const datos = [{ id: 1, monto: 50 }]
    await offline.guardarEnCache('mes-2026-10', datos)

    await expect(offline.conRespaldoOffline('mes-2026-10', async () => { throw errorDeRed() })).resolves.toEqual(datos)
    expect(offline.obtenerConectividad()).toBe(false)
  })

  it('sin red y sin caché propaga el error', async () => {
    await expect(offline.conRespaldoOffline('vacía', async () => { throw errorDeRed() })).rejects.toThrow('Failed to fetch')
  })

  it('no oculta un error del servidor detrás de la caché', async () => {
    await offline.guardarEnCache('mes-2026-10', [{ id: 1 }])

    await expect(offline.conRespaldoOffline('mes-2026-10', async () => { throw errorDeServidor() })).rejects.toThrow('Cuenta no válida')
  })
})

describe('cola de escritura', () => {
  const encolar = (n) => offline.encolarOperacion({ accion: 'crearTransaccion', datos: { clientOpId: `op-${n}`, monto: n } })

  it('encola con id, cero intentos y fecha de creación', async () => {
    await encolar(1)
    const [op] = await offline.obtenerColaPendiente()

    expect(op).toMatchObject({ accion: 'crearTransaccion', intentos: 0, datos: { clientOpId: 'op-1' } })
    expect(op.id).toEqual(expect.any(Number))
    expect(Date.parse(op.creadoEn)).not.toBeNaN()
  })

  describe('sincronizarCola', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    it('ejecuta las operaciones en orden, las saca de la cola y cuenta las sincronizadas', async () => {
      await encolar(1)
      await encolar(2)
      const ejecutadas = []

      const sincronizadas = await offline.sincronizarCola(async op => { ejecutadas.push(op.datos.clientOpId) })

      expect(sincronizadas).toBe(2)
      expect(ejecutadas).toEqual(['op-1', 'op-2'])
      expect(await offline.obtenerColaPendiente()).toEqual([])
    })

    it('se detiene sin gastar intentos cuando se cae la red', async () => {
      await encolar(1)
      await encolar(2)
      const ejecutor = vi.fn(async () => { throw errorDeRed() })

      expect(await offline.sincronizarCola(ejecutor)).toBe(0)

      expect(ejecutor).toHaveBeenCalledTimes(1)
      expect(offline.obtenerConectividad()).toBe(false)
      const cola = await offline.obtenerColaPendiente()
      expect(cola).toHaveLength(2)
      expect(cola.every(op => op.intentos === 0)).toBe(true)
    })

    it.each([
      ['un 401', Object.assign(new Error('Unauthorized'), { status: 401 })],
      ['un JWT vencido', Object.assign(new Error('JWT expired'), { code: 'PGRST301' })],
      ['la sesión expirada del RPC', new Error('Tu sesión expiró. Vuelve a iniciar sesión.')],
    ])('se detiene sin gastar intentos ante %s', async (_, err) => {
      await encolar(1)
      await encolar(2)
      const ejecutor = vi.fn(async () => { throw err })

      expect(await offline.sincronizarCola(ejecutor)).toBe(0)

      expect(ejecutor).toHaveBeenCalledTimes(1)
      const cola = await offline.obtenerColaPendiente()
      expect(cola).toHaveLength(2)
      expect(cola.every(op => op.intentos === 0)).toBe(true)
    })

    it('si el servidor rechaza una operación suma un intento y sigue con las demás', async () => {
      await encolar(1)
      await encolar(2)

      const sincronizadas = await offline.sincronizarCola(async op => {
        if (op.datos.clientOpId === 'op-1') throw errorDeServidor()
      })

      expect(sincronizadas).toBe(1)
      const cola = await offline.obtenerColaPendiente()
      expect(cola).toHaveLength(1)
      expect(cola[0]).toMatchObject({ datos: { clientOpId: 'op-1' }, intentos: 1, ultimoError: 'Cuenta no válida' })
    })

    it('al quinto rechazo mueve la operación a fallidas', async () => {
      await encolar(1)
      const rechazar = async () => { throw errorDeServidor() }

      for (let i = 0; i < 4; i++) await offline.sincronizarCola(rechazar)
      expect((await offline.obtenerColaPendiente())[0].intentos).toBe(4)
      expect(await offline.obtenerOperacionesFallidas()).toEqual([])

      await offline.sincronizarCola(rechazar)

      expect(await offline.obtenerColaPendiente()).toEqual([])
      const [fallida] = await offline.obtenerOperacionesFallidas()
      expect(fallida).toMatchObject({ datos: { clientOpId: 'op-1' }, error: 'Cuenta no válida' })
      expect(Date.parse(fallida.descartadaEn)).not.toBeNaN()
    })

    it('dos llamadas a la vez comparten la misma sincronización', async () => {
      await encolar(1)
      let liberar
      const pausa = new Promise(resolve => { liberar = resolve })
      const ejecutor = vi.fn(() => pausa)

      const primera = offline.sincronizarCola(ejecutor)
      const segunda = offline.sincronizarCola(ejecutor)
      await vi.waitFor(() => expect(ejecutor).toHaveBeenCalledTimes(1))
      liberar()

      expect(await Promise.all([primera, segunda])).toEqual([1, 1])
      expect(ejecutor).toHaveBeenCalledTimes(1)
    })

    it('una vez terminada se puede volver a sincronizar', async () => {
      await offline.sincronizarCola(async () => {})
      await encolar(1)

      expect(await offline.sincronizarCola(async () => {})).toBe(1)
    })
  })
})
