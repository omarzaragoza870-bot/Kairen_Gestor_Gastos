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
  const [cargandoGoogle, setCargandoGoogle] = useState(false)

  const handleGoogleLogin = async () => {
    if (cargandoGoogle) return // evita doble clic, que generaba dos flujos de OAuth a la vez
    setCargandoGoogle(true)
    try {
      if (esNativo()) {
        const { Browser } = await import('@capacitor/browser')
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            // App Links: usamos el dominio real de Vercel como redirect.
            // Android intercepta esta URL automáticamente y regresa a la app
            // (gracias al intent-filter android:autoVerify="true" en el manifest
            // y el archivo /.well-known/assetlinks.json en Vercel) — mucho más
            // confiable que el esquema personalizado com.kairen.finanzas:// que
            // Firefox y Chrome manejaban de forma inconsistente.
            redirectTo: 'https://kairen-gestor-gastos.vercel.app/auth/callback',
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
    } finally {
      // Se reactiva después de un momento — si el usuario cancela en el
      // navegador y regresa, puede volver a intentarlo sin quedar trabado.
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