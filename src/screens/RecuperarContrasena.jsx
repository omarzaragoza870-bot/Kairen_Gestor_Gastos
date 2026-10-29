import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { logError } from '../lib/logger.js'

// Recuperación con código y no con enlace: el código se escribe en la app,
// así que no depende de deep links ni de abrir el correo en el mismo teléfono.
// El correo usa la plantilla "Reset Password" de Supabase, que debe incluir {{ .Token }}.
export default function RecuperarContrasena({ emailInicial = '', onVolver }) {
  const [paso, setPaso] = useState('correo') // 'correo' | 'codigo'
  const [email, setEmail] = useState(emailInicial)
  const [codigo, setCodigo] = useState('')
  const [password, setPassword] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState(null)
  const [mensaje, setMensaje] = useState(null)

  const correoValido = email.trim().length > 3
  // La longitud del código depende de la configuración del proyecto (6 por defecto)
  const codigoValido = /^\d{6,10}$/.test(codigo)
  const valido = paso === 'correo' ? correoValido : codigoValido && password.length >= 6

  const enviarCodigo = async () => {
    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim())
      if (resetError) throw resetError
      // Supabase responde igual exista o no la cuenta, para no revelar qué correos están registrados
      setMensaje('Si hay una cuenta con ese correo, te mandamos un código. Revisa tu bandeja de entrada (y spam).')
      setPaso('codigo')
    } catch (err) {
      logError('Error enviando código de recuperación', err)
      setError(mensajeError(err))
    } finally {
      setProcesando(false)
    }
  }

  const cambiarContrasena = async () => {
    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      const { error: otpError } = await supabase.auth.verifyOtp({ email: email.trim(), token: codigo, type: 'recovery' })
      if (otpError) throw otpError
      // verifyOtp ya inició sesión: al terminar, App cambia sola a la pantalla principal
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
    } catch (err) {
      logError('Error cambiando contraseña', err)
      setError(mensajeError(err))
    } finally {
      setProcesando(false)
    }
  }

  const handleSubmit = () => {
    if (!valido || procesando) return
    if (paso === 'correo') enviarCodigo()
    else cambiarContrasena()
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      padding: 24, paddingTop: 'calc(24px + var(--safe-top))'
    }}>
      <button onClick={onVolver} aria-label="Volver" style={{ background: 'transparent', color: 'var(--text-secondary)', fontSize: 20, alignSelf: 'flex-start', marginBottom: 12 }}>←</button>

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Recuperar contraseña</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
        {paso === 'correo'
          ? 'Escribe el correo de tu cuenta y te mandaremos un código para crear una contraseña nueva.'
          : `Escribe el código que mandamos a ${email.trim()} y tu contraseña nueva.`}
      </p>

      {paso === 'correo' ? (
        <>
          <label className="field-label">Correo</label>
          <div className="input-shell" style={{ marginBottom: 20 }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" autoCapitalize="none" autoComplete="email" />
          </div>
        </>
      ) : (
        <>
          <label className="field-label">Código</label>
          <div className="input-shell" style={{ marginBottom: 16 }}>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" maxLength={10} />
          </div>

          <label className="field-label">Contraseña nueva</label>
          <div className="input-shell" style={{ marginBottom: 8 }}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px' }}>Mínimo 6 caracteres.</p>

          <button
            onClick={enviarCodigo}
            disabled={procesando}
            style={{ background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, alignSelf: 'flex-start', marginBottom: 20, textDecoration: 'underline' }}
          >
            Reenviar código
          </button>
        </>
      )}

      {mensaje && <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 12 }}>{mensaje}</p>}
      {error && <p className="error-message">{error}</p>}

      <button
        disabled={!valido || procesando}
        onClick={handleSubmit}
        style={{
          padding: 16, borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 15, marginTop: 'auto',
          background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
          color: valido ? 'var(--on-accent)' : 'var(--text-muted)'
        }}
      >
        {procesando ? '…' : paso === 'correo' ? 'Enviar código' : 'Cambiar contraseña'}
      </button>
    </div>
  )
}

function mensajeError(err) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('validate email')) return 'Revisa que el correo esté bien escrito.'
  if (msg.includes('expired') || msg.includes('invalid')) return 'El código no es válido o ya caducó. Pide uno nuevo.'
  if (msg.includes('rate limit') || msg.includes('security purposes')) return 'Pediste muchos códigos seguidos. Espera un momento antes de volver a intentar.'
  if (msg.includes('should be different')) return 'La contraseña nueva debe ser distinta a la anterior.'
  if (msg.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.'
  return 'No se pudo completar. Intenta de nuevo.'
}
