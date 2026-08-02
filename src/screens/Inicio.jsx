import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerTransaccionesPorMes, obtenerTransaccionesEnRango, obtenerCategorias } from '../lib/db.js'
import InfoTooltip from '../components/InfoTooltip.jsx'
import SelectorPeriodo from '../components/SelectorPeriodo.jsx'
import { MESES_POR_IDIOMA } from '../i18n/translations.js'
import Monto from '../components/Monto.jsx'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import AdministrarCuentas from './AdministrarCuentas.jsx'
import { logError, logWarn } from '../lib/logger.js'
import { conRespaldoOffline } from '../lib/offline.js'
import NuevaOperacion from '../components/NuevaOperacion.jsx'

const fmt = n => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtFecha = fechaISO => new Date(`${fechaISO}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtFechaCorta = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

export default function Inicio({ onNuevo, onNuevaTransferencia, onEditar, onVerTodas, refreshKey }) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [transacciones, setTransacciones] = useState([])
  const [userId, setUserId] = useState(null)
  const [mostrarCuentas, setMostrarCuentas] = useState(false)
  const [mostrarOpciones, setMostrarOpciones] = useState(false)
  const [iconosPorCategoria, setIconosPorCategoria] = useState({})
  const hoy = new Date()
  const [periodo, setPeriodo] = useState({ tipo: 'mes', anio: hoy.getFullYear(), mes: hoy.getMonth() })
  const [mostrarSelector, setMostrarSelector] = useState(false)
  const { t, idioma } = usePreferencias()
  const MESES = MESES_POR_IDIOMA[idioma] || MESES_POR_IDIOMA.es

  const cargarDatos = useCallback(async uid => {
    setCargando(true)
    setError(null)
    try {
      if (periodo.tipo === 'mes') {
        const clave = `inicio:${uid}:${periodo.anio}-${periodo.mes}`
        const datos = await conRespaldoOffline(clave, () => obtenerTransaccionesPorMes(uid, new Date(periodo.anio, periodo.mes, 1)))
        setTransacciones(datos)
      } else {
        // "hasta" es exclusivo en la consulta, así que se le suma un día para incluir el día final
        const hastaExclusivo = new Date(`${periodo.hasta}T00:00:00`)
        hastaExclusivo.setDate(hastaExclusivo.getDate() + 1)
        const hastaStr = hastaExclusivo.toISOString().slice(0, 10)
        const clave = `inicio:${uid}:${periodo.desde}_${hastaStr}`
        const datos = await conRespaldoOffline(clave, () => obtenerTransaccionesEnRango(uid, periodo.desde, hastaStr))
        setTransacciones(datos)
      }
    } catch (err) {
      logError('Error cargando inicio', err)
      setError('No se pudieron cargar los movimientos.')
    } finally {
      setCargando(false)
    }
  }, [periodo])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id)
        cargarDatos(data.user.id)
        obtenerCategorias(data.user.id).then(cats => {
          const mapa = {}
          cats.forEach(c => { mapa[`${c.tipo}:${c.nombre}`] = c.icono || '🏷️' })
          setIconosPorCategoria(mapa)
        }).catch(err => logWarn('No se pudieron cargar los íconos de categoría', err))
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
  const disponible = ingresos - gastos
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
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
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
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('inicio_dinero_disponible')}</span>
          <InfoTooltip title={t('inicio_dinero_disponible')} text={t('inicio_dinero_disponible_info')} />
        </div>
        <div className="available-amount">{cargando ? '…' : <Monto valor={disponible} />}</div>
        <div className="summary-grid">
          <div><span className="income-label">↑ {t('inicio_ingresos')}</span><div>{cargando ? '…' : <Monto valor={ingresos} prefijo="+" />}</div></div>
          <div><span className="expense-label">↓ {t('inicio_gastos')}</span><div>{cargando ? '…' : <Monto valor={gastos} prefijo="-" />}</div></div>
        </div>
        <button
          onClick={() => setMostrarCuentas(true)}
          style={{
            width: '100%', background: 'transparent', color: 'var(--text-secondary)',
            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 0 0', marginTop: 8, borderTop: '1px solid var(--border-subtle)'
          }}
        >
          <span>📇 {t('inicio_administrar_cuentas')}</span>
          <span>›</span>
        </button>
      </section>

      <div className="section-heading">
        <h2>{t('inicio_transacciones')}</h2>
        {transacciones.length > 0 && <button onClick={onVerTodas} className="link-button">{t('inicio_ver_todas')}</button>}
      </div>

      {error && <p className="error-message">{error}</p>}
      {!cargando && !error && transacciones.length === 0 && (
        <div className="empty-state"><div style={{ fontSize: 32, marginBottom: 8 }}>📭</div><p>{t('inicio_vacio_titulo')}</p><small>{t('inicio_vacio_subtitulo')}</small></div>
      )}

      {visibles.map(tx => (
        <button key={tx.id} onClick={() => onEditar(tx)} className="transaction-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, textAlign: 'left' }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{iconosPorCategoria[`${tx.tipo}:${tx.categoria_nombre}`] || '🏷️'}</span>
            <div style={{ minWidth: 0 }}>
              <div className="transaction-category">{tx.categoria_nombre}</div>
              {tx.descripcion && <div className="transaction-description">{tx.descripcion}</div>}
              <div className="transaction-date">{fmtFecha(tx.fecha)}</div>
            </div>
          </div>
          <div className={tx.tipo === 'gasto' ? 'amount expense' : 'amount income'}><Monto valor={tx.monto} prefijo={tx.tipo === 'gasto' ? '-' : '+'} /></div>
        </button>
      ))}

      <button onClick={() => setMostrarOpciones(true)} aria-label="Nueva operación" className="floating-button">+</button>

      {mostrarOpciones && (
        <NuevaOperacion
          onCerrar={() => setMostrarOpciones(false)}
          onTransaccion={() => { setMostrarOpciones(false); onNuevo() }}
          onTransferencia={() => { setMostrarOpciones(false); onNuevaTransferencia() }}
        />
      )}

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