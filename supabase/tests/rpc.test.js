import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { crearBaseDePrueba, crearUsuario, crearCuenta, saldo, comoUsuario, comoAnonimo } from './db.js'

// Todas las llamadas a las RPC se hacen como el usuario (rol authenticated),
// igual que desde la app. Cada prueba usa usuarios y cuentas nuevos, así que
// comparten una sola base sin pisarse.
let db
beforeAll(async () => { db = await crearBaseDePrueba() }, 60_000)

const HOY = '2026-10-26'

async function rpc(userId, funcion, args) {
  const nombres = Object.keys(args)
  const sql = `select public.${funcion}(${nombres.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`
  const { rows: [{ r }] } = await comoUsuario(db, userId, () => db.query(sql, Object.values(args)))
  return r
}

const crearTx = (userId, cuentaId, tipo, monto) => rpc(userId, 'crear_transaccion_segura', {
  p_cuenta_id: cuentaId, p_categoria_nombre: 'Comida', p_tipo: tipo, p_monto: monto, p_descripcion: null, p_fecha: HOY,
})

describe('transacciones', () => {
  let ana, efectivo, tarjeta
  beforeEach(async () => {
    ana = await crearUsuario(db)
    efectivo = await crearCuenta(db, ana, { saldo: 1000 })
    tarjeta = await crearCuenta(db, ana, { nombre: 'Visa', tipo: 'tarjeta_credito', saldo: 0 })
  })

  it('un gasto resta del efectivo y un ingreso suma', async () => {
    await crearTx(ana, efectivo, 'gasto', 150)
    await crearTx(ana, efectivo, 'ingreso', 40)
    expect(await saldo(db, efectivo)).toBe(890)
  })

  it('en tarjeta de crédito un gasto sube la deuda y no admite ingresos', async () => {
    await crearTx(ana, tarjeta, 'gasto', 300)
    expect(await saldo(db, tarjeta)).toBe(300)
    await expect(crearTx(ana, tarjeta, 'ingreso', 50)).rejects.toThrow('Usa "Pagar tarjeta"')
    expect(await saldo(db, tarjeta)).toBe(300)
  })

  it('rechaza montos no positivos, tipos inválidos y cuentas de otro usuario', async () => {
    const beto = await crearUsuario(db)
    await expect(crearTx(ana, efectivo, 'gasto', 0)).rejects.toThrow('mayor que cero')
    await expect(crearTx(ana, efectivo, 'regalo', 10)).rejects.toThrow('Tipo de movimiento inválido')
    await expect(crearTx(beto, efectivo, 'gasto', 10)).rejects.toThrow('Cuenta no válida')
    expect(await saldo(db, efectivo)).toBe(1000)
  })

  it('editar cambia monto y cuenta, y repetir la misma edición no vuelve a mover saldos', async () => {
    const id = await crearTx(ana, efectivo, 'gasto', 100)
    const edicion = {
      p_transaccion_id: id, p_cuenta_id: tarjeta, p_categoria_nombre: 'Comida',
      p_tipo: 'gasto', p_monto: 250, p_descripcion: 'cena', p_fecha: HOY,
    }

    await rpc(ana, 'editar_transaccion_segura', edicion)
    expect(await saldo(db, efectivo)).toBe(1000)
    expect(await saldo(db, tarjeta)).toBe(250)

    await rpc(ana, 'editar_transaccion_segura', edicion)
    expect(await saldo(db, efectivo)).toBe(1000)
    expect(await saldo(db, tarjeta)).toBe(250)
  })

  it('eliminar revierte el efecto en efectivo y en tarjeta', async () => {
    const enEfectivo = await crearTx(ana, efectivo, 'gasto', 100)
    const enTarjeta = await crearTx(ana, tarjeta, 'gasto', 70)

    await rpc(ana, 'eliminar_transaccion_segura', { p_transaccion_id: enEfectivo })
    await rpc(ana, 'eliminar_transaccion_segura', { p_transaccion_id: enTarjeta })

    expect(await saldo(db, efectivo)).toBe(1000)
    expect(await saldo(db, tarjeta)).toBe(0)
  })

  it('otro usuario no puede ver, editar ni eliminar el movimiento', async () => {
    const beto = await crearUsuario(db)
    const id = await crearTx(ana, efectivo, 'gasto', 100)

    const { rows } = await comoUsuario(db, beto, () => db.query(`select id from public.transacciones where id = $1`, [id]))
    expect(rows).toEqual([])
    await expect(rpc(beto, 'eliminar_transaccion_segura', { p_transaccion_id: id })).rejects.toThrow('Movimiento no encontrado')
    expect(await saldo(db, efectivo)).toBe(900)
  })
})

