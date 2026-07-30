import { supabase } from '../lib/supabaseClient.js'

export default function Login() {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    if (error) console.error('[Trazo] Error al iniciar sesión:', error.message)
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
        Trazo
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 40px' }}>
        Tu dinero, bajo control.
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
        <span>🔵</span> Continuar con Google
      </button>

      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 20, maxWidth: 280 }}>
        Tus datos se guardan en tu cuenta — si cambias de teléfono, solo inicia sesión y todo sigue ahí.
      </p>
    </div>
  )
}
