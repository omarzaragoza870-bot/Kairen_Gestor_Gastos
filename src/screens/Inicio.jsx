import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerTransaccionesPorMes } from '../lib/db.js'
import InfoTooltip from '../components/InfoTooltip.jsx'

const fmt = n => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const nombreMes = fecha => fecha.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
const fmtFecha = fechaISO => new Date(`${fechaISO}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

export default function Inicio({ onNuevo, onEditar, onVerTodas, refreshKey }) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [transacciones, setTransacciones] = useState([])
  const [mes, setMes] = useState(() => new Date())

  const cargarDatos = useCallback(async uid => {
    setCargando(true)
    setError(null)
    try {
      setTransacciones(await obtenerTransaccionesPorMes(uid, mes))
    } catch (err) {
      console.error('[Kairen Finanzas] Error cargando inicio:', err)
      setError('No se pudieron cargar los movimientos.')
    } finally {
      setCargando(false)
    }
  }, [mes])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => data.user && cargarDatos(data.user.id))
  }, [cargarDatos, refreshKey])

  const moverMes = cantidad => setMes(actual => new Date(actual.getFullYear(), actual.getMonth() + cantidad, 1))
  const ingresos = transacciones.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0)
  const gastos = transacciones.filter(t => t.tipo === 'gasto').reduce((s, t) => s + Number(t.monto), 0)
  const disponible = ingresos - gastos
  const visibles = transacciones.slice(0, 6)

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <header className="month-header">
        <button onClick={() => moverMes(-1)} aria-label="Mes anterior" className="icon-button">‹</button>
        <button onClick={() => setMes(new Date())} className="month-title">📅 <span>{nombreMes(mes)}</span></button>
        <button onClick={() => moverMes(1)} aria-label="Mes siguiente" className="icon-button">›</button>
      </header>

      <section className="summary-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Dinero Disponible</span>
          <InfoTooltip title="Dinero Disponible" text="Ingresos menos gastos del mes seleccionado. No incluye el ahorro externo." />
        </div>
        <div className="available-amount">{cargando ? '…' : fmt(disponible)}</div>
        <div className="summary-grid">
          <div><span className="income-label">↑ Ingresos</span><div>+{cargando ? '…' : fmt(ingresos)}</div></div>
          <div><span className="expense-label">↓ Gastos</span><div>-{cargando ? '…' : fmt(gastos)}</div></div>
        </div>
      </section>

      <div className="section-heading">
        <h2>Transacciones</h2>
        {transacciones.length > 0 && <button onClick={onVerTodas} className="link-button">Ver todas</button>}
      </div>

      {error && <p className="error-message">{error}</p>}
      {!cargando && !error && transacciones.length === 0 && (
        <div className="empty-state"><div style={{ fontSize: 32, marginBottom: 8 }}>📭</div><p>Aún no tienes transacciones este mes.</p><small>Toca el botón + para registrar la primera.</small></div>
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
    </div>
  )
}