describe('idempotencia de la cola offline', () => {
  let ana, efectivo, ahorro
  beforeEach(async () => {
    ana = await crearUsuario(db)
    efectivo = await crearCuenta(db, ana, { saldo: 1000 })
    ahorro = await crearCuenta(db, ana, { nombre: 'Ahorro', tipo: 'banco', saldo: 0 })
  })

  const crearTxIdem = (opId, cuentaId = efectivo, monto = 100) => rpc(ana, 'crear_transaccion_idempotente', {
    p_client_op_id: opId, p_cuenta_id: cuentaId, p_categoria_nombre: 'Comida',
    p_tipo: 'gasto', p_monto: monto, p_descripcion: null, p_fecha: HOY,
  })

  it('reintentar la misma operación devuelve el mismo id y cobra una sola vez', async () => {
    const primero = await crearTxIdem('op-00000001')
    const reintento = await crearTxIdem('op-00000001')

    expect(reintento).toBe(primero)
    expect(await saldo(db, efectivo)).toBe(900)
    const { rows } = await db.query(`select count(*)::int as n from public.transacciones where user_id = $1`, [ana])
    expect(rows[0].n).toBe(1)
  })

  it('si la creación falla no deja registro y el reintento sí la crea', async () => {
    const beto = await crearUsuario(db)
    const cuentaAjena = await crearCuenta(db, beto)
    await expect(crearTxIdem('op-00000002', cuentaAjena)).rejects.toThrow('Cuenta no válida')

    await crearTxIdem('op-00000002', efectivo)
    expect(await saldo(db, efectivo)).toBe(900)
  })

  it('un id ya usado por otra acción se rechaza', async () => {
    await crearTxIdem('op-00000003')
    await expect(rpc(ana, 'crear_transferencia_idempotente', {
      p_client_op_id: 'op-00000003', p_cuenta_origen_id: efectivo, p_cuenta_destino_id: ahorro,
      p_monto: 50, p_descripcion: null, p_fecha: HOY,
    })).rejects.toThrow('Identificador de operación repetido')
    expect(await saldo(db, ahorro)).toBe(0)
  })

  it('una transferencia reintentada se registra una sola vez', async () => {
    const args = {
      p_client_op_id: 'op-00000004', p_cuenta_origen_id: efectivo, p_cuenta_destino_id: ahorro,
      p_monto: 200, p_descripcion: null, p_fecha: HOY,
    }
    expect(await rpc(ana, 'crear_transferencia_idempotente', args)).toBe(await rpc(ana, 'crear_transferencia_idempotente', args))
    expect(await saldo(db, efectivo)).toBe(800)
    expect(await saldo(db, ahorro)).toBe(200)
  })

  it('el mismo id de otro usuario es una operación distinta', async () => {
    const beto = await crearUsuario(db)
    const deBeto = await crearCuenta(db, beto, { saldo: 500 })
    await crearTxIdem('op-00000005')

    await rpc(beto, 'crear_transaccion_idempotente', {
      p_client_op_id: 'op-00000005', p_cuenta_id: deBeto, p_categoria_nombre: 'Comida',
      p_tipo: 'gasto', p_monto: 100, p_descripcion: null, p_fecha: HOY,
    })
    expect(await saldo(db, deBeto)).toBe(400)
  })
})

