import { usePreferencias, MONEDAS } from '../context/PreferenciasContext.jsx'

export default function SelectorMoneda({ onBack }) {
  const { moneda, setMoneda } = usePreferencias()

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} className="back-button">←</button>
        <h1>Moneda</h1>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Esto solo cambia el símbolo y formato con el que se muestran tus montos —
        no convierte tus cifras con un tipo de cambio real.
      </p>

      {MONEDAS.map(m => (
        <button
          key={m.codigo}
          onClick={() => setMoneda(m.codigo)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', marginBottom: 8, textAlign: 'left',
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
            border: '1.5px solid ' + (moneda === m.codigo ? 'var(--accent-blue)' : 'var(--border-subtle)')
          }}
        >
          <span style={{ fontSize: 20 }}>{m.bandera}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{m.codigo}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.label}</div>
          </div>
          {moneda === m.codigo && <span style={{ color: 'var(--accent-blue)', fontSize: 18 }}>✓</span>}
        </button>
      ))}
    </div>
  )
}
