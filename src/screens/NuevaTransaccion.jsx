import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import {
  asegurarCuentasPorDefecto,
  asegurarCategoriasPorDefecto,
  crearTransaccion,
  editarTransaccion,
  obtenerCuentas,
  obtenerCategorias,
  obtenerPresupuestos,
  obtenerTransaccionesPorMes
} from '../lib/db.js'
import InfoTooltip from '../components/InfoTooltip.jsx'
import Monto from '../components/Monto.jsx'
import AlertaPresupuesto from '../components/AlertaPresupuesto.jsx'
import { logError } from '../lib/logger.js'
import { mensajeAmigable } from '../lib/errores.js'
import { encolarOperacion, conRespaldoOffline, obtenerConectividad, marcarConectividad, pareceErrorDeRed } from '../lib/offline.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import CategoriaIcono from '../components/CategoriaIcono.jsx'

const hoy = () => {
  const fecha = new Date()

  const año = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")

  return `${año}-${mes}-${dia}`
}

// Filtra el texto del input de monto: solo dígitos y un único punto decimal.
// Bloquea letras y símbolos aunque el usuario los pegue o use teclado físico
// (inputMode="decimal" en el <input> solo cambia el teclado en móvil, no valida).
const limpiarMonto = (valor) => {
  let limpio = valor.replace(',', '.').replace(/[^0-9.]/g, '')
  const partes = limpio.split('.')
  if (partes.length > 2) limpio = partes[0] + '.' + partes.slice(1).join('')
  return limpio
}
export default function NuevaTransaccion({ onBack, onGuardada, transaccionEditar = null, tipoInicial = 'gasto' }) {
  const editando = Boolean(transaccionEditar)
  // Al crear una nueva (no editando), respeta el tipo que venga preseleccionado
  // — por ejemplo desde los botones rápidos "− Gasto" / "+ Ingreso" del widget
  // de Android, que abren la app directo con el tipo correcto ya elegido.
  const [tipo, setTipo] = useState(transaccionEditar?.tipo || tipoInicial)
  const [cuentas, setCuentas] = useState([])
  const [cuentaId, setCuentaId] = useState(transaccionEditar?.cuenta_id || null)
  const [monto, setMonto] = useState(transaccionEditar ? String(transaccionEditar.monto) : '')
  const [categoria, setCategoria] = useState(transaccionEditar?.categoria_nombre || null)
  const [descripcion, setDescripcion] = useState(transaccionEditar?.descripcion || '')
  const [fecha, setFecha] = useState(transaccionEditar?.fecha || hoy())
  const [userId, setUserId] = useState(null)
  const [categoriasGasto, setCategoriasGasto] = useState([])
  const [categoriasIngreso, setCategoriasIngreso] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [alertaPresupuesto, setAlertaPresupuesto] = useState(null) // { categoria, gastado, limite } | null
  const { t } = usePreferencias()

  useEffect(() => {
    const cargarCuentas = async () => {
      setError(null)
      try {
        const { data, error: authError } = await supabase.auth.getSession()
        if (authError) throw authError
        const usuario = data.session?.user
        if (!usuario) throw new Error('No encontramos una sesión activa.')

        setUserId(usuario.id)

        // El sembrado de cuentas/categorías por defecto solo se checa con red —
        // si ya las tenías (caso normal), esto no hace falta para poder capturar offline.
        if (navigator.onLine) {
          await asegurarCuentasPorDefecto(usuario.id)
          await asegurarCategoriasPorDefecto(usuario.id)
        }

        const [lista, todasCategorias] = await Promise.all([
          conRespaldoOffline(`cuentas:${usuario.id}`, () => obtenerCuentas(usuario.id)),
          conRespaldoOffline(`categorias:${usuario.id}`, () => obtenerCategorias(usuario.id))
        ])
        setCuentas(lista)
        setCategoriasGasto(todasCategorias.filter(c => c.tipo === 'gasto'))
        setCategoriasIngreso(todasCategorias.filter(c => c.tipo === 'ingreso'))

        if (!cuentaId && lista.length > 0) setCuentaId(lista[0].id)
        if (lista.length === 0) throw new Error('No se pudieron cargar las cuentas Efectivo y Tarjeta.')
      } catch (err) {
        logError('Error cargando cuentas', err)
        setError(pareceErrorDeRed(err) ? 'No se pudo conectar. Revisa tu conexión e intenta de nuevo.' : mensajeAmigable(err, 'No se pudieron cargar tus cuentas.'))
      }
    }
    cargarCuentas()
  }, [])

  const categorias = tipo === 'gasto' ? categoriasGasto : categoriasIngreso
  // Una tarjeta de crédito no puede recibir ingresos directos (para eso está
  // "Pagar tarjeta" en Administrar Cuentas) — se oculta como opción aquí.
  const cuentasDisponibles = tipo === 'ingreso' ? cuentas.filter(c => c.tipo !== 'tarjeta_credito') : cuentas
  const cuentaSeleccionada = cuentas.find(c => c.id === cuentaId)
  const montoNumerico = Number(monto)
  const valido = Number.isFinite(montoNumerico) && montoNumerico > 0 && Boolean(categoria) && Boolean(cuentaId) && Boolean(userId) && Boolean(cuentaSeleccionada) && Boolean(fecha)

  const etiquetaBoton = useMemo(() => {
    if (guardando) return editando ? t('nt_guardando_cambios') : t('nt_guardando')
    if (!valido) return t('nt_completa_datos')
    return editando ? t('nt_boton_actualizar') : t('nt_boton_guardar')
  }, [editando, guardando, valido, t])

  // Solo se llama tras guardar un GASTO nuevo (no ediciones, no ingresos).
  // Si esa categoría tiene presupuesto y ya se excedió, guarda los datos en
  // el estado para mostrar la alerta — si falla por lo que sea, no bloquea
  // el guardado real, que ya se completó exitosamente antes de esto.
  const verificarPresupuesto = async (uid, categoriaNombre) => {
    try {
      const [presupuestos, txMes] = await Promise.all([
        obtenerPresupuestos(uid),
        obtenerTransaccionesPorMes(uid)
      ])
      const presupuesto = presupuestos.find(p => p.categoria_nombre === categoriaNombre)
      if (!presupuesto) return false

      const gastado = txMes
        .filter(t => t.tipo === 'gasto' && t.categoria_nombre === categoriaNombre)
        .reduce((s, t) => s + Number(t.monto), 0)

      if (gastado > Number(presupuesto.monto_limite)) {
        setAlertaPresupuesto({ categoria: categoriaNombre, gastado, limite: Number(presupuesto.monto_limite) })
        return true
      }
      return false
    } catch (err) {
      logError('No se pudo verificar el presupuesto tras guardar', err)
      return false
    }
  }

  const cerrarAlertaYContinuar = () => {
    setAlertaPresupuesto(null)
    onGuardada?.()
  }

  const handleGuardar = async () => {
    if (!valido || guardando) return
    setGuardando(true)
    setError(null)

    const comunes = {
      cuentaId,
      categoriaNombre: categoria,
      tipo,
      monto: montoNumerico,
      descripcion: descripcion.trim() || null,
      fecha
    }

    // Sin conexión: solo se pueden encolar transacciones NUEVAS. Editar una
    // ya existente requiere conocer el saldo actual en el servidor para
    // revertir el movimiento anterior correctamente, así que eso sí requiere red.
    const intentarEncolar = async () => {
      try {
        await encolarOperacion({
          accion: 'crearTransaccion',
          datos: { userId, cuentaSaldoActual: Number(cuentaSeleccionada.saldo), ...comunes }
        })
        onGuardada?.()
      } catch (err) {
        logError('Error encolando transacción offline', err)
        setError('No se pudo guardar localmente. Intenta de nuevo.')
        setGuardando(false)
      }
    }

    if (!obtenerConectividad()) {
      if (editando) {
        setError('No puedes editar movimientos sin conexión. Intenta cuando vuelva el internet.')
        setGuardando(false)
        return
      }
      await intentarEncolar()
      return
    }

    try {
      if (editando) {
        await editarTransaccion({ transaccionId: transaccionEditar.id, ...comunes })
        marcarConectividad(true)
        onGuardada?.()
      } else {
        await crearTransaccion({
          userId,
          cuentaSaldoActual: Number(cuentaSeleccionada.saldo),
          ...comunes
        })
        marcarConectividad(true)
        // Solo revisamos el presupuesto en gastos nuevos — si se excedió,
        // verificarPresupuesto ya deja lista la alerta y AlertaPresupuesto
        // se encarga de llamar a onGuardada() cuando el usuario la cierre.
        const seExcedio = tipo === 'gasto' && await verificarPresupuesto(userId, categoria)
        if (!seExcedio) onGuardada?.()
      }
    } catch (err) {
      // Si la red realmente falló (aunque navigator.onLine no lo supiera aún,
      // como pasa con la simulación de las DevTools), la tratamos como offline
      // y encolamos en vez de mostrar un error duro — pero solo para transacciones nuevas.
      if (!editando && pareceErrorDeRed(err)) {
        marcarConectividad(false)
        await intentarEncolar()
        return
      }
      logError('Error guardando transacción', err)
      setError(mensajeAmigable(err, 'No se pudo guardar. Intenta de nuevo.'))
      setGuardando(false)
    }
  }

  return (
    <div style={{ padding: '16px 16px 40px', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} aria-label="Volver" style={{ background: 'transparent', color: 'var(--text-primary)', fontSize: 20 }}>←</button>
        <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{editando ? t('nt_titulo_editar') : t('nt_titulo_nueva')}</h1>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {['gasto', 'ingreso'].map(opcion => (
          <button key={opcion} onClick={() => {
            setTipo(opcion)
            setCategoria(null)
            if (opcion === 'ingreso' && cuentaSeleccionada?.tipo === 'tarjeta_credito') setCuentaId(null)
          }} style={{
            flex: 1, padding: 14, borderRadius: 'var(--radius-md)',
            background: tipo === opcion ? 'var(--gradient-brand)' : 'var(--bg-surface)',
            color: tipo === opcion ? '#fff' : 'var(--text-secondary)', fontWeight: 600, fontSize: 14,
            border: '1px solid ' + (tipo === opcion ? 'transparent' : 'var(--border-subtle)')
          }}>
            {opcion === 'gasto' ? `⊖ ${t('nt_gasto')}` : `⊕ ${t('nt_ingreso')}`}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{t('nt_cuenta')}</label>
        <InfoTooltip title={t('nt_cuenta')} text={t('nt_cuenta_info')} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {cuentasDisponibles.length === 0 && <div className="empty-inline">{t('nt_cargando_cuentas')}</div>}
        {cuentasDisponibles.map(c => (
          <button key={c.id} onClick={() => setCuentaId(c.id)} style={{
            flex: '1 1 45%', padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)',
            border: '1.5px solid ' + (cuentaId === c.id ? 'var(--accent-blue)' : 'var(--border-subtle)'), textAlign: 'left'
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.tipo === 'tarjeta_credito' || c.tipo === 'tarjeta' ? '💳' : '💵'} {c.nombre}</div>
            {c.tipo === 'tarjeta_credito' ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('cu_disponible')}: <Monto valor={Number(c.limite_credito || 0) - Number(c.saldo || 0)} /></div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--success)' }}><Monto valor={c.saldo} /></div>
            )}
          </button>
        ))}
      </div>

      <label className="field-label">{t('nt_monto')}</label>
      <div className="input-shell">
        <span style={{ color: 'var(--text-muted)' }}>$</span>
        <input inputMode="decimal" value={monto} onChange={e => setMonto(limpiarMonto(e.target.value))} placeholder="0.00" />
      </div>

      <label className="field-label">{t('nt_categoria')}</label>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0 20px', paddingBottom: 4 }}>
        {categorias.map(cat => {
          const activa = categoria === cat.nombre
          return (
            <button key={cat.nombre} onClick={() => setCategoria(cat.nombre)} style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 999,
              background: activa ? 'var(--gradient-brand)' : 'var(--bg-surface)',
              color: activa ? '#fff' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
              border: '1px solid ' + (activa ? 'transparent' : 'var(--border-subtle)'),
              display: 'flex', alignItems: 'center', gap: 6
            }}>
              <CategoriaIcono icono={cat.icono || 'Tag'} size={14} color={activa ? '#fff' : 'var(--text-muted)'} />
              {cat.nombre}
            </button>
          )
        })}
      </div>

      <label className="field-label">{t('nt_descripcion').split(' (')[0]} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{t('nt_opcional')}</span></label>
      <div className="input-shell" style={{ marginTop: 8 }}>
        <input value={descripcion} onChange={e => setDescripcion(e.target.value)} maxLength={120} placeholder={t('nt_descripcion_placeholder')} />
      </div>

      <label className="field-label">{t('nt_fecha')}</label>
      <div className="input-shell" style={{ marginTop: 8 }}>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
      </div>

      {error && <p className="error-message">{error}</p>}

      <button disabled={!valido || guardando} onClick={handleGuardar} className="primary-button" style={{
        background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
        color: valido ? '#fff' : 'var(--text-muted)'
      }}>{etiquetaBoton}</button>

      {alertaPresupuesto && (
        <AlertaPresupuesto
          categoria={alertaPresupuesto.categoria}
          gastado={alertaPresupuesto.gastado}
          limite={alertaPresupuesto.limite}
          onCerrar={cerrarAlertaYContinuar}
        />
      )}
    </div>
  )
}