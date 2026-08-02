import { usePreferencias } from '../context/PreferenciasContext.jsx'

export default function BannerSinConexion({ pendientes = 0 }) {
  const { t } = usePreferencias()

  return (
    <div style={{
      background: 'var(--warning)', color: '#1a1500', fontSize: 12, fontWeight: 600,
      textAlign: 'center', padding: '8px 12px', position: 'sticky', top: 0, zIndex: 30
    }}>
      📡 {t('offline_sin_conexion')}
      {pendientes > 0 && ` — ${pendientes} ${pendientes === 1 ? t('offline_pendiente_singular') : t('offline_pendiente_plural')}`}
    </div>
  )
}
