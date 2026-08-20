import { useState } from 'react'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { suscribirPush } from '../lib/push.js'

const CLAVE_CERRADO = 'kairen_popup_push_cerrado'

/**
 * Se muestra una sola vez (por navegador) invitando a activar notificaciones
 * push, solo cuando el permiso del navegador está en su estado inicial
 * ('default' — nunca se ha preguntado). Si el usuario ya las activó, ya las
 * bloqueó, o ya cerró este popup antes, App.jsx ni siquiera lo renderiza.
 */
export default function PopupNotificaciones({ userId, onCerrar }) {
  const { t } = usePreferencias()
  const [activando, setActivando] = useState(false)

  const activar = async () => {
    setActivando(true)
    try {
      await suscribirPush(userId)
    } finally {
      setActivando(false)
      onCerrar()
    }
  }

  const cerrar = () => {
    try { localStorage.setItem(CLAVE_CERRADO, 'true') } catch { /* noop */ }
    onCerrar()
  }

  return (
    <div onClick={cerrar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 340, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
        <h3 style={{ margin: '0 0 8px' }}>{t('push_popup_titulo')}</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {t('push_popup_texto')}
        </p>
        <button
          onClick={activar}
          disabled={activando}
          style={{ width: '100%', padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--gradient-brand)', color: '#fff', fontWeight: 700, marginBottom: 8 }}
        >
          {activando ? t('comun_guardando') : t('push_popup_activar')}
        </button>
        <button onClick={cerrar} style={{ width: '100%', padding: 12, background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
          {t('push_popup_ahora_no')}
        </button>
      </div>
    </div>
  )
}

/** true si el popup debe mostrarse: nunca se ha decidido el permiso y el usuario no lo cerró antes */
export function debeMostrarPopupPush(permisoPushActual) {
  if (permisoPushActual !== 'default') return false
  try {
    return localStorage.getItem(CLAVE_CERRADO) !== 'true'
  } catch {
    return true
  }
}