describe('transferencias y pago de tarjeta', () => {
  let ana, efectivo, ahorro, tarjeta
  beforeEach(async () => {
    ana = await crearUsuario(db)
    efectivo = await crearCuenta(db, ana, { saldo: 1000 })
    ahorro = await crearCuenta(db, ana, { nombre: 'Ahorro', tipo: 'banco', saldo: 0 })
    tarjeta = await crearCuenta(db, ana, { nombre: 'Visa', tipo: 'tarjeta_credito', saldo: 600 })
  })

  const transferir = (origen, destino, monto) => rpc(ana, 'crear_transferencia_segura', {
    p_cuenta_origen_id: origen, p_cuenta_destino_id: destino, p_monto: monto, p_descripcion: null, p_fecha: HOY,
  })
  const pagar = (origen, tarjetaId, monto) => rpc(ana, 'pagar_tarjeta_credito', {
    p_tarjeta_id: tarjetaId, p_cuenta_origen_id: origen, p_monto: monto, p_fecha: HOY, p_descripcion: null,
  })

  it('una transferencia mueve el dinero y eliminarla lo regresa', async () => {
    const id = await transferir(efectivo, ahorro, 300)
    expect([await saldo(db, efectivo), await saldo(db, ahorro)]).toEqual([700, 300])

    await rpc(ana, 'eliminar_transferencia_segura', { p_transferencia_id: id })
    expect([await saldo(db, efectivo), await saldo(db, ahorro)]).toEqual([1000, 0])
  })

  it('rechaza transferir a la misma cuenta, a cuentas ajenas o montos no positivos sin tocar saldos', async () => {
    const beto = await crearUsuario(db)
    const deBeto = await crearCuenta(db, beto)

    await expect(transferir(efectivo, efectivo, 10)).rejects.toThrow('no pueden ser la misma')
    await expect(transferir(efectivo, deBeto, 10)).rejects.toThrow('Cuenta no encontrada')
    await expect(transferir(efectivo, ahorro, 0)).rejects.toThrow('mayor que cero')
    expect([await saldo(db, efectivo), await saldo(db, ahorro), await saldo(db, deBeto)]).toEqual([1000, 0, 0])
  })

  it('pagar la tarjeta baja la deuda y el origen; eliminar el pago lo revierte', async () => {
    const id = await pagar(efectivo, tarjeta, 250)
    expect([await saldo(db, efectivo), await saldo(db, tarjeta)]).toEqual([750, 350])

    await rpc(ana, 'eliminar_transferencia_segura', { p_transferencia_id: id })
    expect([await saldo(db, efectivo), await saldo(db, tarjeta)]).toEqual([1000, 600])
  })

  it('no se paga una tarjeta con otra ni se "paga" una cuenta que no es tarjeta', async () => {
    const otra = await crearCuenta(db, ana, { nombre: 'Amex', tipo: 'tarjeta_credito', saldo: 100 })
    await expect(pagar(otra, tarjeta, 50)).rejects.toThrow('con otra tarjeta')
    await expect(pagar(efectivo, ahorro, 50)).rejects.toThrow('no es una tarjeta')
    await expect(pagar(efectivo, tarjeta, -5)).rejects.toThrow('mayor que cero')
    expect([await saldo(db, efectivo), await saldo(db, tarjeta), await saldo(db, otra)]).toEqual([1000, 600, 100])
  })
})

describe('permisos (v2.9)', () => {
  it('el usuario no puede cambiarse el plan ni crearse otro perfil', async () => {
    const ana = await crearUsuario(db)
    await expect(comoUsuario(db, ana, () =>
      db.query(`update public.perfiles set plan = 'premium', acceso_fundador = true where user_id = $1`, [ana])
    )).rejects.toThrow('permission denied')
    await expect(comoUsuario(db, ana, () =>
      db.query(`insert into public.perfiles (user_id, plan) values (gen_random_uuid(), 'premium')`)
    )).rejects.toThrow('permission denied')

    const { rows } = await db.query(`select plan from public.perfiles where user_id = $1`, [ana])
    expect(rows[0].plan).toBe('gratis')
  })

  it.each([
    'recordatorio_registrar_gastos',
    'revisar_notificaciones_tarjetas_credito',
    'limpiar_rate_limit_ia',
  ])('nadie fuera del servidor puede ejecutar %s', async (funcion) => {
    const ana = await crearUsuario(db)
    await expect(comoUsuario(db, ana, () => db.query(`select public.${funcion}()`))).rejects.toThrow('permission denied')
    await expect(comoAnonimo(db, () => db.query(`select public.${funcion}()`))).rejects.toThrow('permission denied')
  })

  it('solo los miembros ven un grupo y sus integrantes', async () => {
    const ana = await crearUsuario(db)
    const beto = await crearUsuario(db)
    const { rows: [{ id: grupo }] } = await db.query(`insert into public.grupos (nombre, creado_por) values ('Casa', $1) returning id`, [ana])
    await db.query(`insert into public.miembros_grupo (grupo_id, user_id, rol) values ($1, $2, 'admin')`, [grupo, ana])

    const verGrupo = (uid) => comoUsuario(db, uid, () => db.query(`select id from public.grupos where id = $1`, [grupo]))
    const verMiembros = (uid) => comoUsuario(db, uid, () => db.query(`select user_id from public.miembros_grupo where grupo_id = $1`, [grupo]))

    expect((await verGrupo(ana)).rows).toHaveLength(1)
    expect((await verGrupo(beto)).rows).toEqual([])
    expect((await verMiembros(beto)).rows).toEqual([])
  })

  it('las tablas del modo colaborativo no aceptan escrituras directas', async () => {
    const ana = await crearUsuario(db)
    await expect(comoUsuario(db, ana, () =>
      db.query(`insert into public.grupos (nombre, creado_por) values ('Hack', $1)`, [ana])
    )).rejects.toThrow(/row-level security|permission denied/)
  })
})

