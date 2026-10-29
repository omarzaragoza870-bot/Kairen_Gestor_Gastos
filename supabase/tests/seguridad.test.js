import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { crearBaseDePrueba, crearUsuario, crearCuenta, saldo, comoUsuario, comoAnonimo } from './db.js'

// Pruebas de ataque: un usuario (Beto) o alguien sin sesión intenta leer o
// modificar datos de otra persona (Ana), subirse de plan o inyectar SQL.
// Cada prueba afirma el comportamiento SEGURO: si una falla, es una
// vulnerabilidad real (ver el comentario "HALLAZGO" junto a ella).
let db
beforeAll(async () => { db = await crearBaseDePrueba() }, 60_000)

const HOY = '2026-10-26'
const comoU = (uid, sql, params = []) => comoUsuario(db, uid, () => db.query(sql, params))
const comoA = (sql, params = []) => comoAnonimo(db, () => db.query(sql, params))

async function rpc(userId, funcion, args) {
  const nombres = Object.keys(args)
  const sql = `select public.${funcion}(${nombres.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`
  const { rows: [{ r }] } = await comoU(userId, sql, Object.values(args))
  return r
}

const contar = async (tabla, userId) =>
  Number((await db.query(`select count(*)::int as n from public.${tabla} where user_id = $1`, [userId])).rows[0].n)

// Inserción mínima válida por tabla con dueño = $1 (ctx trae ids que dependen del dueño)
const SEMILLAS = {
  ahorro_externo: (u) => [`insert into public.ahorro_externo (user_id, nombre_banco, monto) values ($1, 'Banco', 10) returning user_id`, [u]],
  categorias: (u) => [`insert into public.categorias (user_id, nombre, tipo) values ($1, 'Comida', 'gasto') returning user_id`, [u]],
  cuentas: (u) => [`insert into public.cuentas (user_id, nombre) values ($1, 'Ahorros') returning user_id`, [u]],
  fcm_tokens: (u) => [`insert into public.fcm_tokens (user_id, token) values ($1, 'tok-' || gen_random_uuid()) returning user_id`, [u]],
  metas: (u) => [`insert into public.metas (user_id, nombre, monto_objetivo) values ($1, 'Viaje', 1000) returning user_id`, [u]],
  meta_contribuciones: (u, ctx) => [`insert into public.meta_contribuciones (user_id, meta_id, tipo, monto) values ($1, $2, 'contribucion', 5) returning user_id`, [u, ctx.meta]],
  operaciones_cliente: (u) => [`insert into public.operaciones_cliente (user_id, client_op_id, accion) values ($1, 'op-' || gen_random_uuid(), 'crearTransaccion') returning user_id`, [u]],
  presupuestos: (u) => [`insert into public.presupuestos (user_id, categoria_nombre, monto_limite) values ($1, 'Cat-' || gen_random_uuid(), 100) returning user_id`, [u]],
  push_subscriptions: (u) => [`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/' || gen_random_uuid(), 'k', 'a') returning user_id`, [u]],
  recurrentes: (u) => [`insert into public.recurrentes (user_id, cuenta_nombre, tipo, categoria_nombre, monto, frecuencia, proxima_fecha) values ($1, 'Efectivo', 'gasto', 'Renta', 100, 'mensual', '2099-01-01') returning user_id`, [u]],
  transacciones: (u) => [`insert into public.transacciones (user_id, categoria_nombre, tipo, monto) values ($1, 'Comida', 'gasto', 10) returning user_id`, [u]],
  transferencias: (u) => [`insert into public.transferencias (user_id, cuenta_origen_nombre, cuenta_destino_nombre, monto) values ($1, 'A', 'B', 10) returning user_id`, [u]],
}
const TABLAS_PERSONALES = Object.keys(SEMILLAS)

async function sembrar(tabla, userId) {
  const meta = (await db.query(`insert into public.metas (user_id, nombre, monto_objetivo) values ($1, 'Base', 100) returning id`, [userId])).rows[0].id
  const [sql, params] = SEMILLAS[tabla](userId, { meta })
  await db.query(sql, params)
  return { meta }
}

