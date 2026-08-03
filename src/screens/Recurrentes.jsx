import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerRecurrentes, crearRecurrente, editarRecurrente, eliminarRecurrente, obtenerCuentas, obtenerCategorias } from '../lib/db.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { mensajeAmigable } from '../lib/errores.js'
import Monto from '../components/Monto.jsx'

const FRECUENCIAS = [
  { id: 'diario',    label: 'Diario',     emoji: '📅' },
  { id: 'semanal',   label: 'Semanal',    emoji: '📆' },
  { id: 'quincenal', label: 'Quincenal',  emoji: '🗓️' },
  { id: 'mensual',   label: 'Mensual',    emoji: '📊' },
  { id: 'anual',     label: 'Anual',      emoji: '🎯' },
]

const hoy = () => new Date().toISOString().slice(0, 10)

export default function Recurrentes({ onBack }) {
  const { t } = usePreferencias()
  const [lista, setLista] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null)
  const [aEliminar, setAEliminar] = useState(null)
  const [procesando, setProcesando] = useState(false)
  const [userId, setUserId] = useState(null)
  useScrollLock(editando !== null || Boolean(aEliminar))

  const cargar = useCallback(async (uid) => {
    setCargando(true)
    setError(null)
    try {
      const [recs, ctas, cats] = await Promise.all([
        obtenerRecurrentes(uid),
        obtenerCuentas(uid),
        obtenerCategorias(uid)
      ])
      setLista(recs)
      setCuentas(ctas)
      setCategorias(cats)
    } catch (err) {
      setError(mensajeAmigable(err))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id
      if (uid) { setUserId(uid); cargar(uid) }
    })
  }, [cargar])

  const handleGuardar = async (form) => {
    setProcesando(true)
    setError(null)
    try {
      const cuenta = cuentas.find(c => c.id === form.cuentaId)
      if (form.id) {
        await editarRecurrente({ ...form, userId, cuentaNombre: cuenta?.nombre || '', activa: form.activa ?? true })
      } else {
        await crearRecurrente({ ...form, userId, cuentaNombre: cuenta?.nombre || '' })
      }
      setEditando(null)
      await cargar(userId)
    } catch (err) {
      setError(mensajeAmigable(err))
    } finally {
      setProcesando(false)
    }
  }

  const confirmarEliminar = async () => {
    if (!aEliminar) return
    setProcesando(true)
    try {
      await eliminarRecurrente(aEliminar.id, userId)
      setAEliminar(null)
      await cargar(userId)
    } catch (err) {
      setError(mensajeAmigable(err))
    } finally {
      setProcesando(false)
    }
  }

  const freq = (id) => FRECUENCIAS.find(f => f.id === id) || FRECUENCIAS[3]

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} className="back-button">←</button>
        <h1>Transacciones Recurrentes</h1>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Netflix, renta, sueldo… regístralos una vez y se crean solos cada vez que toca.
      </p>

      {error && <p className="error-message">{error}</p>}

      {!cargando && lista.length === 0 && (
        <div className="empty-state">
          <p>Aún no tienes transacciones recurrentes.</p>
          <small>Agrega la primera con el botón de abajo.</small>
        </div>
      )}

      {lista.map(r => (
        <div key={r.id} style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
          border: `1px solid ${r.activa ? 'var(--border-subtle)' : 'var(--bg-surface-2)'}`,
          padding: 14, marginBottom: 10, opacity: r.activa ? 1 : 0.5
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{freq(r.frecuencia).emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{r.categoria_nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {freq(r.frecuencia).label} · {r.cuenta_nombre} · próx: {r.proxima_fecha}
              </div>
              {r.descripcion && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.descripcion}</div>}
            </div>
            <div style={{ fontWeight: 700, color: r.tipo === 'gasto' ? 'var(--danger)' : 'var(--success)', fontSize: 14 }}>
              {r.tipo === 'gasto' ? '-' : '+'}<Monto valor={r.monto} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 10 }}>
            <button onClick={() => setEditando(r)} style={{ flex: 1, background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, padding: 6 }}>✏️ Editar</button>
            <button onClick={() => handleGuardar({ ...r, activa: !r.activa })} style={{ flex: 1, background: 'transparent', color: r.activa ? 'var(--warning)' : 'var(--success)', fontSize: 12, padding: 6 }}>
              {r.activa ? '⏸️ Pausar' : '▶️ Activar'}
            </button>
            <button onClick={() => setAEliminar(r)} style={{ flex: 1, background: 'transparent', color: 'var(--danger)', fontSize: 12, padding: 6 }}>🗑️ Eliminar</button>
          </div>
        </div>
      ))}

      <button
        onClick={() => setEditando({})}
        style={{
          width: '100%', marginTop: 8, padding: 14, borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)',
          color: 'var(--accent-blue)', fontWeight: 600, fontSize: 14
        }}
      >
        + Agregar recurrente
      </button>

      {editando !== null && (
        <FormularioRecurrente
          recurrente={editando}
          cuentas={cuentas}
          categorias={categorias}
          procesando={procesando}
          onCancelar={() => setEditando(null)}
          onGuardar={handleGuardar}
        />
      )}

      {aEliminar && (
        <div onClick={() => !procesando && setAEliminar(null)} className="modal-backdrop">
          <div onClick={e => e.stopPropagation()} className="modal-card">
            <h3>¿Eliminar esta recurrente?</h3>
            <p>Se eliminará "{aEliminar.categoria_nombre}". Las transacciones ya creadas no se borran.</p>
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

function FormularioRecurrente({ recurrente, cuentas, categorias, onCancelar, onGuardar, procesando }) {
  const esNuevo = !recurrente.id
  const [tipo, setTipo] = useState(recurrente.tipo || 'gasto')
  const [cuentaId, setCuentaId] = useState(recurrente.cuenta_id || cuentas[0]?.id || '')
  const [categoriaNombre, setCategoriaNombre] = useState(recurrente.categoria_nombre || '')
  const [monto, setMonto] = useState(recurrente.monto ? String(recurrente.monto) : '')
  const [descripcion, setDescripcion] = useState(recurrente.descripcion || '')
  const [frecuencia, setFrecuencia] = useState(recurrente.frecuencia || 'mensual')
  const [proximaFecha, setProximaFecha] = useState(recurrente.proxima_fecha || hoy())

  const catsFiltradas = categorias.filter(c => c.tipo === tipo)
  const montoNum = Number(monto)
  const valido = cuentaId && categoriaNombre && Number.isFinite(montoNum) && montoNum > 0 && proximaFecha

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={e => e.stopPropagation()} className="modal-card" style={{ maxWidth: 400, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3>{esNuevo ? 'Nueva recurrente' : 'Editar recurrente'}</h3>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['gasto', 'ingreso'].map(op => (
            <button key={op} onClick={() => { setTipo(op); setCategoriaNombre('') }}
              style={{
                flex: 1, padding: 10, borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 13,
                background: tipo === op ? 'var(--gradient-brand)' : 'var(--bg-surface)',
                color: tipo === op ? '#fff' : 'var(--text-secondary)',
                border: '1px solid ' + (tipo === op ? 'transparent' : 'var(--border-subtle)')
              }}>
              {op === 'gasto' ? '⊖ Gasto' : '⊕ Ingreso'}
            </button>
          ))}
        </div>

        <label className="field-label">Cuenta</label>
        <select value={cuentaId} onChange={e => setCuentaId(e.target.value)}
          style={{ width: '100%', padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', marginBottom: 14 }}>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>

        <label className="field-label">Categoría</label>
        <select value={categoriaNombre} onChange={e => setCategoriaNombre(e.target.value)}
          style={{ width: '100%', padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', marginBottom: 14 }}>
          <option value="">Elige una categoría</option>
          {catsFiltradas.map(c => <option key={c.id} value={c.nombre}>{c.icono} {c.nombre}</option>)}
        </select>

        <label className="field-label">Monto</label>
        <div className="input-shell" style={{ marginBottom: 14 }}>
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value.replace(',', '.'))} placeholder="0.00" />
        </div>

        <label className="field-label">Descripción (opcional)</label>
        <div className="input-shell" style={{ marginBottom: 14 }}>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej. Netflix, Renta, Sueldo…" maxLength={80} />
        </div>

        <label className="field-label">Frecuencia</label>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '8px 0 14px', paddingBottom: 4 }}>
          {FRECUENCIAS.map(f => (
            <button key={f.id} onClick={() => setFrecuencia(f.id)}
              style={{
                flexShrink: 0, padding: '8px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: frecuencia === f.id ? 'var(--gradient-brand)' : 'var(--bg-surface)',
                color: frecuencia === f.id ? '#fff' : 'var(--text-secondary)',
                border: '1px solid ' + (frecuencia === f.id ? 'transparent' : 'var(--border-subtle)')
              }}>
              {f.emoji} {f.label}
            </button>
          ))}
        </div>

        <label className="field-label">Próxima fecha</label>
        <div className="input-shell" style={{ marginBottom: 16 }}>
          <input type="date" value={proximaFecha} onChange={e => setProximaFecha(e.target.value)} />
        </div>

        <div className="modal-actions">
          <button onClick={onCancelar} disabled={procesando}>Cancelar</button>
          <button
            disabled={!valido || procesando}
            onClick={() => onGuardar({ id: recurrente.id, cuentaId, tipo, categoriaNombre, monto: montoNum, descripcion, frecuencia, proximaFecha })}
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? '#fff' : 'var(--text-muted)' }}
          >
            {procesando ? 'Guardando…' : esNuevo ? 'Crear' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
