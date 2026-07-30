import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerTransaccionesDelMes } from '../lib/db.js'
import InfoTooltip from '../components/InfoTooltip.jsx'

const fmt = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const mesActual = new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

const fmtFecha = (fechaISO, createdAt) => {
  const d = new Date(createdAt || fechaISO)
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Inicio({ onNuevo, refreshKey }) {
  const [cargando, setCargando] = useState(true)
  const [transacciones, setTransacciones] = useState([])

  const cargarDatos = useCallback(async (uid) => {
    setCargando(true)
    const tx = await obtenerTransaccionesDelMes(uid)
    setTransacciones(tx)
    setCargando(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) cargarDatos(data.user.id)
    })
  }, [cargarDatos, refreshKey])

  const ingresos = transacciones.filter(t => t.tipo === 'ingreso').reduce((sum, t) => sum + Number(t.monto), 0)
  const gastos = transacciones.filter(t => t.tipo === 'gasto').reduce((sum, t) => sum + Number(t.monto), 0)
  const disponible = ingresos - gastos

  return (
    <div style={{ padding: '16px 16px 100px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, textTransform: 'capitalize' }}>{mesActual}</h1>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>‹ ›  📅</span>
      </header>

      <section style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        padding: 20, border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Dinero Disponible</span>
          <InfoTooltip
            title="Dinero Disponible"
            text="Es el resultado de tus ingresos menos tus gastos del período seleccionado. No incluye tu Cuenta de Ahorro externa."
          />
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, margin: '4px 0 16px', backgroundImage: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
          {cargando ? '…' : fmt(disponible)}
        </div>

        <div style={{ display: 'flex', gap: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, color: 'var(--success)' }}>↑ Ingresos</span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>+{cargando ? '…' : fmt(ingresos)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>↓ Gastos</span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>-{cargando ? '…' : fmt(gastos)}</div>
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 0 10px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Transacciones</h2>
        {transacciones.length > 0 && <span style={{ fontSize: 13, color: 'var(--accent-blue)' }}>Ver todas</span>}
      </div>

      {!cargando && transacciones.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)',
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <p style={{ fontSize: 14, margin: 0 }}>Aún no tienes transacciones este mes.</p>
          <p style={{ fontSize: 13, margin: '4px 0 0' }}>Toca el botón + para registrar la primera.</p>
        </div>
      )}

      {transacciones.map(tx => (
        <div key={tx.id} style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
          padding: '14px 16px', marginBottom: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          border: '1px solid var(--border-subtle)'
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{tx.categoria_nombre}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtFecha(tx.fecha, tx.created_at)}</div>
          </div>
          <div style={{ color: tx.tipo === 'gasto' ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
            {tx.tipo === 'gasto' ? '-' : '+'}{fmt(Number(tx.monto))}
          </div>
        </div>
      ))}

      <button
        onClick={onNuevo}
        aria-label="Nueva operación"
        style={{
          position: 'fixed', right: 20, bottom: 92,
          width: 56, height: 56, borderRadius: 16,
          background: 'var(--gradient-brand)', color: '#fff',
          fontSize: 26, fontWeight: 700, boxShadow: '0 8px 24px rgba(79,107,255,0.4)'
        }}
      >
        +
      </button>
    </div>
  )
}