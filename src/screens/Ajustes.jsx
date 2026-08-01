import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import InfoTooltip from '../components/InfoTooltip.jsx'
import { useScrollLock } from '../hooks/useScrollLock.js'

export default function Ajustes({ onVerTutorial }) {
  const [user, setUser] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  useScrollLock(confirmando)
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    // onAuthStateChange en App.jsx detecta esto solo y regresa al Login
  }

  const handleDeleteAccount = async () => {
    setEliminando(true)
    setError(null)
    try {
      // supabase.functions.invoke ya arma automáticamente el header
      // "apikey" (obligatorio) y "Authorization" con el token de la
      // sesión actual — no hace falta armarlos a mano.
      const { error: fnError } = await supabase.functions.invoke('delete-account')

      if (fnError) throw fnError

      await supabase.auth.signOut()
    } catch (err) {
      setError('No se pudo eliminar la cuenta. Intenta de nuevo o contáctanos.')
      console.error('[Kairen Finanzas] Error al eliminar cuenta:', err)
      setEliminando(false)
    }
  }

  const nombre = user?.user_metadata?.full_name || user?.user_metadata?.name || 'Usuario'
  const avatar = user?.user_metadata?.avatar_url
  const email = user?.email

  return (
    <div style={{ padding: '16px 16px 100px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 20px' }}>Ajustes</h1>

      {/* Perfil */}
      <section style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        padding: 18, display: 'flex', alignItems: 'center', gap: 14,
        border: '1px solid var(--border-subtle)', marginBottom: 16
      }}>
        {avatar ? (
          <img src={avatar} alt="" style={{ width: 52, height: 52, borderRadius: '50%' }} />
        ) : (
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: 'var(--gradient-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700
          }}>
            {nombre.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{nombre}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
          <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 2 }}>● Sesión iniciada con Google</div>
        </div>
      </section>

      {/* Cuenta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 8px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>Cuenta</h2>
        <InfoTooltip
          title="Cerrar sesión vs Eliminar cuenta"
          text="Cerrar sesión solo desvincula este dispositivo — tus datos siguen guardados y puedes volver a entrar cuando quieras. Eliminar cuenta borra permanentemente tu perfil y todos tus datos, sin poder recuperarlos."
        />
      </div>

      {onVerTutorial && (
        <button
          onClick={onVerTutorial}
          style={{
            width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 10,
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
            fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10
          }}
        >
          <span>🎓</span> Ver tutorial de nuevo
        </button>
      )}

      <button
        onClick={handleLogout}
        style={{
          width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 10,
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
          fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10
        }}
      >
        <span>🔓</span> Cerrar sesión
      </button>

      <button
        onClick={() => setConfirmando(true)}
        style={{
          width: '100%', textAlign: 'left', padding: '14px 16px',
          background: 'rgba(251, 113, 133, 0.08)', borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(251, 113, 133, 0.3)', color: 'var(--danger)',
          fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10
        }}
      >
        <span>🗑️</span> Eliminar cuenta
      </button>

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</p>
      )}

      {/* Modal de confirmación para eliminar cuenta */}
      {confirmando && (
        <div
          onClick={() => !eliminando && setConfirmando(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-lg)',
            padding: 24, maxWidth: 320, width: '100%'
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--danger)' }}>
              ¿Eliminar tu cuenta?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Se borrarán permanentemente todas tus transacciones, categorías y datos de ahorro.
              Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmando(false)}
                disabled={eliminando}
                style={{
                  flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={eliminando}
                style={{
                  flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
                  background: 'var(--danger)', color: '#fff', fontWeight: 700, fontSize: 13
                }}
              >
                {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}