describe('avisos push (pg_net + registro en push_envios)', () => {
  let ana, efectivo
  beforeEach(async () => {
    ana = await crearUsuario(db)
    efectivo = await crearCuenta(db, ana, { saldo: 5000 })
    await db.query(`insert into public.presupuestos (user_id, categoria_nombre, monto_limite) values ($1, 'Comida', 1000)`, [ana])
  })

  const suscribirWeb = (uid = ana) => db.query(
    `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [uid, `https://fcm.googleapis.com/fcm/send/${uid}`]
  )
  const registrarFcm = (uid = ana) => db.query(`insert into public.fcm_tokens (user_id, token) values ($1, $2)`, [uid, `fcm-${uid}`])
  const llamadasDe = async (uid) => (await db.query(
    `select id, url, headers, body from net.llamadas where body->>'user_id' = $1 order by id`, [uid]
  )).rows
  const enviosDe = async (uid) => (await db.query(
    `select origen, titulo, request_id, estado, status_code, error from public.push_envios where user_id = $1 order by id`, [uid]
  )).rows
  const responder = (requestId, status, content) => db.query(
    `insert into net._http_response (id, status_code, content, timed_out) values ($1, $2, $3, false)`, [requestId, status, content]
  )

  it('al pasar el 80 % llama a send-push con el secreto de Vault y lo registra como pendiente', async () => {
    await suscribirWeb()
    await crearTx(ana, efectivo, 'gasto', 500)
    expect(await llamadasDe(ana)).toEqual([])

    await crearTx(ana, efectivo, 'gasto', 350)

    const [llamada, ...resto] = await llamadasDe(ana)
    expect(resto).toEqual([])
    expect(llamada.url).toBe('https://proyecto-prueba.supabase.co/functions/v1/send-push')
    expect(llamada.headers.Authorization).toBe('Bearer secreto-de-prueba')
    expect(llamada.body.title).toContain('85%')
    expect(await enviosDe(ana)).toEqual([
      expect.objectContaining({ origen: 'presupuesto', request_id: Number(llamada.id), estado: 'pendiente' }),
    ])
  })

  it('al pasar el 100 % avisa que se excedió', async () => {
    await suscribirWeb()
    await crearTx(ana, efectivo, 'gasto', 1200)
    const [llamada] = await llamadasDe(ana)
    expect(llamada.body.title).toContain('excedido')
    expect(llamada.body.body).toBe('Comida: $1,200.00 de $1,000.00 (120%)')
  })

  it('también avisa a quien solo tiene la app de Android (FCM)', async () => {
    await registrarFcm()
    await crearTx(ana, efectivo, 'gasto', 900)
    expect(await llamadasDe(ana)).toHaveLength(1)
  })

  it('no avisa sin dispositivos ni por ingresos', async () => {
    await crearTx(ana, efectivo, 'gasto', 900)
    await suscribirWeb()
    await crearTx(ana, efectivo, 'ingreso', 900)
    expect(await llamadasDe(ana)).toEqual([])
    expect(await enviosDe(ana)).toEqual([])
  })

  it('si faltan los secretos de Vault registra el error y el gasto se guarda igual', async () => {
    await suscribirWeb()
    await db.query(`delete from vault.decrypted_secrets where name = 'internal_cron_secret'`)
    try {
      await crearTx(ana, efectivo, 'gasto', 900)
    } finally {
      await db.query(`insert into vault.decrypted_secrets values ('internal_cron_secret', 'secreto-de-prueba')`)
    }

    expect(await saldo(db, efectivo)).toBe(4100)
    expect(await llamadasDe(ana)).toEqual([])
    expect(await enviosDe(ana)).toEqual([expect.objectContaining({ estado: 'error_sql', error: expect.stringContaining('Vault') })])
  })

  it('revisar_resultados_push copia la respuesta de pg_net a cada envío', async () => {
    const beto = await crearUsuario(db)
    const carla = await crearUsuario(db)
    for (const uid of [ana, beto, carla]) await registrarFcm(uid)
    await db.query(`select public.recordatorio_registrar_gastos()`)

    const [[deAna], [deBeto], [deCarla]] = await Promise.all([ana, beto, carla].map(llamadasDe))
    await responder(deAna.id, 200, '{"enviadas":1,"web":0,"fcm":1}')
    await responder(deBeto.id, 200, '{"enviadas":0,"web":0,"fcm":1}')
    await responder(deCarla.id, 500, '{"error":"boom"}')
    await db.query(`select public.revisar_resultados_push()`)

    expect((await enviosDe(ana))[0]).toMatchObject({ origen: 'recordatorio', estado: 'enviado', status_code: 200 })
    expect((await enviosDe(beto))[0]).toMatchObject({ estado: 'sin_dispositivos' })
    expect((await enviosDe(carla))[0]).toMatchObject({ estado: 'fallido', status_code: 500 })
  })

  it('marca sin_respuesta lo que pg_net ya no tiene y borra lo de más de 30 días', async () => {
    await db.query(
      `insert into public.push_envios (user_id, origen, request_id, created_at) values
         ($1, 'recordatorio', -1, now() - interval '7 hours'),
         ($1, 'recordatorio', -2, now() - interval '31 days')`, [ana]
    )
    await db.query(`select public.revisar_resultados_push()`)
    expect(await enviosDe(ana)).toEqual([expect.objectContaining({ request_id: -1, estado: 'sin_respuesta' })])
  })

  it('avisa el día de corte de la tarjeta a usuarios de Android', async () => {
    const { rows: [{ dia }] } = await db.query(`select extract(day from current_date)::int as dia`)
    await db.query(
      `insert into public.cuentas (user_id, nombre, tipo, saldo, fecha_corte) values ($1, 'Visa', 'tarjeta_credito', 300, $2)`, [ana, dia]
    )
    await registrarFcm()
    await db.query(`select public.revisar_notificaciones_tarjetas_credito()`)

    const [llamada] = await llamadasDe(ana)
    expect(llamada.body.title).toBe('📅 Hoy es tu fecha de corte: Visa')
    expect((await enviosDe(ana))[0]).toMatchObject({ origen: 'tarjeta', estado: 'pendiente' })
  })

  it('el registro y las funciones de envío no son accesibles desde la app', async () => {
    await expect(comoUsuario(db, ana, () => db.query(`select * from public.push_envios`))).rejects.toThrow('permission denied')
    await expect(comoUsuario(db, ana, () =>
      db.query(`select public.enviar_push($1, 'recordatorio', 'x', 'y', '/')`, [ana])
    )).rejects.toThrow('permission denied')
    await expect(comoAnonimo(db, () => db.query(`select public.revisar_resultados_push()`))).rejects.toThrow('permission denied')
  })
})

