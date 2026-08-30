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
    <>
      <style>{`
        @keyframes bubble-up {
          0%   { transform: translateY(0) scale(0.9); opacity: 0.6; }
          60%  { transform: translateY(-12px) scale(1.12); }
          100% { transform: translateY(-10px) scale(1.05); opacity: 1; }
        }
        .nav-btn-active {
          animation: bubble-up 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>

      <nav
        style={{
          position: 'fixed',
          left: 16,
          right: 16,
          bottom: 'calc(16px + var(--safe-bottom))',
          background: 'var(--nav-bg)',
          borderRadius: 999,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-around',
          /* Más delgada que antes: 8px en vez de 10px de padding vertical */
          padding: '8px 8px 10px',
          boxShadow: '0 12px 32px rgba(0,0,0,.35)',
          zIndex: 20,
          overflow: 'visible'
        }}
      >
        {tabs.map(({ id, Icon }) => {
          const activo = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-label={id}
              className={activo ? 'nav-btn-active' : ''}
              style={{
                position: 'relative',
                background: activo ? 'var(--nav-active-bg)' : 'transparent',
                width: activo ? 52 : 44,
                height: 44,
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                /* La elevación la hace la animación — no translateY fijo
                   para que el arco se vea natural */
                transform: activo ? 'translateY(-10px) scale(1.05)' : 'translateY(0) scale(1)',
                transition: activo
                  ? 'none'  /* la animación CSS toma el control */
                  : 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: activo
                  ? '0 6px 20px rgba(79,107,255,0.35)'
                  : 'none'
              }}
            >
              <Icon
                size={activo ? 24 : 22}
                strokeWidth={activo ? 2.5 : 2}
                color={activo ? 'var(--nav-icon-active)' : 'var(--nav-icon-inactive)'}
              />
            </button>
          )
        })}
      </nav>
    </>
  )
}
