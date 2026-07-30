const tabs = [
  { id: 'inicio', label: 'Inicio', icon: '🏠' },
  { id: 'analisis', label: 'Análisis', icon: '📊' },
  { id: 'ahorro', label: 'Ahorro', icon: '🏦' },
  { id: 'metas', label: 'Metas', icon: '🎯' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙️' }
]

export default function BottomNav({ active, onChange }) {
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
            {tab.label}
          </span>
        </button>
      ))}
    </nav>
  )
}
