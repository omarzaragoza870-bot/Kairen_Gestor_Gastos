import { usePreferencias, MONEDAS } from '../context/PreferenciasContext.jsx'

export default function SelectorMoneda({ onBack }) {
  const { moneda, setMoneda, t } = usePreferencias()

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} className="back-button">←</button>
        <h1>{t('ajustes_moneda')}</h1>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        {t('sm_nota')}
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