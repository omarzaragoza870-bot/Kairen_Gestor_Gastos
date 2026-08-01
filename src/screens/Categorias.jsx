import { useEffect, useState, useCallback, useMemo } from 'react'
import { obtenerCategorias, crearCategoria, eliminarCategoria } from '../lib/db.js'
import { useScrollLock } from '../hooks/useScrollLock.js'

const ICONOS = ['🏷️', '🍔', '🚗', '💡', '🎬', '👕', '🏥', '📚', '✈️', '🐾', '💰', '📈', '💼', '🎁', '↩️']

export default function Categorias({ userId, onBack }) {
  const [tab, setTab] = useState('gasto')
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [creando, setCreando] = useState(false)
  const [aEliminar, setAEliminar] = useState(null)
  const [procesando, setProcesando] = useState(false)
  useScrollLock(creando || Boolean(aEliminar))

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setLista(await obtenerCategorias(userId))
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las categorías.')
    } finally {
      setCargando(false)
    }
  }, [userId])

  useEffect(() => { cargar() }, [cargar])

  const filtradas = useMemo(() => lista.filter(c => c.tipo === tab), [lista, tab])

  const handleCrear = async (nombre, icono) => {
    setProcesando(true)
    setError(null)
    try {
      await crearCategoria({ userId, nombre, tipo: tab, icono })
      setCreando(false)
      await cargar()
    } catch (err) {
      setError(err.message || 'No se pudo crear la categoría.')
    } finally {
      setProcesando(false)
    }
  }

  const confirmarEliminar = async () => {
    if (!aEliminar) return
    setProcesando(true)
    try {
      await eliminarCategoria(aEliminar.id, userId)
      setAEliminar(null)
      await cargar()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar.')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} className="back-button">←</button>
        <h1>Administrar categorías</h1>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Si borras una categoría, tus transacciones anteriores conservan su nombre — no se rompen.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['gasto', 'Gasto'], ['ingreso', 'Ingreso']].map(([id, label]) => (
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

      {!cargando && filtradas.length === 0 && (
        <div className="empty-state"><p>No tienes categorías de {tab} todavía.</p></div>
      )}

      {filtradas.map(cat => (
        <div key={cat.id} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', marginBottom: 8
        }}>
          <span style={{ fontSize: 18 }}>{cat.icono || '🏷️'}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{cat.nombre}</span>
          <button onClick={() => setAEliminar(cat)} style={{ background: 'transparent', color: 'var(--danger)', fontSize: 18 }}>🗑️</button>
        </div>
      ))}

      <button
        onClick={() => setCreando(true)}
        style={{
          width: '100%', marginTop: 8, padding: 14, borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)',
          color: 'var(--accent-blue)', fontWeight: 600, fontSize: 14
        }}
      >
        + Agregar categoría de {tab === 'gasto' ? 'gasto' : 'ingreso'}
      </button>

      {creando && (
        <FormularioCategoria
          procesando={procesando}
          onCancelar={() => setCreando(false)}
          onGuardar={handleCrear}
        />
      )}

      {aEliminar && (
        <div onClick={() => !procesando && setAEliminar(null)} className="modal-backdrop">
          <div onClick={(e) => e.stopPropagation()} className="modal-card">
            <h3>¿Eliminar "{aEliminar.nombre}"?</h3>
            <p>Tus transacciones pasadas con esta categoría no se ven afectadas, pero ya no podrás elegirla en nuevos movimientos.</p>
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

function FormularioCategoria({ onCancelar, onGuardar, procesando }) {
  const [nombre, setNombre] = useState('')
  const [icono, setIcono] = useState(ICONOS[0])
  const valido = nombre.trim().length > 0

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 380 }}>
        <h3>Nueva categoría</h3>

        <label className="field-label">Icono</label>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0 16px', paddingBottom: 4 }}>
          {ICONOS.map(ic => (
            <button
              key={ic}
              onClick={() => setIcono(ic)}
              style={{
                flexShrink: 0, width: 40, height: 40, borderRadius: 'var(--radius-md)', fontSize: 18,
                background: icono === ic ? 'var(--gradient-brand)' : 'var(--bg-surface)',
                border: '1px solid ' + (icono === ic ? 'transparent' : 'var(--border-subtle)')
              }}
            >
              {ic}
            </button>
          ))}
        </div>

        <label className="field-label">Nombre</label>
        <div className="input-shell">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Mascotas, Suscripciones…" maxLength={30} autoFocus />
        </div>

        <div className="modal-actions" style={{ marginTop: 4 }}>
          <button onClick={onCancelar} disabled={procesando}>Cancelar</button>
          <button
            disabled={!valido || procesando}
            onClick={() => onGuardar(nombre.trim(), icono)}
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? '#fff' : 'var(--text-muted)' }}
          >
            {procesando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
