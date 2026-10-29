import { Home, BarChart3, Wallet, Target, Settings } from 'lucide-react'
import { usePreferencias } from '../context/PreferenciasContext.jsx'

const tabs = [
  { id: 'inicio', clave: 'nav_inicio', Icon: Home },
  { id: 'analisis', clave: 'nav_analisis', Icon: BarChart3 },
  { id: 'ahorro', clave: 'nav_ahorro', Icon: Wallet },
  { id: 'metas', clave: 'nav_metas', Icon: Target },
  { id: 'ajustes', clave: 'nav_ajustes', Icon: Settings }
]

/**
 * Barra inferior flotante estilo iOS: material translúcido con desenfoque,
 * ícono + etiqueta en cada pestaña y una cápsula suave detrás de la activa.
 * El desenfoque usa backdrop-filter, disponible en WebView de Android e iOS.
 */
export default function BottomNav({ active, onChange }) {
  const { t } = usePreferencias()
  return (
    <>
      <style>{`
        .tabbar {
          position: fixed; left: 12px; right: 12px; margin: 0 auto; max-width: 440px;
          bottom: calc(12px + var(--safe-bottom));
          display: flex; justify-content: space-between; gap: 2px; padding: 6px;
          border-radius: 999px; z-index: 20;
          background: var(--nav-bg); border: 1px solid var(--nav-border);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          backdrop-filter: blur(24px) saturate(180%);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
        }
        .tabbar-item {
          flex: 1; min-width: 0; min-height: 52px; padding: 6px 2px 5px;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          border-radius: 999px; background: transparent; color: var(--nav-icon-inactive);
          font-size: 10px; font-weight: 500; letter-spacing: 0;
          transition: background-color 0.25s var(--ease-ios), color 0.2s ease;
        }
        .tabbar-item.active { background: var(--nav-active-bg); color: var(--nav-icon-active); font-weight: 600; }
        .tabbar-item:active:not(:disabled) { transform: scale(0.94); opacity: 1; }
        .tabbar-item span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>

      <nav className="tabbar" aria-label="Navegación principal">
        {tabs.map(({ id, clave, Icon }) => {
          const activo = active === id
          return (
            <button
              key={id}
              data-tour={id}
              onClick={() => onChange(id)}
              aria-current={activo ? 'page' : undefined}
              className={activo ? 'tabbar-item active' : 'tabbar-item'}
            >
              <Icon size={22} strokeWidth={activo ? 2.3 : 1.9} aria-hidden="true" />
              <span>{t(clave)}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
