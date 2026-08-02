import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { IDIOMAS } from '../i18n/translations.js'

export default function SelectorIdioma({ onBack }) {
  const { idioma, setIdioma, t } = usePreferencias()

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} className="back-button">←</button>
        <h1>{t('ajustes_idioma')}</h1>
      </div>

      {IDIOMAS.map(i => (
        <button
          key={i.codigo}
          onClick={() => setIdioma(i.codigo)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', marginBottom: 8, textAlign: 'left',
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
            border: '1.5px solid ' + (idioma === i.codigo ? 'var(--accent-blue)' : 'var(--border-subtle)')
          }}
        >
          <span style={{ fontSize: 20 }}>{i.bandera}</span>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{i.label}</div>
          {idioma === i.codigo && <span style={{ color: 'var(--accent-blue)', fontSize: 18 }}>✓</span>}
        </button>
      ))}
    </div>
  )
}
