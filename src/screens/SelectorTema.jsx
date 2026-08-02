import { usePreferencias } from '../context/PreferenciasContext.jsx'

const OPCIONES_IDS = ['sistema', 'claro', 'oscuro']
const ICONOS_TEMA = { sistema: '⚙️', claro: '☀️', oscuro: '🌙' }

export default function SelectorTema({ onBack }) {
  const { tema, setTema, t } = usePreferencias()
  const OPCIONES = OPCIONES_IDS.map(id => [id, ICONOS_TEMA[id], t(`st_${id}`), t(`st_${id}_desc`)])

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} className="back-button">←</button>
        <h1>{t('ajustes_tema')}</h1>
      </div>

      {OPCIONES.map(([id, icono, titulo, descripcion]) => (
        <button
          key={id}
          onClick={() => setTema(id)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', marginBottom: 8, textAlign: 'left',
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
            border: '1.5px solid ' + (tema === id ? 'var(--accent-blue)' : 'var(--border-subtle)')
          }}
        >
          <span style={{ fontSize: 20 }}>{icono}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{descripcion}</div>
          </div>
          {tema === id && <span style={{ color: 'var(--accent-blue)', fontSize: 18 }}>✓</span>}
        </button>
      ))}
    </div>
  )
}