describe('validaciones v3.1', () => {
  it('las tarjetas de crédito no participan en transferencias (ni por la cola offline)', async () => {
    const ana = await crearUsuario(db)
    const efectivo = await crearCuenta(db, ana, { saldo: 1000 })
    const tarjeta = await crearCuenta(db, ana, { nombre: 'Visa', tipo: 'tarjeta_credito', saldo: 600 })
    const args = { p_cuenta_origen_id: efectivo, p_cuenta_destino_id: tarjeta, p_monto: 100, p_descripcion: null, p_fecha: HOY }

    await expect(rpc(ana, 'crear_transferencia_segura', args)).rejects.toThrow('Usa "Pagar tarjeta"')
    await expect(rpc(ana, 'crear_transferencia_segura', { ...args, p_cuenta_origen_id: tarjeta, p_cuenta_destino_id: efectivo }))
      .rejects.toThrow('Usa "Pagar tarjeta"')
    await expect(rpc(ana, 'crear_transferencia_idempotente', { p_client_op_id: 'op-00000099', ...args }))
      .rejects.toThrow('Usa "Pagar tarjeta"')
    expect([await saldo(db, efectivo), await saldo(db, tarjeta)]).toEqual([1000, 600])
  })

  it('contribuir_meta_compartida ya no existe y registrar_contribucion_meta sigue funcionando', async () => {
    const { rows } = await db.query(`select to_regprocedure('public.contribuir_meta_compartida(uuid, text, numeric, text)') as f`)
    expect(rows[0].f).toBeNull()

    const ana = await crearUsuario(db)
    const { rows: [{ id: meta }] } = await db.query(
      `insert into public.metas (user_id, nombre, monto_objetivo) values ($1, 'Viaje', 1000) returning id`, [ana]
    )
    expect(Number(await rpc(ana, 'registrar_contribucion_meta', { p_meta_id: meta, p_tipo: 'contribucion', p_monto: 250 }))).toBe(250)
  })
})

