import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerMetas, crearMeta, editarMeta, marcarMetaCompletada, eliminarMeta } from '../lib/db.js'
import { useScrollLock } from '../hooks/useScrollLock.js'

const fmt = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtFecha = (f) => f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : null

const ICONOS = ['🎯', '✈️', '🏠', '🚗', '💍', '🎓', '💻', '🏥', '🐾', '🎉', '📱', '💰']
const PRIORIDADES = [
  ['baja', 'Baja', 'var(--text-secondary)'],
  ['media', 'Media', 'var(--warning)'],
  ['alta', 'Alta', 'var(--danger)']
]

export default function Metas() {
  const [userId, setUserId] = useState(null)
  const [tab, setTab] = useState('activas')
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null)
  const [aEliminar, setAEliminar] = useState(null)
  useScrollLock(editando !== null || Boolean(aEliminar))
  const [procesando, setProcesando] = useState(false)

  const cargar = useCallback(async (uid) => {
    setCargando(true)
    setError(null)
    try {
      setLista(await obtenerMetas(uid))
    } catch (err) {
      setError(err.message || 'No se pudieron cargar tus metas.')
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

  const activas = useMemo(() => lista.filter(m => !m.completada), [lista])
  const completadas = useMemo(() => lista.filter(m => m.completada), [lista])
  const mostrar = tab === 'activas' ? activas : completadas

  const handleGuardar = async (form) => {
    setProcesando(true)
    setError(null)
    try {
      if (form.id) {
        await editarMeta({ id: form.id, userId, ...form })
      } else {
        await crearMeta({ userId, ...form })
      }
      setEditando(null)
      await cargar(userId)
    } catch (err) {
      setError(err.message || 'No se pudo guardar la meta.')
    } finally {
      setProcesando(false)
    }
  }

  const handleToggleCompletada = async (meta) => {
    try {
      await marcarMetaCompletada(meta.id, userId, !meta.completada)
      await cargar(userId)
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la meta.')
    }
  }

  const confirmarEliminar = async () => {
    if (!aEliminar) return
    setProcesando(true)
    try {
      await eliminarMeta(aEliminar.id, userId)
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
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>Metas</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['activas', `Activas${activas.length ? ` (${activas.length})` : ''}`], ['completadas', `Completadas${completadas.length ? ` (${completadas.length})` : ''}`]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 999,
              background: tab === id ? 'var(--gradient-brand)' : 'var(--bg-surface)',
              color: tab === id ? '#fff' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600, border: '1px solid ' + (tab === id ? 'transparent' : 'var(--border-subtle)')
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="error-message">{error}</p>}

      {!cargando && mostrar.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)',
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
          <p style={{ fontSize: 14, margin: 0 }}>
            {tab === 'activas' ? 'No tienes metas activas.' : 'Aún no completas ninguna meta.'}
          </p>
          {tab === 'activas' && <p style={{ fontSize: 13, margin: '4px 0 0' }}>Crea tu primera meta para comenzar.</p>}
        </div>
      )}

      {mostrar.map(meta => {
        const pct = Math.min(100, (Number(meta.monto_actual) / Number(meta.monto_objetivo)) * 100)
        const prioridad = PRIORIDADES.find(p => p[0] === meta.prioridad) || PRIORIDADES[1]
        return (
          <div key={meta.id} style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)', padding: 16, marginBottom: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{meta.icono || '🎯'}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{meta.nombre}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: prioridad[2], border: `1px solid ${prioridad[2]}`, borderRadius: 999, padding: '1px 8px' }}>
                      {prioridad[1]}
                    </span>
                  </div>
                  {meta.descripcion && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{meta.descripcion}</div>}
                  {meta.fecha_limite && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Meta: {fmtFecha(meta.fecha_limite)}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(meta.monto_actual)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>de {fmt(meta.monto_objetivo)}</div>
              </div>
            </div>

            <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-surface-2)', overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: meta.completada ? 'var(--success)' : 'var(--gradient-brand)', borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginBottom: 10 }}>{pct.toFixed(0)}%</div>

            <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
              <button onClick={() => setEditando(meta)} style={{ flex: 1, background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, padding: 6 }}>✏️ Editar</button>
              <button onClick={() => handleToggleCompletada(meta)} style={{ flex: 1, background: 'transparent', color: 'var(--success)', fontSize: 12, padding: 6 }}>
                {meta.completada ? '↩️ Reactivar' : '✅ Marcar completa'}
              </button>
              <button onClick={() => setAEliminar(meta)} style={{ flex: 1, background: 'transparent', color: 'var(--danger)', fontSize: 12, padding: 6 }}>🗑️ Eliminar</button>
            </div>
          </div>
        )
      })}

      <button
        onClick={() => setEditando({})}
        aria-label="Crear meta"
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
        <FormularioMeta
          meta={editando}
          guardando={procesando}
          onCancelar={() => setEditando(null)}
          onGuardar={handleGuardar}
        />
      )}

      {aEliminar && (
        <div onClick={() => !procesando && setAEliminar(null)} className="modal-backdrop">
          <div onClick={(e) => e.stopPropagation()} className="modal-card">
            <h3>¿Eliminar esta meta?</h3>
            <p>Se eliminará "{aEliminar.nombre}" por completo. Esta acción no se puede deshacer.</p>
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

function FormularioMeta({ meta, onCancelar, onGuardar, guardando }) {
  const esNueva = !meta.id
  const [nombre, setNombre] = useState(meta.nombre || '')
  const [descripcion, setDescripcion] = useState(meta.descripcion || '')
  const [icono, setIcono] = useState(meta.icono || '🎯')
  const [prioridad, setPrioridad] = useState(meta.prioridad || 'media')
  const [montoObjetivo, setMontoObjetivo] = useState(meta.monto_objetivo ? String(meta.monto_objetivo) : '')
  const [montoActual, setMontoActual] = useState(meta.monto_actual ? String(meta.monto_actual) : '0')
  const [fechaLimite, setFechaLimite] = useState(meta.fecha_limite || '')

  const objetivoNum = Number(montoObjetivo)
  const actualNum = Number(montoActual)
  const valido = nombre.trim().length > 0 && Number.isFinite(objetivoNum) && objetivoNum > 0 && Number.isFinite(actualNum) && actualNum >= 0

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 420, maxHeight: '85vh', overflowY: 'auto' }}>
        <h3>{esNueva ? 'Nueva meta' : 'Editar meta'}</h3>

        <label className="field-label">Icono</label>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0 16px', paddingBottom: 4 }}>
          {ICONOS.map(ic => (
            <button
              key={ic}
              onClick={() => setIcono(ic)}
              style={{
                flexShrink: 0, width: 44, height: 44, borderRadius: 'var(--radius-md)', fontSize: 20,
                background: icono === ic ? 'var(--gradient-brand)' : 'var(--bg-surface)',
                border: '1px solid ' + (icono === ic ? 'transparent' : 'var(--border-subtle)')
              }}
            >
              {ic}
            </button>
          ))}
        </div>

        <label className="field-label">Título de la meta</label>
        <div className="input-shell">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Vacaciones, Fondo de emergencia…" maxLength={40} />
        </div>

        <label className="field-label">Descripción (opcional)</label>
        <div className="input-shell">
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalles de tu meta" maxLength={80} />
        </div>

        <label className="field-label">Monto objetivo</label>
        <div className="input-shell">
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input inputMode="decimal" value={montoObjetivo} onChange={(e) => setMontoObjetivo(e.target.value.replace(',', '.'))} placeholder="0.00" />
        </div>

        <label className="field-label">Fecha objetivo (opcional)</label>
        <div className="input-shell">
          <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
        </div>

        <label className="field-label">Prioridad</label>
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px' }}>
          {PRIORIDADES.map(([id, label, color]) => (
            <button
              key={id}
              onClick={() => setPrioridad(id)}
              style={{
                flex: 1, padding: 12, borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 13,
                background: prioridad === id ? color : 'var(--bg-surface)',
                color: prioridad === id ? '#fff' : 'var(--text-secondary)',
                border: '1px solid ' + (prioridad === id ? 'transparent' : 'var(--border-subtle)')
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="field-label">{esNueva ? 'Aporte inicial (opcional)' : 'Cuánto llevas ahorrado'}</label>
        <div className="input-shell">
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input inputMode="decimal" value={montoActual} onChange={(e) => setMontoActual(e.target.value.replace(',', '.'))} placeholder="0.00" />
        </div>

        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button onClick={onCancelar} disabled={guardando}>Cancelar</button>
          <button
            disabled={!valido || guardando}
            onClick={() => onGuardar({
              id: meta.id,
              nombre: nombre.trim(),
              descripcion: descripcion.trim(),
              icono,
              prioridad,
              montoObjetivo: objetivoNum,
              montoActual: actualNum,
              fechaLimite
            })}
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? '#fff' : 'var(--text-muted)' }}
          >
            {guardando ? 'Guardando…' : esNueva ? 'Crear Meta' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}