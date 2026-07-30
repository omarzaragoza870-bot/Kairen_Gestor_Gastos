import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerCuentas, crearTransaccion } from '../lib/db.js'
import InfoTooltip from '../components/InfoTooltip.jsx'

const categoriasGasto = ['Alimentación', 'Transporte', 'Servicios', 'Entretenimiento', 'Ropa', 'Inglés']
const categoriasIngreso = ['Salario', 'Inversiones', 'Negocios', 'Reembolsos']

export default function NuevaTransaccion({ onBack, onGuardada }) {
  const [tipo, setTipo] = useState('gasto')
  const [cuentas, setCuentas] = useState([])
  const [cuentaId, setCuentaId] = useState(null)
  const [monto, setMonto] = useState('')
  const [categoria, setCategoria] = useState(null)
  const [userId, setUserId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      setUserId(data.user.id)
      const cs = await obtenerCuentas(data.user.id)
      setCuentas(cs)
      if (cs.length > 0) setCuentaId(cs[0].id)
    })
  }, [])

  const categorias = tipo === 'gasto' ? categoriasGasto : categoriasIngreso
  const cuentaSeleccionada = cuentas.find(c => c.id === cuentaId)
  const valido = monto && parseFloat(monto) > 0 && categoria && cuentaId

  const handleGuardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await crearTransaccion({
        userId,
        cuentaId,
        categoriaNombre: categoria,
        tipo,
        monto: parseFloat(monto),
        descripcion: null,
        fecha: new Date().toISOString().slice(0, 10),
        cuentaSaldoActual: Number(cuentaSeleccionada.saldo)
      })
      onGuardada ? onGuardada() : onBack()
    } catch (err) {
      setError('No se pudo guardar. Intenta de nuevo.')
      console.error('[Kairen Finanzas] Error al guardar transacción:', err)
      setGuardando(false)
    }
  }

  return (
    <div style={{ padding: '16px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'transparent', color: 'var(--text-primary)', fontSize: 20 }}>←</button>
        <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Nueva Transacción</h1>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {['gasto', 'ingreso'].map(t => (
          <button
            key={t}
            onClick={() => { setTipo(t); setCategoria(null) }}
            style={{
              flex: 1, padding: 14, borderRadius: 'var(--radius-md)',
              background: tipo === t ? 'var(--gradient-brand)' : 'var(--bg-surface)',
              color: tipo === t ? '#fff' : 'var(--text-secondary)',
              fontWeight: 600, fontSize: 14,
              border: '1px solid ' + (tipo === t ? 'transparent' : 'var(--border-subtle)')
            }}
          >
            {t === 'gasto' ? '⊖ Gasto' : '⊕ Ingreso'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Cuenta</label>
        <InfoTooltip
          title="Cuenta"
          text="Elige de dónde sale el dinero (si es gasto) o a dónde entra (si es ingreso): Efectivo o Tarjeta."
        />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {cuentas.map(c => (
          <button
            key={c.id}
            onClick={() => setCuentaId(c.id)}
            style={{
              flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface)',
              border: '1.5px solid ' + (cuentaId === c.id ? 'var(--accent-blue)' : 'var(--border-subtle)'),
              textAlign: 'left'
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {c.tipo === 'tarjeta' ? '💳' : '💵'} {c.nombre}
            </div>
            <div style={{ fontSize: 12, color: 'var(--success)' }}>
              {Number(c.saldo).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
            </div>
          </button>
        ))}
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Monto</label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 20,
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)', padding: '14px 16px'
      }}>
        <span style={{ color: 'var(--text-muted)' }}>$</span>
        <input
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="0.00"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--text-primary)', fontSize: 16
          }}
        />
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Categoría</label>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0 24px', paddingBottom: 4 }}>
        {categorias.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoria(cat)}
            style={{
              flexShrink: 0, padding: '10px 16px', borderRadius: 999,
              background: categoria === cat ? 'var(--gradient-brand)' : 'var(--bg-surface)',
              color: categoria === cat ? '#fff' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600,
              border: '1px solid ' + (categoria === cat ? 'transparent' : 'var(--border-subtle)')
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <button
        disabled={!valido || guardando}
        onClick={handleGuardar}
        style={{
          width: '100%', padding: 16, borderRadius: 'var(--radius-md)',
          background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
          color: valido ? '#fff' : 'var(--text-muted)',
          fontWeight: 700, fontSize: 15
        }}
      >
        {guardando ? 'Guardando…' : valido ? 'Guardar transacción' : 'Ingresa un monto y categoría'}
      </button>
    </div>
  )
}