// ───────────────────────────────────────────────────────────────────────────
describe('RLS: Beto contra las filas de Ana, tabla por tabla', () => {
  describe.each(TABLAS_PERSONALES)('%s', (tabla) => {
    let ana, beto, ctxAna
    beforeEach(async () => {
      ana = await crearUsuario(db)
      beto = await crearUsuario(db)
      ctxAna = await sembrar(tabla, ana)
    })

    it('Beto no ve las filas de Ana', async () => {
      const { rows } = await comoU(beto, `select user_id from public.${tabla} where user_id = $1`, [ana])
      expect(rows).toHaveLength(0)
    })

    it('Beto no puede quedarse con las filas de Ana (update)', async () => {
      const { rows } = await comoU(beto, `update public.${tabla} set user_id = $1 where user_id = $2 returning user_id`, [beto, ana])
      expect(rows).toHaveLength(0)
      expect(await contar(tabla, ana)).toBeGreaterThan(0)
    })

    it('Beto no puede borrar las filas de Ana', async () => {
      const antes = await contar(tabla, ana)
      const { rows } = await comoU(beto, `delete from public.${tabla} where user_id = $1 returning user_id`, [ana])
      expect(rows).toHaveLength(0)
      expect(await contar(tabla, ana)).toBe(antes)
    })

    it('Beto no puede insertar filas a nombre de Ana', async () => {
      const [sql, params] = SEMILLAS[tabla](ana, ctxAna)
      await expect(comoU(beto, sql, params)).rejects.toThrow(/row-level security/)
    })

    it('Beto no puede pasarle sus propias filas a Ana', async () => {
      await sembrar(tabla, beto)
      await expect(comoU(beto, `update public.${tabla} set user_id = $1 where user_id = $2`, [ana, beto]))
        .rejects.toThrow(/row-level security/)
    })
  })

  it('push_envios no es accesible para usuarios', async () => {
    const ana = await crearUsuario(db)
    await expect(comoU(ana, `select * from public.push_envios`)).rejects.toThrow(/permission denied/)
    await expect(comoU(ana, `insert into public.push_envios (user_id, origen) values ($1, 'recordatorio')`, [ana]))
      .rejects.toThrow(/permission denied/)
  })

  it('correos_fundadores (si existe) no es accesible para usuarios', async () => {
    const { rows: [{ t }] } = await db.query(`select to_regclass('public.correos_fundadores') as t`)
    if (!t) return
    const ana = await crearUsuario(db)
    await expect(comoU(ana, `select * from public.correos_fundadores`)).rejects.toThrow(/permission denied/)
    await expect(comoU(ana, `insert into public.correos_fundadores (email) values ('yo@x.com')`)).rejects.toThrow(/permission denied/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('perfiles: nadie se sube de plan', () => {
  let ana, beto
  beforeEach(async () => {
    ana = await crearUsuario(db)
    beto = await crearUsuario(db)
  })

  it('no puede darse premium ni acceso fundador con update', async () => {
    await expect(comoU(ana, `update public.perfiles set plan = 'premium', acceso_fundador = true where user_id = $1`, [ana]))
      .rejects.toThrow(/permission denied/)
    const { rows: [p] } = await db.query(`select plan, acceso_fundador from public.perfiles where user_id = $1`, [ana])
    expect(p).toEqual({ plan: 'gratis', acceso_fundador: false })
  })

  it('no puede insertar, hacer upsert ni borrar su perfil', async () => {
    await expect(comoU(ana, `insert into public.perfiles (user_id, plan, acceso_fundador) values ($1, 'premium', true)
      on conflict (user_id) do update set plan = 'premium', acceso_fundador = true`, [ana])).rejects.toThrow(/permission denied/)
    await expect(comoU(ana, `delete from public.perfiles where user_id = $1`, [ana])).rejects.toThrow(/permission denied/)
  })

  it('solo ve su propio perfil', async () => {
    const { rows } = await comoU(beto, `select user_id from public.perfiles`)
    expect(rows.map(r => r.user_id)).toEqual([beto])
  })

  it('sin premium no puede crear ni unirse a grupos', async () => {
    await expect(rpc(ana, 'crear_grupo', { p_nombre: 'Casa' })).rejects.toThrow('requiere acceso Premium')
    await expect(rpc(ana, 'unirse_a_grupo', { p_codigo: 'ABCDEF' })).rejects.toThrow('requiere acceso Premium')
  })

  // HALLAZGO (bajo): crear_grupo y unirse_a_grupo hacen
  //   if not (v_perfil.acceso_fundador or v_perfil.plan = 'premium') then raise
  // y si no hay fila en perfiles la condición es NULL y no se lanza: fail-open.
  it('sin fila en perfiles tampoco puede crear grupos (fail-closed)', async () => {
    await db.query(`delete from public.perfiles where user_id = $1`, [ana])
    await expect(rpc(ana, 'crear_grupo', { p_nombre: 'Sin perfil' })).rejects.toThrow('requiere acceso Premium')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('grupos y metas compartidas', () => {
  let ana, beto, carla, grupo, codigo, metaAna
  beforeEach(async () => {
    ana = await crearUsuario(db, { plan: 'premium' })
    beto = await crearUsuario(db, { plan: 'premium' }) // premium pero NO miembro
    carla = await crearUsuario(db, { plan: 'premium' }) // se une con el código
    grupo = await rpc(ana, 'crear_grupo', { p_nombre: 'Casa' })
    codigo = (await db.query(`select codigo_invitacion from public.grupos where id = $1`, [grupo])).rows[0].codigo_invitacion
    const { rows: [{ id: ph }] } = await db.query(
      `insert into public.presupuestos_hogar (grupo_id, nombre, monto_limite) values ($1, 'Súper', 5000) returning id`, [grupo])
    await db.query(`insert into public.gastos_hogar (presupuesto_hogar_id, grupo_id, user_id, monto) values ($1, $2, $3, 300)`, [ph, grupo, ana])
    metaAna = (await db.query(`insert into public.metas (user_id, nombre, monto_objetivo, monto_actual) values ($1, 'Vacaciones', 10000, 2000) returning id`, [ana])).rows[0].id
    await rpc(ana, 'compartir_meta', { p_meta_id: metaAna, p_grupo_id: grupo })
  })

  it('un no miembro no ve nada del grupo', async () => {
    for (const tabla of ['grupos', 'miembros_grupo', 'gastos_hogar', 'presupuestos_hogar', 'metas_grupo']) {
      const { rows } = await comoU(beto, `select * from public.${tabla}`)
      expect(rows, tabla).toHaveLength(0)
    }
    const visibles = (await comoU(beto, `select id from public.obtener_metas_visibles()`)).rows.map(r => r.id)
    expect(visibles).not.toContain(metaAna)
    expect(await comoU(beto, `select public.es_miembro_de_grupo($1) as r`, [grupo])).toMatchObject({ rows: [{ r: false }] })
  })

  it('un no miembro no puede meterse al grupo escribiendo directo en miembros_grupo', async () => {
    await expect(comoU(beto, `insert into public.miembros_grupo (grupo_id, user_id, rol) values ($1, $2, 'admin')`, [grupo, beto]))
      .rejects.toThrow(/row-level security/)
  })

  it('un no miembro no puede abonar, retirar, compartir ni dejar de compartir la meta de Ana', async () => {
    await expect(rpc(beto, 'registrar_contribucion_meta', { p_meta_id: metaAna, p_tipo: 'retiro', p_monto: 100 }))
      .rejects.toThrow('Meta no encontrada')
    const grupoBeto = await rpc(beto, 'crear_grupo', { p_nombre: 'Otro' })
    await expect(rpc(beto, 'compartir_meta', { p_meta_id: metaAna, p_grupo_id: grupoBeto })).rejects.toThrow('no tienes permiso')
    await expect(rpc(beto, 'dejar_compartir_meta', { p_meta_id: metaAna })).rejects.toThrow('no tienes permiso')
    const metaBeto = (await db.query(`insert into public.metas (user_id, nombre, monto_objetivo) values ($1, 'Mía', 10) returning id`, [beto])).rows[0].id
    await expect(rpc(beto, 'compartir_meta', { p_meta_id: metaBeto, p_grupo_id: grupo })).rejects.toThrow('No eres miembro')
    const { rows: [m] } = await db.query(`select monto_actual from public.metas where id = $1`, [metaAna])
    expect(Number(m.monto_actual)).toBe(2000)
  })

  it('un miembro solo lee: no escribe directo en las tablas del grupo ni se hace admin', async () => {
    await rpc(carla, 'unirse_a_grupo', { p_codigo: codigo })
    expect((await comoU(carla, `select id from public.gastos_hogar`)).rows).toHaveLength(1)
    await expect(comoU(carla, `insert into public.gastos_hogar (presupuesto_hogar_id, grupo_id, user_id, monto)
      select id, grupo_id, $1, 1 from public.presupuestos_hogar limit 1`, [carla])).rejects.toThrow(/row-level security/)
    expect((await comoU(carla, `update public.miembros_grupo set rol = 'admin' where user_id = $1 returning id`, [carla])).rows).toHaveLength(0)
    expect((await comoU(carla, `update public.grupos set codigo_invitacion = 'MIO' returning id`)).rows).toHaveLength(0)
    expect((await comoU(carla, `delete from public.miembros_grupo where user_id = $1 returning id`, [ana])).rows).toHaveLength(0)
    expect((await comoU(carla, `update public.metas set monto_actual = 0 where id = $1 returning id`, [metaAna])).rows).toHaveLength(0)
  })

  // HALLAZGO (medio): el código son 6 caracteres hexadecimales
  // (upper(substring(gen_random_uuid()::text from 1 for 6)) = 16^6 ≈ 16.7 M,
  // 24 bits), no expira, unirse_a_grupo no tiene límite de intentos y no hay
  // forma de expulsar a nadie. Quien lo adivine lee gastos, presupuestos y
  // metas compartidas del hogar y puede retirar de esas metas.
  it('el código de invitación no se puede adivinar por fuerza bruta (≥ 64 bits)', async () => {
    const bits = codigo.length * Math.log2(/^[0-9A-F]+$/.test(codigo) ? 16 : 36)
    expect(bits).toBeGreaterThanOrEqual(64)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('RPC: no se puede operar sobre cuentas, movimientos o compras de otro', () => {
  let ana, beto, efectivoAna, tarjetaAna, efectivoBeto, tarjetaBeto
  beforeEach(async () => {
    ana = await crearUsuario(db)
    beto = await crearUsuario(db)
    efectivoAna = await crearCuenta(db, ana, { saldo: 1000 })
    tarjetaAna = await crearCuenta(db, ana, { nombre: 'Visa', tipo: 'tarjeta_credito', saldo: 0 })
    efectivoBeto = await crearCuenta(db, beto, { saldo: 500 })
    tarjetaBeto = await crearCuenta(db, beto, { nombre: 'MC', tipo: 'tarjeta_credito', saldo: 0 })
  })

  it('crear, transferir y pagar con cuentas ajenas falla sin mover saldos', async () => {
    await expect(rpc(beto, 'crear_transaccion_segura', { p_cuenta_id: efectivoAna, p_categoria_nombre: 'X', p_tipo: 'gasto', p_monto: 10, p_descripcion: null, p_fecha: HOY }))
      .rejects.toThrow('Cuenta no válida')
    await expect(rpc(beto, 'crear_transaccion_idempotente', { p_client_op_id: 'op-ajena-001', p_cuenta_id: efectivoAna, p_categoria_nombre: 'X', p_tipo: 'gasto', p_monto: 10, p_descripcion: null, p_fecha: HOY }))
      .rejects.toThrow('Cuenta no válida')
    await expect(rpc(beto, 'crear_transferencia_segura', { p_cuenta_origen_id: efectivoBeto, p_cuenta_destino_id: efectivoAna, p_monto: 10, p_descripcion: null, p_fecha: HOY }))
      .rejects.toThrow('Cuenta no encontrada')
    await expect(rpc(beto, 'crear_transferencia_idempotente', { p_client_op_id: 'op-ajena-002', p_cuenta_origen_id: efectivoAna, p_cuenta_destino_id: efectivoBeto, p_monto: 10, p_descripcion: null, p_fecha: HOY }))
      .rejects.toThrow('Cuenta no encontrada')
    await expect(rpc(beto, 'pagar_tarjeta_credito', { p_tarjeta_id: tarjetaAna, p_cuenta_origen_id: efectivoBeto, p_monto: 10, p_fecha: HOY }))
      .rejects.toThrow('Cuenta no encontrada')
    await expect(rpc(beto, 'crear_compra_meses_idempotente', { p_client_op_id: 'op-ajena-003', p_cuenta_id: tarjetaAna, p_categoria_nombre: 'X', p_monto: 1200, p_meses: 3, p_descripcion: null, p_fecha: HOY }))
      .rejects.toThrow('Cuenta no válida')
    expect(await saldo(db, efectivoAna)).toBe(1000)
    expect(await saldo(db, tarjetaAna)).toBe(0)
    expect(await saldo(db, efectivoBeto)).toBe(500)
  })

  it('editar o eliminar movimientos y transferencias ajenas falla; mover el propio a una cuenta ajena también', async () => {
    const txAna = await rpc(ana, 'crear_transaccion_segura', { p_cuenta_id: efectivoAna, p_categoria_nombre: 'Comida', p_tipo: 'gasto', p_monto: 100, p_descripcion: null, p_fecha: HOY })
    const trAna = await rpc(ana, 'crear_transferencia_segura', { p_cuenta_origen_id: efectivoAna, p_cuenta_destino_id: (await crearCuenta(db, ana, { nombre: 'Banco' })), p_monto: 50, p_descripcion: null, p_fecha: HOY })
    const txBeto = await rpc(beto, 'crear_transaccion_segura', { p_cuenta_id: efectivoBeto, p_categoria_nombre: 'Comida', p_tipo: 'gasto', p_monto: 20, p_descripcion: null, p_fecha: HOY })

    const edicion = { p_cuenta_id: efectivoBeto, p_categoria_nombre: 'X', p_tipo: 'ingreso', p_monto: 99999, p_descripcion: null, p_fecha: HOY }
    await expect(rpc(beto, 'editar_transaccion_segura', { p_transaccion_id: txAna, ...edicion })).rejects.toThrow('Movimiento no encontrado')
    await expect(rpc(beto, 'eliminar_transaccion_segura', { p_transaccion_id: txAna })).rejects.toThrow('Movimiento no encontrado')
    await expect(rpc(beto, 'eliminar_transferencia_segura', { p_transferencia_id: trAna })).rejects.toThrow()
    await expect(rpc(beto, 'editar_transaccion_segura', { p_transaccion_id: txBeto, ...edicion, p_cuenta_id: efectivoAna, p_tipo: 'gasto' }))
      .rejects.toThrow('Cuenta no válida')
    expect(await saldo(db, efectivoAna)).toBe(850)
    expect(await saldo(db, efectivoBeto)).toBe(480)
  })

  it('compra_meses_id: etiquetar mis filas con el id de la compra de Ana no me deja tocarla', async () => {
    const compraAna = await rpc(ana, 'crear_compra_meses_idempotente', { p_client_op_id: 'op-meses-ana-1', p_cuenta_id: tarjetaAna, p_categoria_nombre: 'Tele', p_monto: 1200, p_meses: 3, p_descripcion: null, p_fecha: HOY })
    expect(await saldo(db, tarjetaAna)).toBe(1200)

    // Beto conoce el id (p. ej. lo adivinó) y no puede borrarla
    await expect(rpc(beto, 'eliminar_compra_meses', { p_compra_meses_id: compraAna })).rejects.toThrow('Compra no encontrada')

    // Beto etiqueta un gasto suyo con ese id (update directo) y vuelve a intentar
    const txBeto = await rpc(beto, 'crear_transaccion_segura', { p_cuenta_id: tarjetaBeto, p_categoria_nombre: 'X', p_tipo: 'gasto', p_monto: 30, p_descripcion: null, p_fecha: HOY })
    await comoU(beto, `update public.transacciones set compra_meses_id = $1, mensualidad = 1, meses = 2 where id = $2`, [compraAna, txBeto])
    await rpc(beto, 'eliminar_compra_meses', { p_compra_meses_id: compraAna })

    expect(await contar('transacciones', ana)).toBe(3)
    expect(await saldo(db, tarjetaAna)).toBe(1200)
    expect(await saldo(db, tarjetaBeto)).toBe(0) // solo se revirtió lo de Beto

    // Y Ana, al borrar su compra, no toca filas de Beto
    const txBeto2 = await rpc(beto, 'crear_transaccion_segura', { p_cuenta_id: tarjetaBeto, p_categoria_nombre: 'X', p_tipo: 'gasto', p_monto: 40, p_descripcion: null, p_fecha: HOY })
    await comoU(beto, `update public.transacciones set compra_meses_id = $1, mensualidad = 1, meses = 2 where id = $2`, [compraAna, txBeto2])
    await rpc(ana, 'eliminar_compra_meses', { p_compra_meses_id: compraAna })
    expect(await contar('transacciones', ana)).toBe(0)
    expect(await saldo(db, tarjetaAna)).toBe(0)
    expect(await saldo(db, tarjetaBeto)).toBe(40)
    expect((await db.query(`select id from public.transacciones where id = $1`, [txBeto2])).rows).toHaveLength(1)
  })

  it('el mismo client_op_id en dos usuarios no devuelve el resultado del otro, y forjar operaciones_cliente no da acceso', async () => {
    const idAna = await rpc(ana, 'crear_transaccion_idempotente', { p_client_op_id: 'op-compartida-1', p_cuenta_id: efectivoAna, p_categoria_nombre: 'X', p_tipo: 'gasto', p_monto: 10, p_descripcion: null, p_fecha: HOY })
    const idBeto = await rpc(beto, 'crear_transaccion_idempotente', { p_client_op_id: 'op-compartida-1', p_cuenta_id: efectivoBeto, p_categoria_nombre: 'X', p_tipo: 'gasto', p_monto: 10, p_descripcion: null, p_fecha: HOY })
    expect(idBeto).not.toBe(idAna)

    await comoU(beto, `insert into public.operaciones_cliente (user_id, client_op_id, accion, resultado_id) values ($1, 'op-forjada-1', 'crearTransaccion', $2)`, [beto, idAna])
    const devuelto = await rpc(beto, 'crear_transaccion_idempotente', { p_client_op_id: 'op-forjada-1', p_cuenta_id: efectivoBeto, p_categoria_nombre: 'X', p_tipo: 'gasto', p_monto: 10, p_descripcion: null, p_fecha: HOY })
    expect(devuelto).toBe(idAna) // solo recibe un uuid…
    await expect(rpc(beto, 'eliminar_transaccion_segura', { p_transaccion_id: devuelto })).rejects.toThrow('Movimiento no encontrado') // …que no le sirve
  })

  it('una recurrente de Beto que apunta a la cuenta de Ana no le mueve el saldo a Ana', async () => {
    await comoU(beto, `insert into public.recurrentes (user_id, cuenta_id, cuenta_nombre, tipo, categoria_nombre, monto, frecuencia, proxima_fecha)
      values ($1, $2, 'Efectivo', 'gasto', 'Robo', 300, 'diario', $3)`, [beto, efectivoAna, HOY]).catch(() => {})
    await rpc(beto, 'procesar_recurrentes', { p_hoy: HOY })
    expect(await saldo(db, efectivoAna)).toBe(1000)
    expect(await contar('transacciones', ana)).toBe(0)
  })

  it('importar_respaldo con ids de cuentas de Ana no toca nada de Ana', async () => {
    const resultado = await rpc(beto, 'importar_respaldo', {
      p_datos: ({
        cuentas: [{ id: efectivoAna, user_id: ana, nombre: 'Clon', tipo: 'efectivo', saldo: 1 }],
        categorias: [],
        metas: [],
        transacciones: [{ cuenta_id: efectivoAna, tipo: 'gasto', monto: 5, fecha: HOY, categoria_nombre: 'X' },
          { cuenta_id: tarjetaAna, tipo: 'gasto', monto: 5, fecha: HOY, categoria_nombre: 'X' }],
        transferencias: [{ cuenta_origen_id: efectivoAna, cuenta_destino_id: tarjetaAna, monto: 5, fecha: HOY }],
      }),
    })
    expect(resultado.transacciones).toBe(2)
    const { rows } = await db.query(`select cuenta_id from public.transacciones where user_id = $1`, [beto])
    expect(rows.map(x => x.cuenta_id)).not.toContain(efectivoAna)
    expect(rows.map(x => x.cuenta_id)).not.toContain(tarjetaAna)
    expect(await saldo(db, efectivoAna)).toBe(1000)
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public.cuentas where id = $1 and user_id = $2`, [efectivoAna, ana])
    expect(n).toBe(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// HALLAZGO (medio): las políticas de INSERT/UPDATE solo exigen
// auth.uid() = user_id; nada exige que cuenta_id / meta_id sean del mismo
// usuario (las FK apuntan solo a cuentas(id) / metas(id)). Beto puede crear
// filas suyas que referencian cuentas o metas de Ana.
describe('referencias cruzadas: filas de Beto que apuntan a cuentas o metas de Ana', () => {
  let ana, beto, efectivoAna, tarjetaAna, metaAna
  beforeEach(async () => {
    ana = await crearUsuario(db)
    beto = await crearUsuario(db)
    efectivoAna = await crearCuenta(db, ana, { saldo: 1000 })
    tarjetaAna = await crearCuenta(db, ana, { nombre: 'Visa', tipo: 'tarjeta_credito', saldo: 0 })
    metaAna = (await db.query(`insert into public.metas (user_id, nombre, monto_objetivo) values ($1, 'Auto', 1000) returning id`, [ana])).rows[0].id
  })

  it('insert directo en transacciones con user_id propio y cuenta_id de Ana se rechaza', async () => {
    await expect(comoU(beto, `insert into public.transacciones (user_id, cuenta_id, categoria_nombre, tipo, monto) values ($1, $2, 'X', 'gasto', 10)`, [beto, efectivoAna]))
      .rejects.toThrow()
  })

  it('update directo de un movimiento propio hacia la cuenta de Ana se rechaza', async () => {
    const efectivoBeto = await crearCuenta(db, beto)
    const tx = await rpc(beto, 'crear_transaccion_segura', { p_cuenta_id: efectivoBeto, p_categoria_nombre: 'X', p_tipo: 'ingreso', p_monto: 10, p_descripcion: null, p_fecha: HOY })
    await expect(comoU(beto, `update public.transacciones set cuenta_id = $1 where id = $2`, [tarjetaAna, tx])).rejects.toThrow()
  })

  it('recurrentes, transferencias y meta_contribuciones con ids de Ana se rechazan', async () => {
    await expect(comoU(beto, `insert into public.recurrentes (user_id, cuenta_id, cuenta_nombre, tipo, categoria_nombre, monto, frecuencia, proxima_fecha)
      values ($1, $2, 'X', 'gasto', 'X', 1, 'mensual', '2099-01-01')`, [beto, efectivoAna])).rejects.toThrow()
    await expect(comoU(beto, `insert into public.transferencias (user_id, cuenta_origen_id, cuenta_destino_id, cuenta_origen_nombre, cuenta_destino_nombre, monto)
      values ($1, $2, $3, 'X', 'Y', 1)`, [beto, efectivoAna, tarjetaAna])).rejects.toThrow()
    await expect(comoU(beto, `insert into public.meta_contribuciones (user_id, meta_id, tipo, monto) values ($1, $2, 'retiro', 1)`, [beto, metaAna]))
      .rejects.toThrow()
  })

  it('impacto: el aviso de corte de la tarjeta de Ana no cambia por filas que inserta Beto', async () => {
    // Tarjeta de Ana con deuda 5,000, día de corte = hoy (hora de México) y un dispositivo push
    await db.query(`update public.cuentas set saldo = 5000,
      fecha_corte = extract(day from (now() at time zone 'America/Mexico_City'))::int where id = $1`, [tarjetaAna])
    await db.query(`insert into public.fcm_tokens (user_id, token) values ($1, 'tok-ana-' || gen_random_uuid())`, [ana])

    const avisoDeAna = async () => {
      await db.query(`select public.revisar_notificaciones_tarjetas_credito()`)
      const { rows } = await db.query(`select body->>'body' as cuerpo from net.llamadas where body->>'user_id' = $1 order by id desc limit 1`, [ana])
      return rows[0]?.cuerpo
    }
    const antes = await avisoDeAna()
    expect(antes).toBe('Deuda al corte: $5,000.00')

    // Beto inserta una "mensualidad futura" suya contra la tarjeta de Ana
    await comoU(beto, `insert into public.transacciones (user_id, cuenta_id, categoria_nombre, tipo, monto, fecha, compra_meses_id, mensualidad, meses)
      values ($1, $2, 'X', 'gasto', 5000, ((now() at time zone 'America/Mexico_City')::date + 40), gen_random_uuid(), 2, 2)`, [beto, tarjetaAna]).catch(() => {})

    // Sin la vulnerabilidad Ana sigue viendo su deuda real; con ella ve "$0.00 (más $5,000.00 a meses)"
    expect(await avisoDeAna()).toBe(antes)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('límite de uso de Kairen IA (ia_rate_limit)', () => {
  // Corregido en 20261029000002: la política era FOR ALL y el usuario podía
  // borrar (o mover al pasado) sus registros. Ahora solo la Edge Function
  // (service_role) toca la tabla.
  it('desde la app (con o sin sesión) la tabla no es accesible', async () => {
    const ana = await crearUsuario(db, { plan: 'premium' })
    for (const sql of [`select * from public.ia_rate_limit`, `insert into public.ia_rate_limit (user_id) values ('${ana}')`]) {
      await expect(comoU(ana, sql)).rejects.toThrow('permission denied')
      await expect(comoA(sql)).rejects.toThrow('permission denied')
    }
  })

  it('el usuario no puede borrar sus propios registros del límite', async () => {
    const ana = await crearUsuario(db, { plan: 'premium' })
    for (let i = 0; i < 30; i++) await db.query(`insert into public.ia_rate_limit (user_id) values ($1)`, [ana])
    const { rows } = await comoU(ana, `delete from public.ia_rate_limit where user_id = $1 returning id`, [ana]).catch(() => ({ rows: [] }))
    expect(rows).toHaveLength(0)
    expect(await contar('ia_rate_limit', ana)).toBe(30)
  })

  it('el usuario no puede mover sus registros al pasado', async () => {
    const ana = await crearUsuario(db, { plan: 'premium' })
    await db.query(`insert into public.ia_rate_limit (user_id) values ($1)`, [ana])
    const { rows } = await comoU(ana, `update public.ia_rate_limit set created_at = now() - interval '2 hours' where user_id = $1 returning id`, [ana])
      .catch(() => ({ rows: [] }))
    expect(rows).toHaveLength(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('inyección SQL por cada RPC que recibe texto', () => {
  const PAYLOADS = [
    `'); drop table public.transacciones; --`,
    `%' or '1'='1`,
    `' or 1=1 --`,
    `x'; update public.perfiles set plan = 'premium'; --`,
    `$$; drop table public.cuentas; $$`,
    `\\'; delete from public.cuentas; --`,
    `"; select pg_sleep(3); --`,
  ]
  let ana, victima, efectivo, banco, tarjeta, cuentaVictima
  beforeAll(async () => {
    ana = await crearUsuario(db, { plan: 'premium' })
    victima = await crearUsuario(db)
    cuentaVictima = await crearCuenta(db, victima, { saldo: 777 })
    efectivo = await crearCuenta(db, ana, { saldo: 100000 })
    banco = await crearCuenta(db, ana, { nombre: 'Banco', saldo: 0 })
    tarjeta = await crearCuenta(db, ana, { nombre: 'Visa', tipo: 'tarjeta_credito', saldo: 0 })
  })

  async function integridad() {
    const { rows: [r] } = await db.query(`select to_regclass('public.transacciones') is not null as tx, to_regclass('public.cuentas') is not null as cu,
      (select plan from public.perfiles where user_id = $1) as plan_victima,
      (select saldo from public.cuentas where id = $2) as saldo_victima`, [victima, cuentaVictima])
    expect({ ...r, saldo_victima: Number(r.saldo_victima) }).toEqual({ tx: true, cu: true, plan_victima: 'gratis', saldo_victima: 777 })
  }

  it.each(PAYLOADS)('movimientos, transferencias, pagos y compras a meses guardan el texto literal: %s', async (p) => {
    const tx = await rpc(ana, 'crear_transaccion_segura', { p_cuenta_id: efectivo, p_categoria_nombre: p, p_tipo: 'gasto', p_monto: 1, p_descripcion: p, p_fecha: HOY })
    expect((await db.query(`select categoria_nombre, descripcion from public.transacciones where id = $1`, [tx])).rows[0]).toEqual({ categoria_nombre: p, descripcion: p })

    await rpc(ana, 'editar_transaccion_segura', { p_transaccion_id: tx, p_cuenta_id: efectivo, p_categoria_nombre: p + '2', p_tipo: 'gasto', p_monto: 1, p_descripcion: p + '2', p_fecha: HOY })
    expect((await db.query(`select categoria_nombre from public.transacciones where id = $1`, [tx])).rows[0].categoria_nombre).toBe(p + '2')

    const opId = (p + '-' + Math.random()).slice(0, 100).padEnd(8, 'x')
    const tx2 = await rpc(ana, 'crear_transaccion_idempotente', { p_client_op_id: opId, p_cuenta_id: efectivo, p_categoria_nombre: p, p_tipo: 'gasto', p_monto: 1, p_descripcion: p, p_fecha: HOY })
    expect(await rpc(ana, 'crear_transaccion_idempotente', { p_client_op_id: opId, p_cuenta_id: efectivo, p_categoria_nombre: p, p_tipo: 'gasto', p_monto: 1, p_descripcion: p, p_fecha: HOY })).toBe(tx2)

    const tr = await rpc(ana, 'crear_transferencia_segura', { p_cuenta_origen_id: efectivo, p_cuenta_destino_id: banco, p_monto: 1, p_descripcion: p, p_fecha: HOY })
    expect((await db.query(`select descripcion from public.transferencias where id = $1`, [tr])).rows[0].descripcion).toBe(p)
    await rpc(ana, 'crear_transferencia_idempotente', { p_client_op_id: ('t' + opId).slice(0, 100), p_cuenta_origen_id: efectivo, p_cuenta_destino_id: banco, p_monto: 1, p_descripcion: p, p_fecha: HOY })

    const pago = await rpc(ana, 'pagar_tarjeta_credito', { p_tarjeta_id: tarjeta, p_cuenta_origen_id: efectivo, p_monto: 1, p_fecha: HOY, p_descripcion: p })
    expect((await db.query(`select descripcion from public.transferencias where id = $1`, [pago])).rows[0].descripcion).toBe(p)

    const compra = await rpc(ana, 'crear_compra_meses_idempotente', { p_client_op_id: ('m' + opId).slice(0, 100), p_cuenta_id: tarjeta, p_categoria_nombre: p, p_monto: 30, p_meses: 3, p_descripcion: p, p_fecha: HOY })
    const { rows } = await db.query(`select distinct categoria_nombre, descripcion from public.transacciones where compra_meses_id = $1`, [compra])
    expect(rows).toEqual([{ categoria_nombre: p, descripcion: p }])

    await integridad()
  })

  it.each(PAYLOADS)('metas, grupos e invitaciones tratan el texto como dato: %s', async (p) => {
    const meta = (await db.query(`insert into public.metas (user_id, nombre, monto_objetivo) values ($1, 'Meta', 1000) returning id`, [ana])).rows[0].id
    await rpc(ana, 'registrar_contribucion_meta', { p_meta_id: meta, p_tipo: 'contribucion', p_monto: 1, p_nota: p })
    expect((await db.query(`select nota from public.meta_contribuciones where meta_id = $1`, [meta])).rows[0].nota).toBe(p)

    const grupo = await rpc(ana, 'crear_grupo', { p_nombre: p })
    expect((await db.query(`select nombre from public.grupos where id = $1`, [grupo])).rows[0].nombre).toBe(p)

    const otro = await crearUsuario(db, { plan: 'premium' })
    await expect(rpc(otro, 'unirse_a_grupo', { p_codigo: p })).rejects.toThrow('Código de invitación inválido')
    await expect(rpc(otro, 'unirse_a_grupo', { p_codigo: '%' })).rejects.toThrow('Código de invitación inválido')
    expect((await db.query(`select count(*)::int as n from public.miembros_grupo where user_id = $1`, [otro])).rows[0].n).toBe(0)

    await integridad()
  })

  it('importar_respaldo con textos maliciosos los guarda literales', async () => {
    const nuevo = await crearUsuario(db)
    const p = PAYLOADS[0]
    await rpc(nuevo, 'importar_respaldo', {
      p_datos: ({
        cuentas: [{ id: 'c1', nombre: p, tipo: 'efectivo', saldo: 0 }],
        categorias: [{ id: 'k1', nombre: p, tipo: 'gasto' }],
        metas: [{ id: 'm1', nombre: p, monto_objetivo: 10 }],
        transacciones: [{ cuenta_id: 'c1', tipo: 'gasto', monto: 1, fecha: HOY, categoria_nombre: p, descripcion: p }],
      }),
    })
    const { rows: [t] } = await db.query(`select categoria_nombre, descripcion from public.transacciones where user_id = $1`, [nuevo])
    expect(t).toEqual({ categoria_nombre: p, descripcion: p })
    await integridad()
  })

  it('ninguna función de public arma SQL dinámico (EXECUTE)', async () => {
    const { rows } = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosrc ~* '\\mexecute\\M'`)
    expect(rows).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('sin sesión (anon)', () => {
  let ana, efectivoAna
  beforeAll(async () => {
    ana = await crearUsuario(db, { plan: 'premium' })
    efectivoAna = await crearCuenta(db, ana, { saldo: 1000 })
    for (const tabla of TABLAS_PERSONALES) await sembrar(tabla, ana)
  })

  it.each([...TABLAS_PERSONALES, 'perfiles', 'grupos', 'miembros_grupo', 'gastos_hogar', 'presupuestos_hogar', 'metas_grupo'])(
    'no lee %s', async (tabla) => {
      const { rows } = await comoA(`select * from public.${tabla}`)
      expect(rows).toHaveLength(0)
    })

  it.each(TABLAS_PERSONALES)('no inserta en %s', async (tabla) => {
    const meta = (await db.query(`select id from public.metas where user_id = $1 limit 1`, [ana])).rows[0].id
    const [sql, params] = SEMILLAS[tabla](ana, { meta })
    await expect(comoA(sql, params)).rejects.toThrow(/row-level security|permission denied/)
  })

  it('las RPC no hacen nada sin sesión', async () => {
    const llamar = (sql, params = []) => comoA(sql, params)
    // Desde 20261029000002 anon ya no puede ejecutar las funciones de la API
    for (const sql of [
      `select public.crear_transaccion_segura('${efectivoAna}', 'X', 'gasto', 10, null, '${HOY}')`,
      `select public.reiniciar_cuenta_segura()`,
      `select public.crear_grupo('x')`,
      `select public.unirse_a_grupo('x')`,
      `select * from public.obtener_metas_visibles()`,
      `select public.importar_respaldo('{}'::jsonb)`,
      `select public.procesar_recurrentes(null)`,
      `select public.registrar_contribucion_meta(gen_random_uuid(), 'retiro', 1, null, null)`,
      `select public.crear_compra_meses_idempotente('op-anon-0001', gen_random_uuid(), 'x', 10, 2, null, '${HOY}')`,
      `select public.eliminar_compra_meses(gen_random_uuid())`,
      `select public.es_miembro_de_grupo(gen_random_uuid())`,
    ]) await expect(llamar(sql), sql).rejects.toThrow(/permission denied/)
    expect(await saldo(db, efectivoAna)).toBe(1000)
  })

  // HALLAZGO (bajo): 15 funciones de la API siguen con EXECUTE para anon
  // (GRANT ALL del volcado). Hoy no hacen nada sin auth.uid(), pero cualquier
  // cambio futuro que olvide validar la sesión quedaría abierto a internet.
  it('anon no puede ejecutar ninguna función de public', async () => {
    const { rows } = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`)
    expect(rows.map(r => r.proname)).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('catálogo: RLS, SECURITY DEFINER y funciones internas', () => {
  it('todas las tablas de public tienen RLS activo', async () => {
    const { rows } = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`)
    expect(rows).toEqual([])
  })

  it('ninguna política usa using (true) ni with check (true)', async () => {
    const { rows } = await db.query(`select tablename, policyname from pg_policies where schemaname = 'public'
      and (trim(qual) in ('true', '(true)') or trim(with_check) in ('true', '(true)'))`)
    expect(rows).toEqual([])
  })

  it('toda función SECURITY DEFINER fija search_path', async () => {
    const { rows } = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`)
    expect(rows).toEqual([])
  })

  it('authenticated solo ejecuta las RPC de la app (las internas están revocadas)', async () => {
    const PERMITIDAS = new Set([
      'compartir_meta', 'crear_compra_meses_idempotente', 'crear_grupo', 'crear_transaccion_idempotente',
      'crear_transaccion_segura', 'crear_transferencia_idempotente', 'crear_transferencia_segura',
      'dejar_compartir_meta', 'editar_transaccion_segura', 'eliminar_compra_meses', 'eliminar_transaccion_segura',
      'eliminar_transferencia_segura', 'es_miembro_de_grupo', 'importar_respaldo', 'obtener_disponible_historico',
      'obtener_metas_visibles', 'pagar_tarjeta_credito', 'procesar_recurrentes', 'registrar_contribucion_meta',
      'reiniciar_cuenta_segura', 'sumar_meses_con_dia', 'tiene_acceso_premium', 'unirse_a_grupo',
      'proteger_plan_perfil', // trigger de producción (no llamable por /rpc)
    ])
    const { rows } = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`)
    expect(rows.map(r => r.proname).filter(f => !PERMITIDAS.has(f))).toEqual([])
  })

  it('un usuario no puede disparar avisos push ni las tareas de cron', async () => {
    const ana = await crearUsuario(db)
    for (const sql of [
      `select public.enviar_push($1, 'recordatorio', 't', 'b', '/')`,
      `select public.registrar_error_push($1, 'recordatorio', 't', 'e')`,
      `select public.tiene_dispositivo_push($1)`,
    ]) await expect(comoU(ana, sql, [ana]), sql).rejects.toThrow(/permission denied/)
    for (const sql of [
      `select public.recordatorio_registrar_gastos()`,
      `select public.revisar_notificaciones_tarjetas_credito()`,
      `select public.revisar_resultados_push()`,
      `select public.limpiar_rate_limit_ia()`,
    ]) await expect(comoU(ana, sql), sql).rejects.toThrow(/permission denied/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Trabajo en curso (20261029000001_correos_fundadores.sql, sin commit):
// HALLAZGO (medio, condicionado a la configuración de Auth): crear_perfil_usuario
// da acceso_fundador en el INSERT de auth.users, cuando el correo todavía no
// está confirmado. Si "Confirm email" está apagado (o se apaga), cualquiera
// que se registre con un correo de la lista (que está en el repo) obtiene
// Premium de por vida sin ser dueño del correo.
describe('premium de por vida por correo', () => {
  it('registrarse con un correo de la lista SIN confirmarlo no da acceso fundador', async () => {
    const { rows: [{ t }] } = await db.query(`select to_regclass('public.correos_fundadores') as t`)
    if (!t) return // la migración aún no existe en este árbol
    await db.query(`alter table auth.users add column if not exists email_confirmed_at timestamptz`)
    await db.query(`insert into public.correos_fundadores (email) values ('tester.real@gmail.com') on conflict do nothing`)
    await db.query(`create or replace trigger on_auth_user_created after insert on auth.users
      for each row execute function public.crear_perfil_usuario()`)
    try {
      const { rows: [{ id }] } = await db.query(
        `insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), 'tester.real@gmail.com', null) returning id`)
      const { rows: [p] } = await db.query(`select acceso_fundador from public.perfiles where user_id = $1`, [id])
      expect(p.acceso_fundador).toBe(false)
    } finally {
      await db.query(`drop trigger if exists on_auth_user_created on auth.users`)
    }
  })
})
