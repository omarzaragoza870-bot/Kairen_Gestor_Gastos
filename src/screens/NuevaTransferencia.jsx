import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerCuentas, crearTransferencia } from '../lib/db.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import Monto from '../components/Monto.jsx'
import { mensajeAmigable } from '../lib/errores.js'

const hoy = () => {
  const fecha = new Date()
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

export default function NuevaTransferencia({ onBack, onGuardada }) {
  const { t } = usePreferencias()
  const [cuentas, setCuentas] = useState([])
  const [origenId, setOrigenId] = useState(null)
  const [destinoId, setDestinoId] = useState(null)
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const lista = await obtenerCuentas(data.user.id)
      setCuentas(lista)
      if (lista.length > 0) setOrigenId(lista[0].id)
      if (lista.length > 1) setDestinoId(lista[1].id)
    })
  }, [])

  const montoNum = Number(monto)
  const valido = origenId && destinoId && origenId !== destinoId && Number.isFinite(montoNum) && montoNum > 0

  const handleGuardar = async () => {
    if (origenId === destinoId) {
      setError(t('tf_error_misma_cuenta'))
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await crearTransferencia({
        cuentaOrigenId: origenId,
        cuentaDestinoId: destinoId,
        monto: montoNum,
        descripcion,
        fecha
      })
      onGuardada ? onGuardada() : onBack()
    } catch (err) {
      setError(mensajeAmigable(err))
      setGuardando(false)
    }
  }

  return (
    <div style={{ padding: '16px 16px 40px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} className="back-button">←</button>
        <h1>{t('tf_titulo')}</h1>
      </div>

      <label className="field-label">{t('tf_cuenta_origen')}</label>
      <div style={{ display: 'flex', gap: 10, margin: '8px 0 20px' }}>
        {cuentas.map(c => (
          <button
            key={c.id}
            onClick={() => setOrigenId(c.id)}
            style={{
              flex: 1, padding: 12, borderRadius: 'var(--radius-md)', textAlign: 'left',
              background: 'var(--bg-surface)',
              border: '1.5px solid ' + (origenId === c.id ? 'var(--accent-blue)' : 'var(--border-subtle)')
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--success)' }}><Monto valor={c.saldo} /></div>
          </button>
        ))}
      </div>

      <label className="field-label">{t('tf_cuenta_destino')}</label>
      <div style={{ display: 'flex', gap: 10, margin: '8px 0 20px' }}>
        {cuentas.map(c => (
          <button
            key={c.id}
            onClick={() => setDestinoId(c.id)}
            disabled={c.id === origenId}
            style={{
              flex: 1, padding: 12, borderRadius: 'var(--radius-md)', textAlign: 'left',
              background: 'var(--bg-surface)', opacity: c.id === origenId ? 0.4 : 1,
              border: '1.5px solid ' + (destinoId === c.id ? 'var(--accent-blue)' : 'var(--border-subtle)')
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--success)' }}><Monto valor={c.saldo} /></div>
          </button>
        ))}
      </div>

      <label className="field-label">{t('tf_monto')}</label>
      <div className="input-shell" style={{ marginBottom: 20 }}>
        <span style={{ color: 'var(--text-muted)' }}>$</span>
        <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(',', '.'))} placeholder="0.00" />
      </div>

      <label className="field-label">{t('tf_descripcion')}</label>
      <div className="input-shell" style={{ marginBottom: 20 }}>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={80} />
      </div>

      <label className="field-label">{t('tf_fecha')}</label>
      <div className="input-shell" style={{ marginBottom: 20 }}>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>

      {error && <p className="error-message">{error}</p>}

      <button
        disabled={!valido || guardando}
        onClick={handleGuardar}
        style={{
          width: '100%', padding: 16, borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 15,
          background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
          color: valido ? '#fff' : 'var(--text-muted)'
        }}
      >
        {guardando ? t('tf_guardando') : t('tf_boton_guardar')}
      </button>
    </div>
  )
}