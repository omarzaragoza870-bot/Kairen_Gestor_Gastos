import { Home, BarChart3, Wallet, Target, Settings } from 'lucide-react'

const tabs = [
  { id: 'inicio', clave: 'nav_inicio', Icon: Home },
  { id: 'analisis', clave: 'nav_analisis', Icon: BarChart3 },
  { id: 'ahorro', clave: 'nav_ahorro', Icon: Wallet },
  { id: 'metas', clave: 'nav_metas', Icon: Target },
  { id: 'ajustes', clave: 'nav_ajustes', Icon: Settings }
]

export default function BottomNav({ active, onChange }) {
  return (
    <nav
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 'calc(16px + var(--safe-bottom))',
        background: 'var(--nav-bg)',
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '10px 8px',
        boxShadow: '0 12px 32px rgba(0,0,0,.35)',
        zIndex: 20
      }}
    >
      {tabs.map(({ id, Icon }) => {
        const activo = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-label={id}
            style={{
              background: activo ? 'var(--nav-active-bg)' : 'transparent',
              width: activo ? 52 : 44,
              height: 44,
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            <Icon
              size={22}
              strokeWidth={2}
              color={activo ? 'var(--nav-icon-active)' : 'var(--nav-icon-inactive)'}
            />
          </button>
        )
      })}
    </nav>
  )
}