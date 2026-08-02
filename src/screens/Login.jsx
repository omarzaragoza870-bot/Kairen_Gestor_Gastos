import { supabase } from '../lib/supabaseClient.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'

export default function Login() {
  const { t } = usePreferencias()

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    if (error) console.error('[Kairen Finanzas] Error al iniciar sesión:', error.message)
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

      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 20, maxWidth: 280 }}>
        {t('login_nota')}
      </p>
    </div>
  )
}