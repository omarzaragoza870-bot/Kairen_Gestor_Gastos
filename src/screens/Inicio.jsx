import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerTransaccionesPorMes, obtenerTransaccionesEnRango } from '../lib/db.js'
import InfoTooltip from '../components/InfoTooltip.jsx'
import SelectorPeriodo, { MESES } from '../components/SelectorPeriodo.jsx'
import Monto from '../components/Monto.jsx'

const fmt = n => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtFecha = fechaISO => new Date(`${fechaISO}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtFechaCorta = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

export default function Inicio({ onNuevo, onEditar, onVerTodas, refreshKey }) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [transacciones, setTransacciones] = useState([])
  const hoy = new Date()
  const [periodo, setPeriodo] = useState({ tipo: 'mes', anio: hoy.getFullYear(), mes: hoy.getMonth() })
  const [mostrarSelector, setMostrarSelector] = useState(false)

  const cargarDatos = useCallback(async uid => {
    setCargando(true)
    setError(null)
    try {
      if (periodo.tipo === 'mes') {
        setTransacciones(await obtenerTransaccionesPorMes(uid, new Date(periodo.anio, periodo.mes, 1)))
      } else {
        // "hasta" es exclusivo en la consulta, así que se le suma un día para incluir el día final
        const hastaExclusivo = new Date(`${periodo.hasta}T00:00:00`)
        hastaExclusivo.setDate(hastaExclusivo.getDate() + 1)
        setTransacciones(await obtenerTransaccionesEnRango(uid, periodo.desde, hastaExclusivo.toISOString().slice(0, 10)))
      }
    } catch (err) {
      console.error('[Kairen Finanzas] Error cargando inicio:', err)
      setError('No se pudieron cargar los movimientos.')
    } finally {
      setCargando(false)
    }
  }, [periodo])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => data.user && cargarDatos(data.user.id))
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
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Dinero Disponible</span>
          <InfoTooltip title="Dinero Disponible" text="Ingresos menos gastos del período seleccionado. No incluye el ahorro externo." />
        </div>
        <div className="available-amount">{cargando ? '…' : <Monto valor={disponible} />}</div>
        <div className="summary-grid">
          <div><span className="income-label">↑ Ingresos</span><div>{cargando ? '…' : <Monto valor={ingresos} prefijo="+" />}</div></div>
          <div><span className="expense-label">↓ Gastos</span><div>{cargando ? '…' : <Monto valor={gastos} prefijo="-" />}</div></div>
        </div>
      </section>

      <div className="section-heading">
        <h2>Transacciones</h2>
        {transacciones.length > 0 && <button onClick={onVerTodas} className="link-button">Ver todas</button>}
      </div>

      {error && <p className="error-message">{error}</p>}
      {!cargando && !error && transacciones.length === 0 && (
        <div className="empty-state"><div style={{ fontSize: 32, marginBottom: 8 }}>📭</div><p>No hay transacciones en este período.</p><small>Toca el botón + para registrar la primera.</small></div>
      )}

      {visibles.map(tx => (
        <button key={tx.id} onClick={() => onEditar(tx)} className="transaction-row">
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div className="transaction-category">{tx.categoria_nombre}</div>
            {tx.descripcion && <div className="transaction-description">{tx.descripcion}</div>}
            <div className="transaction-date">{fmtFecha(tx.fecha)}</div>
          </div>
          <div className={tx.tipo === 'gasto' ? 'amount expense' : 'amount income'}>{tx.tipo === 'gasto' ? '-' : '+'}{fmt(tx.monto)}</div>
        </button>
      ))}

      <button onClick={onNuevo} aria-label="Nueva operación" className="floating-button">+</button>

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