describe('importar_respaldo', () => {
  const respaldo = (dueno) => ({
    cuentas: [
      { id: 'c1', user_id: dueno, nombre: 'Efectivo', tipo: 'efectivo', saldo: 850 },
      { id: 'c2', user_id: dueno, nombre: 'Visa', tipo: 'tarjeta_credito', saldo: 300, limite_credito: 5000, fecha_corte: 15, fecha_pago: 5 },
    ],
    categorias: [{ id: 'k1', nombre: 'Comida', tipo: 'gasto', icono: 'UtensilsCrossed' }],
    transacciones: [
      { cuenta_id: 'c1', categoria_id: 'k1', categoria_nombre: 'Comida', tipo: 'gasto', monto: 150, fecha: HOY },
      { cuenta_id: 'c2', categoria_nombre: 'Comida', tipo: 'gasto', monto: 300, fecha: HOY },
    ],
    metas: [{ id: 'm1', user_id: dueno, nombre: 'Viaje', monto_objetivo: 1000, monto_actual: 200 }],
    meta_contribuciones: [{ meta_id: 'm1', tipo: 'contribucion', monto: 200, fecha: HOY }],
    presupuestos: [{ categoria_nombre: 'Comida', monto_limite: 2000 }],
  })

  it('restaura cuentas, movimientos y metas con los saldos del respaldo', async () => {
    const ana = await crearUsuario(db)
    const conteo = await rpc(ana, 'importar_respaldo', { p_datos: respaldo('otro-usuario') })
    expect(conteo).toMatchObject({ cuentas: 2, categorias: 1, transacciones: 2, metas: 1, meta_contribuciones: 1, presupuestos: 1 })

    const { rows } = await db.query(
      `select c.nombre, c.saldo::float as saldo, count(t.id)::int as movimientos
         from public.cuentas c left join public.transacciones t on t.cuenta_id = c.id
        where c.user_id = $1 group by c.nombre, c.saldo order by c.nombre`, [ana])
    expect(rows).toEqual([
      { nombre: 'Efectivo', saldo: 850, movimientos: 1 },
      { nombre: 'Visa', saldo: 300, movimientos: 1 },
    ])
  })

  it('no restaura sobre una cuenta que ya tiene movimientos', async () => {
    const ana = await crearUsuario(db)
    const efectivo = await crearCuenta(db, ana, { saldo: 100 })
    await crearTx(ana, efectivo, 'gasto', 10)
    await expect(rpc(ana, 'importar_respaldo', { p_datos: respaldo(ana) })).rejects.toThrow('debe estar vacía')
  })
})

describe('un dispositivo, una sola cuenta', () => {
  const registrarToken = (userId, token) => comoUsuario(db, userId, () => db.query(
    `insert into public.fcm_tokens (user_id, token) values ($1, $2)
     on conflict (user_id, token) do update set plataforma = excluded.plataforma`, [userId, token]))
  const duenosDe = async (token) => (await db.query(
    `select user_id from public.fcm_tokens where token = $1`, [token])).rows.map(f => f.user_id)

  it('al entrar otra cuenta en el mismo teléfono, el token deja de ser de la anterior', async () => {
    const ana = await crearUsuario(db)
    const beto = await crearUsuario(db)
    await registrarToken(ana, 'token-del-fold')
    await registrarToken(beto, 'token-del-fold')
    expect(await duenosDe('token-del-fold')).toEqual([beto])

    // Volver a registrarlo la misma cuenta no duplica ni borra
    await registrarToken(beto, 'token-del-fold')
    expect(await duenosDe('token-del-fold')).toEqual([beto])
  })

  it('no toca los tokens de otros dispositivos', async () => {
    const ana = await crearUsuario(db)
    const beto = await crearUsuario(db)
    await registrarToken(ana, 'token-de-ana')
    await registrarToken(beto, 'token-de-beto')
    expect(await duenosDe('token-de-ana')).toEqual([ana])
  })

  it('igual con la suscripción push del navegador', async () => {
    const ana = await crearUsuario(db)
    const beto = await crearUsuario(db)
    const suscribir = (userId) => comoUsuario(db, userId, () => db.query(
      `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/x', 'k', 'a')`, [userId]))
    await suscribir(ana)
    await suscribir(beto)
    const { rows } = await db.query(`select user_id from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/x'`)
    expect(rows.map(f => f.user_id)).toEqual([beto])
  })
})

