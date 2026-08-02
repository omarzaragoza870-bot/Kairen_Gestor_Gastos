import { useEffect, useState, useCallback, useMemo } from 'react'
import { obtenerCategorias, crearCategoria, eliminarCategoria } from '../lib/db.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { mensajeAmigable } from '../lib/errores.js'

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
  const { t } = usePreferencias()

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setLista(await obtenerCategorias(userId))
    } catch (err) {
      setError(mensajeAmigable(err))
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
      setError(mensajeAmigable(err))
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
      setError(mensajeAmigable(err))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} className="back-button">←</button>
        <h1>{t('cat_titulo')}</h1>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        {t('cat_info')}
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['gasto', t('cat_tab_gasto')], ['ingreso', t('cat_tab_ingreso')]].map(([id, label]) => (
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
        <div className="empty-state"><p>{t('cat_vacio')}</p></div>
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
        + {t('cat_agregar')} ({tab === 'gasto' ? t('cat_tab_gasto') : t('cat_tab_ingreso')})
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
            <h3>{t('cat_eliminar_titulo')}</h3>
            <p>{t('cat_eliminar_info')}</p>
            <div className="modal-actions">
              <button onClick={() => setAEliminar(null)} disabled={procesando}>{t('comun_cancelar')}</button>
              <button className="danger-button" onClick={confirmarEliminar} disabled={procesando}>
                {procesando ? t('comun_eliminando') : t('comun_si_eliminar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FormularioCategoria({ onCancelar, onGuardar, procesando }) {
  const { t } = usePreferencias()
  const [nombre, setNombre] = useState('')
  const [icono, setIcono] = useState(ICONOS[0])
  const valido = nombre.trim().length > 0

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 380 }}>
        <h3>{t('cat_nueva')}</h3>

        <label className="field-label">{t('metas_icono')}</label>
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

        <label className="field-label">{t('cat_nombre')}</label>
        <div className="input-shell">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('cat_nombre_placeholder')} maxLength={30} autoFocus />
        </div>

        <div className="modal-actions" style={{ marginTop: 4 }}>
          <button onClick={onCancelar} disabled={procesando}>{t('comun_cancelar')}</button>
          <button
            disabled={!valido || procesando}
            onClick={() => onGuardar(nombre.trim(), icono)}
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? '#fff' : 'var(--text-muted)' }}
          >
            {procesando ? t('comun_guardando') : t('comun_guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}