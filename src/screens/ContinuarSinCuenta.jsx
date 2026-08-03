import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { usePreferencias, MONEDAS } from '../context/PreferenciasContext.jsx'
import { logError } from '../lib/logger.js'

const TEMAS = [
  ['sistema', '⚙️'],
  ['claro', '☀️'],
  ['oscuro', '🌙']
]

export default function ContinuarSinCuenta({ onCancelar }) {
  const { t, setMoneda, setTema } = usePreferencias()
  const [nombre, setNombre] = useState('')
  const [monedaElegida, setMonedaElegida] = useState('MXN')
  const [temaElegido, setTemaElegido] = useState('oscuro')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState(null)

  const valido = nombre.trim().length > 0

  const handleContinuar = async () => {
    if (!valido || procesando) return
    setProcesando(true)
    setError(null)
    try {
      const { data, error: authError } = await supabase.auth.signInAnonymously()
      if (authError) throw authError

      await supabase.auth.updateUser({ data: { full_name: nombre.trim() } })

      setMoneda(monedaElegida)
      setTema(temaElegido)
      // App.jsx detecta el cambio de sesión solo (onAuthStateChange) y pasa a la app principal
    } catch (err) {
      logError('Error iniciando sesión de invitado', err)
      setError('No se pudo continuar. Intenta de nuevo.')
      setProcesando(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      padding: 24, paddingTop: 'calc(24px + var(--safe-top))'
    }}>
      <button onClick={onCancelar} style={{ background: 'transparent', color: 'var(--text-secondary)', fontSize: 20, alignSelf: 'flex-start', marginBottom: 12 }}>←</button>

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>{t('invitado_titulo')}</h1>

      <div style={{
        background: 'rgba(251, 191, 36, 0.1)', border: '1px solid var(--warning)',
        borderRadius: 'var(--radius-md)', padding: 14, marginBottom: 24
      }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          ⚠️ {t('invitado_advertencia')}
        </p>
      </div>

      <label className="field-label">{t('invitado_nombre')}</label>
      <div className="input-shell" style={{ marginBottom: 20 }}>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('invitado_nombre_placeholder')} maxLength={40} autoFocus />
      </div>

      <label className="field-label">{t('invitado_moneda')}</label>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0 20px', paddingBottom: 4 }}>
        {MONEDAS.map(m => (
          <button
            key={m.codigo}
            onClick={() => setMonedaElegida(m.codigo)}
            style={{
              flexShrink: 0, padding: '10px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              background: monedaElegida === m.codigo ? 'var(--gradient-brand)' : 'var(--bg-surface)',
              color: monedaElegida === m.codigo ? '#fff' : 'var(--text-secondary)',
              border: '1px solid ' + (monedaElegida === m.codigo ? 'transparent' : 'var(--border-subtle)')
            }}
          >
            {m.bandera} {m.codigo}
          </button>
        ))}
      </div>

      <label className="field-label">{t('invitado_tema')}</label>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0 24px' }}>
        {TEMAS.map(([id, icono]) => (
          <button
            key={id}
            onClick={() => setTemaElegido(id)}
            style={{
              flex: 1, padding: 12, borderRadius: 'var(--radius-md)', fontSize: 18,
              background: temaElegido === id ? 'var(--gradient-brand)' : 'var(--bg-surface)',
              border: '1px solid ' + (temaElegido === id ? 'transparent' : 'var(--border-subtle)')
            }}
          >
            {icono}
          </button>
        ))}
      </div>

      {error && <p className="error-message">{error}</p>}

      <button
        disabled={!valido || procesando}
        onClick={handleContinuar}
        style={{
          padding: 16, borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 15, marginTop: 'auto',
          background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
          color: valido ? '#fff' : 'var(--text-muted)'
        }}
      >
        {procesando ? '…' : t('invitado_continuar')}
      </button>
    </div>
  )
}
