import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { logError } from '../lib/logger.js'
import { esNativo } from '../lib/capacitor.js'
import ContinuarSinCuenta from './ContinuarSinCuenta.jsx'
import EmailAuth from './EmailAuth.jsx'

export default function Login() {
  const { t } = usePreferencias()
  const [mostrarInvitado, setMostrarInvitado] = useState(false)
  const [mostrarEmail, setMostrarEmail] = useState(false)

  const handleGoogleLogin = async () => {
    if (esNativo()) {
      // Google bloquea el login dentro de un WebView embebido normal —
      // hay que abrir el navegador del sistema y regresar por deep link
      // (ver src/App.jsx, listener 'appUrlOpen', y capacitor.config.ts).
      const { Browser } = await import('@capacitor/browser')
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'com.kairen.finanzas://login-callback',
          skipBrowserRedirect: true
        }
      })
      if (error) return logError('Error al iniciar sesión', error)
      if (data?.url) await Browser.open({ url: data.url })
      return
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    if (error) logError('Error al iniciar sesión', error)
  }

  if (mostrarInvitado) {
    return <ContinuarSinCuenta onCancelar={() => setMostrarInvitado(false)} />
  }
  if (mostrarEmail) {
    return <EmailAuth onCancelar={() => setMostrarEmail(false)} />
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center'
    }}>
      <h1 style={{
        fontSize: 32, fontWeight: 800, margin: '0 0 8px',
        backgroundImage: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', color: 'transparent'
      }}>
        Kairen Finanzas
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 40px' }}>
        {t('login_tagline')}
      </p>

      <button
        onClick={handleGoogleLogin}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--bg-surface)', color: 'var(--text-primary)',
          padding: '14px 24px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', fontSize: 15, fontWeight: 600
        }}
      >
        <span>🔵</span> {t('login_boton_google')}
      </button>

      <button
        onClick={() => setMostrarEmail(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 10,
          background: 'var(--bg-surface)', color: 'var(--text-primary)',
          padding: '14px 24px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', fontSize: 15, fontWeight: 600
        }}
      >
        <span>✉️</span> Correo y contraseña
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0', width: '100%', maxWidth: 280 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('login_o')}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>

      <button
        onClick={() => setMostrarInvitado(true)}
        style={{
          padding: '14px 24px', borderRadius: 'var(--radius-md)',
          background: 'transparent', color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)', fontSize: 14, fontWeight: 600
        }}
      >
        {t('login_boton_invitado')}
      </button>

      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 20, maxWidth: 280 }}>
        {t('login_nota')}
      </p>
    </div>
  )
}