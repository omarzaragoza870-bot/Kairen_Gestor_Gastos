import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerAhorroExterno, crearAhorroExterno, editarAhorroExterno, eliminarAhorroExterno } from '../lib/db.js'
import InfoTooltip from '../components/InfoTooltip.jsx'

const fmt = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const hoy = () => new Date().toISOString().slice(0, 10)
const fmtFecha = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

export default function AhorroExterno() {
  const [userId, setUserId] = useState(null)
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null) // null = cerrado, {} = nuevo, {...registro} = editar
  const [aEliminar, setAEliminar] = useState(null)
  const [procesando, setProcesando] = useState(false)

  const cargar = useCallback(async (uid) => {
    setCargando(true)
    setError(null)
    try {
      setLista(await obtenerAhorroExterno(uid))
    } catch (err) {
      setError(err.message || 'No se pudo cargar tu ahorro externo.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id)
        cargar(data.user.id)
      }
    })
  }, [cargar])

  const total = lista.reduce((acc, r) => acc + Number(r.monto), 0)

  const handleGuardar = async (form) => {
    setProcesando(true)
    setError(null)
    try {
      if (form.id) {
        await editarAhorroExterno({ id: form.id, userId, nombreBanco: form.nombreBanco, monto: form.monto, fechaRegistro: form.fechaRegistro, nota: form.nota })
      } else {
        await crearAhorroExterno({ userId, nombreBanco: form.nombreBanco, monto: form.monto, fechaRegistro: form.fechaRegistro, nota: form.nota })
      }
      setEditando(null)
      await cargar(userId)
    } catch (err) {
      setError(err.message || 'No se pudo guardar el registro.')
    } finally {
      setProcesando(false)
    }
  }

  const confirmarEliminar = async () => {
    if (!aEliminar) return
    setProcesando(true)
    try {
      await eliminarAhorroExterno(aEliminar.id, userId)
      setAEliminar(null)
      await cargar(userId)
    } catch (err) {
      setError(err.message || 'No se pudo eliminar.')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Ahorro externo</h1>
        <InfoTooltip
          title="Ahorro externo"
          text="Aquí solo anotas cuánto llevas en tus cuentas de banco reales (fuera de la app), como referencia visual. No afecta tu Dinero Disponible ni tus Metas — es 100% informativo."
        />
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
        Solo para llevar el registro — no mueve dinero real ni afecta tus otras cuentas.
      </p>

      <div style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)', padding: 20, marginBottom: 20
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total registrado</span>
        <div style={{
          fontSize: 28, fontWeight: 800, marginTop: 4,
          backgroundImage: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', color: 'transparent'
        }}>
          {cargando ? '…' : fmt(total)}
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      {!cargando && lista.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)',
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: 16
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏦</div>
          <p style={{ fontSize: 14, margin: 0 }}>Aún no tienes registros.</p>
          <p style={{ fontSize: 13, margin: '4px 0 0' }}>Agrega el saldo que llevas en tu banco.</p>
        </div>
      )}

      {lista.map(r => (
        <div key={r.id} style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', padding: '14px 16px', marginBottom: 10
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.nombre_banco}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtFecha(r.fecha_registro)}</div>
              {r.nota && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{r.nota}</div>}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{fmt(r.monto)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
            <button onClick={() => setEditando(r)} style={{ flex: 1, background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, padding: 6 }}>✏️ Editar</button>
            <button onClick={() => setAEliminar(r)} style={{ flex: 1, background: 'transparent', color: 'var(--danger)', fontSize: 12, padding: 6 }}>🗑️ Eliminar</button>
          </div>
        </div>
      ))}

      <button
        onClick={() => setEditando({})}
        aria-label="Agregar registro de ahorro"
        style={{
          position: 'fixed', right: 20, bottom: 92,
          width: 56, height: 56, borderRadius: 16,
          background: 'var(--gradient-brand)', color: '#fff',
          fontSize: 26, fontWeight: 700, boxShadow: '0 8px 24px rgba(79,107,255,0.4)'
        }}
      >
        +
      </button>

      {editando !== null && (
        <FormularioAhorro
          registro={editando}
          guardando={procesando}
          onCancelar={() => setEditando(null)}
          onGuardar={handleGuardar}
        />
      )}

      {aEliminar && (
        <div onClick={() => !procesando && setAEliminar(null)} className="modal-backdrop">
          <div onClick={(e) => e.stopPropagation()} className="modal-card">
            <h3>¿Eliminar este registro?</h3>
            <p>Se eliminará "{aEliminar.nombre_banco}" por {fmt(aEliminar.monto)}. Esto no afecta tu Dinero Disponible ni tus Metas.</p>
            <div className="modal-actions">
              <button onClick={() => setAEliminar(null)} disabled={procesando}>Cancelar</button>
              <button className="danger-button" onClick={confirmarEliminar} disabled={procesando}>
                {procesando ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FormularioAhorro({ registro, onCancelar, onGuardar, guardando }) {
  const [nombreBanco, setNombreBanco] = useState(registro.nombre_banco || '')
  const [monto, setMonto] = useState(registro.monto ? String(registro.monto) : '')
  const [fechaRegistro, setFechaRegistro] = useState(registro.fecha_registro || hoy())
  const [nota, setNota] = useState(registro.nota || '')

  const montoNumerico = Number(monto)
  const valido = nombreBanco.trim().length > 0 && Number.isFinite(montoNumerico) && montoNumerico > 0

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 400 }}>
        <h3>{registro.id ? 'Editar registro' : 'Nuevo registro de ahorro'}</h3>

        <label className="field-label">Banco / Institución</label>
        <div className="input-shell">
          <input value={nombreBanco} onChange={(e) => setNombreBanco(e.target.value)} placeholder="Ej. Nu, BBVA, Efectivo en casa…" maxLength={60} />
        </div>

        <label className="field-label">Monto que llevas</label>
        <div className="input-shell">
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(',', '.'))} placeholder="0.00" />
        </div>

        <label className="field-label">Fecha</label>
        <div className="input-shell">
          <input type="date" value={fechaRegistro} onChange={(e) => setFechaRegistro(e.target.value)} />
        </div>

        <label className="field-label">Nota (opcional)</label>
        <div className="input-shell">
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={100} placeholder="Ej. Fondo de emergencia" />
        </div>

        <div className="modal-actions" style={{ marginTop: 4 }}>
          <button onClick={onCancelar} disabled={guardando}>Cancelar</button>
          <button
            disabled={!valido || guardando}
            onClick={() => onGuardar({ id: registro.id, nombreBanco: nombreBanco.trim(), monto: montoNumerico, fechaRegistro, nota: nota.trim() })}
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? '#fff' : 'var(--text-muted)' }}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
