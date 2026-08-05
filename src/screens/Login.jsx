import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { logError } from '../lib/logger.js'
import { esNativo } from '../lib/capacitor.js'
import ContinuarSinCuenta from './ContinuarSinCuenta.jsx'
import EmailAuth from './EmailAuth.jsx'
import { iniciarPKCE, limpiarVerifier } from '../lib/pkce.js'

export default function Login() {
  const { t } = usePreferencias()
  const [mostrarInvitado, setMostrarInvitado] = useState(false)
  const [mostrarEmail, setMostrarEmail] = useState(false)
  const [cargandoGoogle, setCargandoGoogle] = useState(false)

  const handleGoogleLogin = async () => {
    if (cargandoGoogle) return
    setCargandoGoogle(true)
    try {
      if (esNativo()) {
        const { Browser } = await import('@capacitor/browser')

        // Generamos el PKCE challenge nosotros mismos y guardamos el verifier
        // en Capacitor Preferences — así persiste entre el navegador externo
        // y el WebView cuando regresa el deep link con ?code=...
        await limpiarVerifier() // limpiar cualquier verifier anterior
        const { challenge } = await iniciarPKCE()

        // Construimos la URL de autorización de Supabase con PKCE manual
        // usando la API de bajo nivel que NO usa el localStorage interno
        const params = new URLSearchParams({
          provider: 'google',
          redirect_to: 'https://kairen-gestor-gastos.vercel.app/auth/callback',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          response_type: 'code',
          scopes: 'email profile',
          skip_http_redirect: 'true'
        })

        const authUrl = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/authorize?${params}`
        await Browser.open({ url: authUrl })
        return
      }

      // En web: PKCE nativo de Supabase (funciona porque todo está en el mismo contexto)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      })
      if (error) logError('Error al iniciar sesión', error)
    } catch (err) {
      logError('Error al iniciar sesión con Google', err)
    } finally {
      setTimeout(() => setCargandoGoogle(false), 2000)
    }
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
        disabled={cargandoGoogle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--bg-surface)', color: 'var(--text-primary)',
          padding: '14px 24px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', fontSize: 15, fontWeight: 600,
          opacity: cargandoGoogle ? 0.6 : 1
        }}
      >
        <span>🔵</span> {cargandoGoogle ? '…' : t('login_boton_google')}
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