describe('compras a meses sin intereses', () => {
  let ana, efectivo, tarjeta
  beforeEach(async () => {
    ana = await crearUsuario(db)
    efectivo = await crearCuenta(db, ana, { saldo: 1000 })
    tarjeta = await crearCuenta(db, ana, { nombre: 'Visa', tipo: 'tarjeta_credito', saldo: 0 })
  })

  let op = 0
  const comprar = (monto, meses, { cuenta = tarjeta, fecha = HOY, opId = `meses-${++op}-${Date.now()}`, usuario = ana } = {}) =>
    rpc(usuario, 'crear_compra_meses_idempotente', {
      p_client_op_id: opId, p_cuenta_id: cuenta, p_categoria_nombre: 'Comida',
      p_monto: monto, p_meses: meses, p_descripcion: ' Pantalla ', p_fecha: fecha,
    })
  const mensualidades = async (compra) => (await db.query(
    `select monto::float8 as monto, to_char(fecha, 'YYYY-MM-DD') as fecha, mensualidad, meses, descripcion
     from public.transacciones where compra_meses_id = $1 order by mensualidad`, [compra]
  )).rows

  it('reparte el total en una mensualidad por mes y sube la deuda completa de una vez', async () => {
    const compra = await comprar(3000, 6)
    const filas = await mensualidades(compra)
    expect(filas.map(f => f.monto)).toEqual([500, 500, 500, 500, 500, 500])
    expect(filas.map(f => f.fecha)).toEqual(['2026-10-26', '2026-11-26', '2026-12-26', '2027-01-26', '2027-02-26', '2027-03-26'])
    expect(filas.map(f => f.mensualidad)).toEqual([1, 2, 3, 4, 5, 6])
    expect(filas.every(f => f.meses === 6 && f.descripcion === 'Pantalla')).toBe(true)
    expect(await saldo(db, tarjeta)).toBe(3000)
  })

  it('los centavos que sobran van en la primera mensualidad y los fines de mes se ajustan', async () => {
    const compra = await comprar(1000, 3, { fecha: '2026-01-31' })
    const filas = await mensualidades(compra)
    expect(filas.map(f => f.monto)).toEqual([333.34, 333.33, 333.33])
    expect(filas.map(f => f.fecha)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('reintentar la misma operación no duplica la compra', async () => {
    const primera = await comprar(1200, 3, { opId: 'meses-reintento-1' })
    const reintento = await comprar(1200, 3, { opId: 'meses-reintento-1' })
    expect(reintento).toBe(primera)
    expect(await mensualidades(primera)).toHaveLength(3)
    expect(await saldo(db, tarjeta)).toBe(1200)
  })

  it('solo acepta tarjetas de crédito propias, de 2 a 48 meses y montos divisibles', async () => {
    const beto = await crearUsuario(db)
    await expect(comprar(600, 3, { cuenta: efectivo })).rejects.toThrow('Solo las compras con tarjeta de crédito')
    await expect(comprar(600, 3, { usuario: beto })).rejects.toThrow('Cuenta no válida')
    await expect(comprar(600, 1)).rejects.toThrow('entre 2 y 48')
    await expect(comprar(600, 49)).rejects.toThrow('entre 2 y 48')
    await expect(comprar(0.05, 6)).rejects.toThrow('muy pequeño')
    await expect(comprar(0, 6)).rejects.toThrow('mayor que cero')
    expect([await saldo(db, efectivo), await saldo(db, tarjeta)]).toEqual([1000, 0])
  })

  it('una mensualidad no se edita ni se borra sola; eliminar la compra quita todo y baja la deuda', async () => {
    const compra = await comprar(900, 3)
    const [{ id }] = (await db.query(`select id from public.transacciones where compra_meses_id = $1 and mensualidad = 2`, [compra])).rows

    await expect(rpc(ana, 'eliminar_transaccion_segura', { p_transaccion_id: id })).rejects.toThrow('elimina la compra completa')
    await expect(rpc(ana, 'editar_transaccion_segura', {
      p_transaccion_id: id, p_cuenta_id: tarjeta, p_categoria_nombre: 'Comida',
      p_tipo: 'gasto', p_monto: 10, p_descripcion: null, p_fecha: HOY,
    })).rejects.toThrow('compra a meses')
    expect(await saldo(db, tarjeta)).toBe(900)

    await rpc(ana, 'eliminar_compra_meses', { p_compra_meses_id: compra })
    expect(await mensualidades(compra)).toEqual([])
    expect(await saldo(db, tarjeta)).toBe(0)
  })

  it('otro usuario no puede eliminar la compra', async () => {
    const beto = await crearUsuario(db)
    const compra = await comprar(900, 3)
    await expect(rpc(beto, 'eliminar_compra_meses', { p_compra_meses_id: compra })).rejects.toThrow('Compra no encontrada')
    expect(await mensualidades(compra)).toHaveLength(3)
    expect(await saldo(db, tarjeta)).toBe(900)
  })

  describe('avisos', () => {
    let hoy
    beforeEach(async () => {
      // Mismo "hoy" que usan los avisos: el de México, no el de UTC
      hoy = (await db.query(`select to_char((now() at time zone 'America/Mexico_City')::date, 'YYYY-MM-DD') as d`)).rows[0].d
      await db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [ana, `https://fcm.googleapis.com/fcm/send/${ana}`])
    })
    const llamadas = async () => (await db.query(`select body from net.llamadas where body->>'user_id' = $1 order by id`, [ana])).rows

    it('el presupuesto de este mes solo cuenta la mensualidad de este mes', async () => {
      await db.query(`insert into public.presupuestos (user_id, categoria_nombre, monto_limite) values ($1, 'Comida', 1000)`, [ana])
      await comprar(2700, 3, { fecha: hoy })
      const avisos = await llamadas()
      expect(avisos).toHaveLength(1)
      expect(avisos[0].body.title).toContain('90%')
    })

    it('el aviso de corte pide el pago del mes y muestra aparte lo que queda a meses', async () => {
      await db.query(`update public.cuentas set fecha_corte = extract(day from $2::date) where id = $1`, [tarjeta, hoy])
      await comprar(3000, 3, { fecha: hoy })
      await db.query(`select public.revisar_notificaciones_tarjetas_credito()`)
      const [aviso] = await llamadas()
      expect(aviso.body.body).toBe('Deuda al corte: $1,000.00 (más $2,000.00 a meses)')
    })

    it('si la tarjeta ya se pagó no queda nada a meses', async () => {
      await db.query(`update public.cuentas set fecha_corte = extract(day from $2::date) where id = $1`, [tarjeta, hoy])
      await comprar(3000, 3, { fecha: hoy })
      await rpc(ana, 'pagar_tarjeta_credito', { p_tarjeta_id: tarjeta, p_cuenta_origen_id: efectivo, p_monto: 2500, p_fecha: hoy, p_descripcion: null })
      await db.query(`select public.revisar_notificaciones_tarjetas_credito()`)
      const [aviso] = await llamadas()
      expect(aviso.body.body).toBe('Deuda al corte: $0.00 (más $500.00 a meses)')
    })
  })
})

describe('premium de por vida por lista de correos', () => {
  // En producción este trigger vive en auth.users (fuera del volcado de public)
  beforeAll(async () => {
    await db.query(`create or replace trigger on_auth_user_created after insert on auth.users
      for each row execute function public.crear_perfil_usuario()`)
  })
  afterAll(() => db.query(`drop trigger if exists on_auth_user_created on auth.users`))
  // Por defecto con el correo ya confirmado, como llega quien entra con Google
  const nuevoUsuario = async (email, { creado = 'now()', confirmado = true } = {}) => {
    const { rows: [{ id }] } = await db.query(
      `insert into auth.users (id, email, email_confirmed_at, created_at) values (gen_random_uuid(), $1, ${confirmado ? 'now()' : 'null'}, ${creado}) returning id`, [email])
    return id
  }
  const fundador = async (id) => (await db.query(`select acceso_fundador from public.perfiles where user_id = $1`, [id])).rows[0]?.acceso_fundador

  it('quien se registra con un correo de la lista (sin importar mayúsculas) entra como fundador', async () => {
    await db.query(`insert into public.correos_fundadores (email) values ('nuevo.tester@gmail.com')`)
    expect(await fundador(await nuevoUsuario('Nuevo.Tester@Gmail.com'))).toBe(true)
    expect(await fundador(await nuevoUsuario('otra.persona@gmail.com'))).toBe(false)
  })

  it('se respeta la fecha de corte de agosto', async () => {
    expect(await fundador(await nuevoUsuario('pionero@gmail.com', { creado: `'2026-08-01'` }))).toBe(true)
  })

  it('con el correo sin confirmar no recibe nada hasta que lo confirma', async () => {
    await db.query(`insert into public.correos_fundadores (email) values ('por.confirmar@gmail.com')`)
    const id = await nuevoUsuario('por.confirmar@gmail.com', { confirmado: false })
    expect(await fundador(id)).toBe(false)
    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [id])
    expect(await fundador(id)).toBe(true)
  })

  it('agregar a la lista un correo sin confirmar no lo activa', async () => {
    const id = await nuevoUsuario('suplantado@gmail.com', { confirmado: false })
    await db.query(`insert into public.correos_fundadores (email) values ('suplantado@gmail.com')`)
    expect(await fundador(id)).toBe(false)
  })

  it('agregar el correo de una cuenta que ya existe la vuelve fundadora al momento', async () => {
    const id = await nuevoUsuario('ya.existia@gmail.com')
    expect(await fundador(id)).toBe(false)
    await db.query(`insert into public.correos_fundadores (email) values ('ya.existia@gmail.com')`)
    expect(await fundador(id)).toBe(true)
  })

  it('un invitado que vincula un correo de la lista lo recibe al vincular', async () => {
    await db.query(`insert into public.correos_fundadores (email) values ('invitado.vincula@gmail.com')`)
    const id = await nuevoUsuario(null, { confirmado: false })
    expect(await fundador(id)).toBe(false)
    await db.query(`update auth.users set email = 'invitado.vincula@gmail.com', email_confirmed_at = now() where id = $1`, [id])
    expect(await fundador(id)).toBe(true)
  })

  it('desde la app nadie puede ver ni tocar la lista', async () => {
    const ana = await nuevoUsuario('curioso@gmail.com')
    for (const sql of [
      `select * from public.correos_fundadores`,
      `insert into public.correos_fundadores (email) values ('yo@gmail.com')`,
      `select public.es_correo_fundador('tester.lista@gmail.com')`,
    ]) {
      await expect(comoUsuario(db, ana, () => db.query(sql))).rejects.toThrow('permission denied')
      await expect(comoAnonimo(db, () => db.query(sql))).rejects.toThrow('permission denied')
    }
  })
})
