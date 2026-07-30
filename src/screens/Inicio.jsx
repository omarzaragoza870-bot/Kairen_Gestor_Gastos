import InfoTooltip from '../components/InfoTooltip.jsx'

const mockTx = [
  { id: 1, categoria: 'Alimentación', cuenta: 'Efectivo', monto: -500, fecha: 'mié 29/07 20:15' },
  { id: 2, categoria: 'Transporte', cuenta: 'Tarjeta', monto: -1200, fecha: 'mié 29/07 20:13' },
  { id: 3, categoria: 'Ropa', cuenta: 'Efectivo', monto: -375.4, fecha: 'mié 29/07 20:09' }
]

const fmt = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

export default function Inicio({ onNuevo }) {
  const disponible = 3649.60
  const ingresos = 5725.00
  const gastos = 2075.40

  return (
    <div style={{ padding: '16px 16px 100px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Julio 2026</h1>
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
          {fmt(disponible)}
        </div>

        <div style={{ display: 'flex', gap: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, color: 'var(--success)' }}>↑ Ingresos</span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>+{fmt(ingresos)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>↓ Gastos</span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>-{fmt(gastos)}</div>
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 0 10px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Transacciones</h2>
        <span style={{ fontSize: 13, color: 'var(--accent-blue)' }}>Ver todas</span>
      </div>

      {mockTx.map(tx => (
        <div key={tx.id} style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
          padding: '14px 16px', marginBottom: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          border: '1px solid var(--border-subtle)'
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{tx.categoria}</div>
            <div style={{ fontSize: 12, color: 'var(--accent-blue)' }}>{tx.cuenta}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tx.fecha}</div>
          </div>
          <div style={{ color: 'var(--danger)', fontWeight: 700 }}>
            {tx.monto < 0 ? '-' : '+'}{fmt(Math.abs(tx.monto))}
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
