import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import {
  asegurarCuentasPorDefecto,
  crearTransaccion,
  editarTransaccion,
  obtenerCuentas
} from '../lib/db.js'
import InfoTooltip from '../components/InfoTooltip.jsx'
import Monto from '../components/Monto.jsx'

const categoriasGasto = ['Alimentación', 'Transporte', 'Servicios', 'Entretenimiento', 'Ropa', 'Inglés', 'Salud', 'Otros']
const categoriasIngreso = ['Salario', 'Inversiones', 'Negocios', 'Reembolsos', 'Regalos', 'Otros']
const hoy = () => {
  const fecha = new Date()

  const año = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")

  return `${año}-${mes}-${dia}`
}
export default function NuevaTransaccion({ onBack, onGuardada, transaccionEditar = null }) {
  const editando = Boolean(transaccionEditar)
  const [tipo, setTipo] = useState(transaccionEditar?.tipo || 'gasto')
  const [cuentas, setCuentas] = useState([])
  const [cuentaId, setCuentaId] = useState(transaccionEditar?.cuenta_id || null)
  const [monto, setMonto] = useState(transaccionEditar ? String(transaccionEditar.monto) : '')
  const [categoria, setCategoria] = useState(transaccionEditar?.categoria_nombre || null)
  const [descripcion, setDescripcion] = useState(transaccionEditar?.descripcion || '')
  const [fecha, setFecha] = useState(transaccionEditar?.fecha || hoy())
  const [userId, setUserId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const cargarCuentas = async () => {
      setError(null)
      try {
        const { data, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!data.user) throw new Error('No encontramos una sesión activa.')

        setUserId(data.user.id)
        await asegurarCuentasPorDefecto(data.user.id)
        const lista = await obtenerCuentas(data.user.id)
        setCuentas(lista)

        if (!cuentaId && lista.length > 0) setCuentaId(lista[0].id)
        if (lista.length === 0) throw new Error('No se pudieron cargar las cuentas Efectivo y Tarjeta.')
      } catch (err) {
        console.error('[Kairen Finanzas] Error cargando cuentas:', err)
        setError(err.message || 'No se pudieron cargar tus cuentas.')
      }
    }
    cargarCuentas()
  }, [])

  const categorias = tipo === 'gasto' ? categoriasGasto : categoriasIngreso
  const cuentaSeleccionada = cuentas.find(c => c.id === cuentaId)
  const montoNumerico = Number(monto)
  const valido = Number.isFinite(montoNumerico) && montoNumerico > 0 && Boolean(categoria) && Boolean(cuentaId) && Boolean(userId) && Boolean(cuentaSeleccionada) && Boolean(fecha)

  const etiquetaBoton = useMemo(() => {
    if (guardando) return editando ? 'Guardando cambios…' : 'Guardando…'
    if (!valido) return 'Completa monto, categoría y fecha'
    return editando ? 'Guardar cambios' : 'Guardar transacción'
  }, [editando, guardando, valido])

  const handleGuardar = async () => {
    if (!valido || guardando) return
    setGuardando(true)
    setError(null)

    try {
      const comunes = {
        cuentaId,
        categoriaNombre: categoria,
        tipo,
        monto: montoNumerico,
        descripcion: descripcion.trim() || null,
        fecha
      }

      if (editando) {
        await editarTransaccion({ transaccionId: transaccionEditar.id, ...comunes })
      } else {
        await crearTransaccion({
          userId,
          cuentaSaldoActual: Number(cuentaSeleccionada.saldo),
          ...comunes
        })
      }
      onGuardada?.()
    } catch (err) {
      console.error('[Kairen Finanzas] Error guardando transacción:', err)
      setError(err.message || 'No se pudo guardar. Intenta de nuevo.')
      setGuardando(false)
    }
  }

  return (
    <div style={{ padding: '16px 16px 40px', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} aria-label="Volver" style={{ background: 'transparent', color: 'var(--text-primary)', fontSize: 20 }}>←</button>
        <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{editando ? 'Editar Transacción' : 'Nueva Transacción'}</h1>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {['gasto', 'ingreso'].map(t => (
          <button key={t} onClick={() => { setTipo(t); setCategoria(null) }} style={{
            flex: 1, padding: 14, borderRadius: 'var(--radius-md)',
            background: tipo === t ? 'var(--gradient-brand)' : 'var(--bg-surface)',
            color: tipo === t ? '#fff' : 'var(--text-secondary)', fontWeight: 600, fontSize: 14,
            border: '1px solid ' + (tipo === t ? 'transparent' : 'var(--border-subtle)')
          }}>
            {t === 'gasto' ? '⊖ Gasto' : '⊕ Ingreso'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Cuenta</label>
        <InfoTooltip title="Cuenta" text="Elige de dónde sale el dinero o a dónde entra." />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {cuentas.length === 0 && <div className="empty-inline">Cargando cuentas…</div>}
        {cuentas.map(c => (
          <button key={c.id} onClick={() => setCuentaId(c.id)} style={{
            flex: 1, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)',
            border: '1.5px solid ' + (cuentaId === c.id ? 'var(--accent-blue)' : 'var(--border-subtle)'), textAlign: 'left'
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.tipo === 'tarjeta' ? '💳' : '💵'} {c.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--success)' }}><Monto valor={c.saldo} /></div>
          </button>
        ))}
      </div>

      <label className="field-label">Monto</label>
      <div className="input-shell">
        <span style={{ color: 'var(--text-muted)' }}>$</span>
        <input inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value.replace(',', '.'))} placeholder="0.00" />
      </div>

      <label className="field-label">Categoría</label>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0 20px', paddingBottom: 4 }}>
        {categorias.map(cat => (
          <button key={cat} onClick={() => setCategoria(cat)} style={{
            flexShrink: 0, padding: '10px 16px', borderRadius: 999,
            background: categoria === cat ? 'var(--gradient-brand)' : 'var(--bg-surface)',
            color: categoria === cat ? '#fff' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
            border: '1px solid ' + (categoria === cat ? 'transparent' : 'var(--border-subtle)')
          }}>{cat}</button>
        ))}
      </div>

      <label className="field-label">Descripción <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
      <div className="input-shell" style={{ marginTop: 8 }}>
        <input value={descripcion} onChange={e => setDescripcion(e.target.value)} maxLength={120} placeholder="Ej. Comida con clientes" />
      </div>

      <label className="field-label">Fecha</label>
      <div className="input-shell" style={{ marginTop: 8 }}>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
      </div>

      {error && <p className="error-message">{error}</p>}

      <button disabled={!valido || guardando} onClick={handleGuardar} className="primary-button" style={{
        background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
        color: valido ? '#fff' : 'var(--text-muted)'
      }}>{etiquetaBoton}</button>
    </div>
  )
}