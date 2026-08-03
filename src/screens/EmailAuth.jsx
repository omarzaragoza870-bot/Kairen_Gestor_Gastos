import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { logError } from '../lib/logger.js'

export default function EmailAuth({ onCancelar }) {
  const { t } = usePreferencias()
  const [modo, setModo] = useState('entrar') // 'entrar' | 'crear'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState(null)
  const [mensaje, setMensaje] = useState(null)
  const [intentosFallidos, setIntentosFallidos] = useState(0)
  const [bloqueadoHasta, setBloqueadoHasta] = useState(null)

  const valido = email.trim().length > 3 && password.length >= 6 && (modo === 'entrar' || nombre.trim().length > 0)

  const handleSubmit = async () => {
    if (!valido || procesando) return
    // Protección client-side contra fuerza bruta: bloquea 30s tras 5 intentos fallidos
    if (bloqueadoHasta && Date.now() < bloqueadoHasta) {
      const segs = Math.ceil((bloqueadoHasta - Date.now()) / 1000)
      setError(`Demasiados intentos fallidos. Espera ${segs} segundos antes de volver a intentar.`)
      return
    }
    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      if (modo === 'crear') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: nombre.trim() } }
        })
        if (signUpError) throw signUpError

        // Si tu proyecto de Supabase tiene activada la confirmación por correo,
        // no habrá sesión todavía hasta que el usuario confirme desde su email.
        if (!data.session) {
          setMensaje('Te mandamos un correo de confirmación. Revisa tu bandeja de entrada y luego inicia sesión aquí.')
        setIntentosFallidos(0)
        setBloqueadoHasta(null)
          setModo('entrar')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        })
        if (signInError) throw signInError
      }
    } catch (err) {
      logError('Error con correo/contraseña', err)
      setError(mensajeError(err))
      // Incrementar contador de intentos fallidos
      const nuevos = intentosFallidos + 1
      setIntentosFallidos(nuevos)
      if (nuevos >= 5) {
        setBloqueadoHasta(Date.now() + 30000) // bloquear 30 segundos
        setIntentosFallidos(0)
      }
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      padding: 24, paddingTop: 'calc(24px + var(--safe-top))'
    }}>
      <button onClick={onCancelar} style={{ background: 'transparent', color: 'var(--text-secondary)', fontSize: 20, alignSelf: 'flex-start', marginBottom: 12 }}>←</button>

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 20px' }}>
        {modo === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta'}
      </h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => { setModo('entrar'); setError(null); setMensaje(null) }}
          style={{
            flex: 1, padding: 12, borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 13,
            background: modo === 'entrar' ? 'var(--gradient-brand)' : 'var(--bg-surface)',
            color: modo === 'entrar' ? '#fff' : 'var(--text-secondary)',
            border: '1px solid ' + (modo === 'entrar' ? 'transparent' : 'var(--border-subtle)')
          }}
        >
          Iniciar sesión
        </button>
        <button
          onClick={() => { setModo('crear'); setError(null); setMensaje(null) }}
          style={{
            flex: 1, padding: 12, borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 13,
            background: modo === 'crear' ? 'var(--gradient-brand)' : 'var(--bg-surface)',
            color: modo === 'crear' ? '#fff' : 'var(--text-secondary)',
            border: '1px solid ' + (modo === 'crear' ? 'transparent' : 'var(--border-subtle)')
          }}
        >
          Crear cuenta
        </button>
      </div>

      {modo === 'crear' && (
        <>
          <label className="field-label">¿Cómo te llamas?</label>
          <div className="input-shell" style={{ marginBottom: 16 }}>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" maxLength={40} />
          </div>
        </>
      )}

      <label className="field-label">Correo</label>
      <div className="input-shell" style={{ marginBottom: 16 }}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" autoCapitalize="none" autoComplete="email" />
      </div>

      <label className="field-label">Contraseña</label>
      <div className="input-shell" style={{ marginBottom: 8 }}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 20px' }}>Mínimo 6 caracteres.</p>

      {mensaje && <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 12 }}>{mensaje}</p>}
      {error && <p className="error-message">{error}</p>}

      <button
        disabled={!valido || procesando}
        onClick={handleSubmit}
        style={{
          padding: 16, borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 15, marginTop: 'auto',
          background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
          color: valido ? '#fff' : 'var(--text-muted)'
        }}
      >
        {procesando ? '…' : modo === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta'}
      </button>
    </div>
  )
}

function mensajeError(err) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (msg.includes('already registered') || msg.includes('already exists')) return 'Ya existe una cuenta con ese correo. Intenta iniciar sesión.'
  if (msg.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión (revisa tu bandeja de entrada).'
  if (msg.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.'
  return 'No se pudo completar. Intenta de nuevo.'
}