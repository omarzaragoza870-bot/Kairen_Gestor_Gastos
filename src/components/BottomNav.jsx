import { usePreferencias } from '../context/PreferenciasContext.jsx'

const tabs = [
  { id: 'inicio', clave: 'nav_inicio', icon: '🏠' },
  { id: 'analisis', clave: 'nav_analisis', icon: '📊' },
  { id: 'ahorro', clave: 'nav_ahorro', icon: '🏦' },
  { id: 'metas', clave: 'nav_metas', icon: '🎯' },
  { id: 'ajustes', clave: 'nav_ajustes', icon: '⚙️' }
]

export default function BottomNav({ active, onChange }) {
  const { t } = usePreferencias()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border-subtle)',
      paddingBottom: 'var(--safe-bottom)',
      display: 'flex', zIndex: 20
    }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            flex: 1, background: 'transparent', padding: '10px 4px 8px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2
          }}
        >
          <span style={{ fontSize: 18, opacity: active === tab.id ? 1 : 0.5 }}>{tab.icon}</span>
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: active === tab.id ? 'var(--accent-blue)' : 'var(--text-muted)'
          }}>
            {t(tab.clave)}
          </span>
        </button>
      ))}
    </nav>
  )
}