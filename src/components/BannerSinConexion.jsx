import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { WifiOff } from 'lucide-react'

export default function BannerSinConexion({ pendientes = 0 }) {
  const { t } = usePreferencias()

  return (
    <div style={{
      background: 'var(--warning)', color: 'var(--on-warning)', fontSize: 12, fontWeight: 600,
      textAlign: 'center', padding: '8px 12px', position: 'sticky', top: 0, zIndex: 30
    }}>
      <WifiOff size={14} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />{t('offline_sin_conexion')}
      {pendientes > 0 && ` — ${pendientes} ${pendientes === 1 ? t('offline_pendiente_singular') : t('offline_pendiente_plural')}`}
    </div>
  )
}
