import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerTransaccionesPorMes, obtenerTransaccionesEnRango, obtenerTransaccionesAcumuladasHasta, obtenerCategorias, obtenerCuentas, eliminarTransaccion } from '../lib/db.js'
import InfoTooltip from '../components/InfoTooltip.jsx'
import SelectorPeriodo from '../components/SelectorPeriodo.jsx'
import { MESES_POR_IDIOMA } from '../i18n/translations.js'
import Monto from '../components/Monto.jsx'
import { actualizarWidget } from '../lib/widget.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import AdministrarCuentas from './AdministrarCuentas.jsx'
import { logError, logWarn } from '../lib/logger.js'
import { conRespaldoOffline } from '../lib/offline.js'
import { mensajeAmigable } from '../lib/errores.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { ArrowUpRight, ArrowDownRight, Landmark } from 'lucide-react'
import CategoriaIcono from '../components/CategoriaIcono.jsx'

const fmt = n => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtFecha = fechaISO => new Date(`${fechaISO}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtFechaCorta = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
const fmtFechaLarga = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })

export default function Inicio({ onNuevo, onEditar, onVerTodas, refreshKey }) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [transacciones, setTransacciones] = useState([])
  const [userId, setUserId] = useState(null)
  const [mostrarCuentas, setMostrarCuentas] = useState(false)
  const [iconosPorCategoria, setIconosPorCategoria] = useState({})
  const [cuentas, setCuentas] = useState([])
  const [acumuladas, setAcumuladas] = useState([])
  const [verDetalle, setVerDetalle] = useState(null)
  const [aEliminar, setAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  useScrollLock(Boolean(verDetalle) || Boolean(aEliminar))
  const hoy = new Date()
  const [periodo, setPeriodo] = useState({ tipo: 'mes', anio: hoy.getFullYear(), mes: hoy.getMonth() })
  const [mostrarSelector, setMostrarSelector] = useState(false)
  const { t, idioma, moneda } = usePreferencias()
  const MESES = MESES_POR_IDIOMA[idioma] || MESES_POR_IDIOMA.es

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (aEliminar && !eliminando) { setAEliminar(null); return }
      if (verDetalle) { setVerDetalle(null); return }
      if (mostrarSelector) { setMostrarSelector(false); return }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [verDetalle, aEliminar, eliminando, mostrarSelector])

  const cargarDatos = useCallback(async uid => {
    setCargando(true)
    setError(null)
    try {
      let hastaStr
      if (periodo.tipo === 'mes') {
        const clave = `inicio:${uid}:${periodo.anio}-${periodo.mes}`
        const datos = await conRespaldoOffline(clave, () => obtenerTransaccionesPorMes(uid, new Date(periodo.anio, periodo.mes, 1)))
        setTransacciones(datos)
        // Boundary exclusivo = primer día del mes siguiente al que se está viendo
        hastaStr = new Date(periodo.anio, periodo.mes + 1, 1).toISOString().slice(0, 10)
      } else {
        // "hasta" es exclusivo en la consulta, así que se le suma un día para incluir el día final
        const hastaExclusivo = new Date(`${periodo.hasta}T00:00:00`)
        hastaExclusivo.setDate(hastaExclusivo.getDate() + 1)
        hastaStr = hastaExclusivo.toISOString().slice(0, 10)
        const clave = `inicio:${uid}:${periodo.desde}_${hastaStr}`
        const datos = await conRespaldoOffline(clave, () => obtenerTransaccionesEnRango(uid, periodo.desde, hastaStr))
        setTransacciones(datos)
      }

      // "Dinero Disponible" es acumulado desde siempre hasta el fin del período
      // que estás viendo — así lo que te sobró en meses anteriores no se
      // resetea a $0. Ingresos/Gastos de abajo sí se quedan solo del período.
      const claveAcumulado = `inicio-acumulado:${uid}:${hastaStr}`
      const datosAcumulados = await conRespaldoOffline(claveAcumulado, () => obtenerTransaccionesAcumuladasHasta(uid, hastaStr))
      setAcumuladas(datosAcumulados)
    } catch (err) {
      logError('Error cargando inicio', err)
      setError('No se pudieron cargar los movimientos.')
    } finally {
      setCargando(false)
    }
  }, [periodo])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const usuario = data.session?.user
      if (usuario) {
        setUserId(usuario.id)
        cargarDatos(usuario.id)
        conRespaldoOffline(`categorias-inicio:${usuario.id}`, () => obtenerCategorias(usuario.id)).then(cats => {
          const mapa = {}
          cats.forEach(c => { mapa[`${c.tipo}:${c.nombre}`] = c.icono || '🏷️' })
          setIconosPorCategoria(mapa)
        }).catch(err => logWarn('No se pudieron cargar los íconos de categoría', err))
        // Misma clave de caché que usa el precargado de App.jsx — reutiliza offline
        conRespaldoOffline(`cuentas:${usuario.id}`, () => obtenerCuentas(usuario.id))
          .then(setCuentas)
          .catch(err => logWarn('No se pudieron cargar las cuentas', err))
      }
    })
  }, [cargarDatos, refreshKey])

  const moverMes = cantidad => setPeriodo(p => {
    if (p.tipo !== 'mes') {
      const base = new Date(hoy.getFullYear(), hoy.getMonth() + cantidad, 1)
      return { tipo: 'mes', anio: base.getFullYear(), mes: base.getMonth() }
    }
    const base = new Date(p.anio, p.mes + cantidad, 1)
    return { tipo: 'mes', anio: base.getFullYear(), mes: base.getMonth() }
  })

  const irAHoy = () => setPeriodo({ tipo: 'mes', anio: hoy.getFullYear(), mes: hoy.getMonth() })

  const ingresos = transacciones.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0)
  const gastos = transacciones.filter(t => t.tipo === 'gasto').reduce((s, t) => s + Number(t.monto), 0)
  const ingresosAcumulados = acumuladas.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0)
  const gastosAcumulados = acumuladas.filter(t => t.tipo === 'gasto').reduce((s, t) => s + Number(t.monto), 0)
  const disponible = ingresosAcumulados - gastosAcumulados

  const cuentaDe = (tx) => cuentas.find(c => c.id === tx.cuenta_id)?.nombre || '—'

  const confirmarEliminar = async () => {
    if (!aEliminar || eliminando) return
    setEliminando(true)
    setError(null)
    try {
      await eliminarTransaccion(aEliminar.id)
      setAEliminar(null)
      if (userId) await cargarDatos(userId)
    } catch (err) {
      setError(mensajeAmigable(err, 'No se pudo eliminar el movimiento.'))
    } finally {
      setEliminando(false)
    }
  }

  useEffect(() => {
    if (cargando) return
    // Actualiza el widget de Android con los montos ya calculados
    actualizarWidget({
      disponible: Number(disponible).toLocaleString('es-MX', { style: 'currency', currency: moneda }),
      ingresos: Number(ingresos).toLocaleString('es-MX', { style: 'currency', currency: moneda }),
      gastos: Number(gastos).toLocaleString('es-MX', { style: 'currency', currency: moneda })
    })
  }, [disponible, ingresos, gastos, cargando, moneda])
  const visibles = transacciones.slice(0, 6)

  const etiquetaPeriodo = periodo.tipo === 'mes'
    ? `${MESES[periodo.mes]} ${periodo.anio}`
    : `${fmtFechaCorta(periodo.desde)} – ${fmtFechaCorta(periodo.hasta)}`

  if (mostrarCuentas && userId) {
    return (
      <AdministrarCuentas
        userId={userId}
        onBack={() => setMostrarCuentas(false)}
        onCambio={() => cargarDatos(userId)}
      />
    )
  }

  return (
    <div style={{ padding: '16px 16px 160px', maxWidth: 680, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={irAHoy} className="month-title" style={{ flex: 1, textAlign: 'left' }}>
          <span>{etiquetaPeriodo}</span>
        </button>
        {periodo.tipo === 'mes' && (
          <>
            <button onClick={() => moverMes(-1)} aria-label="Período anterior" className="icon-button">‹</button>
            <button onClick={() => moverMes(1)} aria-label="Período siguiente" className="icon-button">›</button>
          </>
        )}
        <button onClick={() => setMostrarSelector(true)} aria-label="Seleccionar período" className="icon-button">📅</button>
      </header>

      <section className="summary-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{t('inicio_dinero_disponible')}</span>
          <InfoTooltip title={t('inicio_dinero_disponible')} text={t('inicio_dinero_disponible_info')} />
        </div>
        <div className="available-amount">{cargando ? '…' : <Monto valor={disponible} />}</div>
      </section>

      <div className="summary-grid">
        <div>
          <div className="chip-icon chip-icon-income"><ArrowUpRight size={16} color="#fff" strokeWidth={2.5} /></div>
          <span className="income-label">{t('inicio_ingresos')}</span>
          <div>{cargando ? '…' : <Monto valor={ingresos} prefijo="+" />}</div>
        </div>
        <div>
          <div className="chip-icon chip-icon-expense"><ArrowDownRight size={16} color="#fff" strokeWidth={2.5} /></div>
          <span className="expense-label">{t('inicio_gastos')}</span>
          <div>{cargando ? '…' : <Monto valor={gastos} prefijo="-" />}</div>
        </div>
      </div>

      <button
        onClick={() => setMostrarCuentas(true)}
        style={{
          width: '100%', background: 'var(--bg-surface)', color: 'var(--text-secondary)',
          fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', marginTop: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Landmark size={16} strokeWidth={2} />
          {t('inicio_administrar_cuentas')}
        </span>
        <span>›</span>
      </button>

      <div className="section-heading">
        <h2>{t('inicio_transacciones')}</h2>
        {transacciones.length > 0 && <button onClick={onVerTodas} className="link-button">{t('inicio_ver_todas')}</button>}
      </div>

      {error && <p className="error-message">{error}</p>}
      {!cargando && !error && transacciones.length === 0 && (
        <div className="empty-state"><div style={{ fontSize: 32, marginBottom: 8 }}>📭</div><p>{t('inicio_vacio_titulo')}</p><small>{t('inicio_vacio_subtitulo')}</small></div>
      )}

      {visibles.map(tx => (
        <button key={tx.id} onClick={() => setVerDetalle(tx)} className="transaction-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, textAlign: 'left' }}>
            <span style={{ flexShrink: 0, display:'flex', alignItems:'center' }}><CategoriaIcono icono={iconosPorCategoria[`${tx.tipo}:${tx.categoria_nombre}`] || 'Tag'} size={20} color='var(--text-secondary)' /></span>
            <div style={{ minWidth: 0 }}>
              <div className="transaction-category">{tx.categoria_nombre}</div>
              {tx.descripcion && <div className="transaction-description">{tx.descripcion}</div>}
              <div className="transaction-date">{fmtFecha(tx.fecha)}</div>
            </div>
          </div>
          <div className={tx.tipo === 'gasto' ? 'amount expense' : 'amount income'}><Monto valor={tx.monto} prefijo={tx.tipo === 'gasto' ? '-' : '+'} /></div>
        </button>
      ))}

      {/* Cuadro de detalle al tocar una transacción reciente — mismo patrón que en Transacciones */}
      {verDetalle && (
        <div className="modal-backdrop" onClick={() => setVerDetalle(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 8, display:'flex', justifyContent:'center' }}>
              <CategoriaIcono icono={iconosPorCategoria[`${verDetalle.tipo}:${verDetalle.categoria_nombre}`] || 'Tag'} size={44} color='var(--accent-blue)' />
            </div>
            <h3 style={{ margin: '0 0 4px' }}>{verDetalle.categoria_nombre}</h3>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 2px', fontSize: 13, fontWeight: 600 }}>{cuentaDe(verDetalle)}</p>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 16px', fontSize: 12 }}>{fmtFechaLarga(verDetalle.fecha)}</p>
            {verDetalle.descripcion && (
              <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)' }}>{verDetalle.descripcion}</p>
            )}
            <div
              className={verDetalle.tipo === 'gasto' ? 'amount expense' : 'amount income'}
              style={{ fontSize: 30, fontWeight: 700, marginBottom: 24 }}
            >
              <Monto valor={verDetalle.monto} prefijo={verDetalle.tipo === 'gasto' ? '-' : '+'} />
            </div>

            <div className="modal-actions">
              <button onClick={() => setVerDetalle(null)}>{t('comun_cancelar')}</button>
              <button onClick={() => { onEditar(verDetalle); setVerDetalle(null) }}>✏️ {t('comun_editar')}</button>
            </div>
            <button
              className="danger-link"
              style={{ marginTop: 14, width: '100%', textAlign: 'center' }}
              onClick={() => { setAEliminar(verDetalle); setVerDetalle(null) }}
            >
              🗑️ {t('comun_eliminar')}
            </button>
          </div>
        </div>
      )}

      {aEliminar && (
        <div className="modal-backdrop" onClick={() => !eliminando && setAEliminar(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>{t('tx_eliminar_confirmar_titulo')}</h3>
            <p>{t('tx_eliminar_confirmar_1')} "{aEliminar.categoria_nombre}" {t('tx_eliminar_confirmar_2')} <Monto valor={aEliminar.monto} /> {t('tx_eliminar_confirmar_3')}</p>
            <div className="modal-actions">
              <button onClick={() => setAEliminar(null)} disabled={eliminando}>{t('comun_cancelar')}</button>
              <button className="danger-button" onClick={confirmarEliminar} disabled={eliminando}>{eliminando ? t('comun_eliminando') : t('comun_si_eliminar')}</button>
            </div>
          </div>
        </div>
      )}

        <button onClick={onNuevo} aria-label="Nueva transacción" className="floating-button">+</button>

      {mostrarSelector && (
        <SelectorPeriodo
          periodoActual={periodo}
          onCerrar={() => setMostrarSelector(false)}
          onAplicar={(nuevo) => { setPeriodo(nuevo); setMostrarSelector(false) }}
        />
      )}
    </div>
  )
}