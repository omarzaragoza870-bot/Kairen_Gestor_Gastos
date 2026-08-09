import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerPresupuestos, guardarPresupuesto, eliminarPresupuesto, obtenerTransaccionesPorMes, obtenerCategorias } from '../lib/db.js'
import { agruparPorCategoria } from '../lib/estadisticas.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import Monto from '../components/Monto.jsx'
import CategoriaIcono from '../components/CategoriaIcono.jsx'
import { mensajeAmigable } from '../lib/errores.js'

export default function Presupuestos({ onBack }) {
  const { t } = usePreferencias()
  const [userId, setUserId] = useState(null)
  const [presupuestos, setPresupuestos] = useState([])
  const [categoriasGasto, setCategoriasGasto] = useState([])
  const [gastoPorCategoria, setGastoPorCategoria] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null) // null cerrado, {} nuevo, {...} editar
  const [aEliminar, setAEliminar] = useState(null)
  const [procesando, setProcesando] = useState(false)
  useScrollLock(editando !== null || Boolean(aEliminar))

  const cargar = useCallback(async (uid) => {
    setCargando(true)
    setError(null)
    try {
      const [pres, cats, txMes] = await Promise.all([
        obtenerPresupuestos(uid),
        obtenerCategorias(uid),
        obtenerTransaccionesPorMes(uid)
      ])
      setPresupuestos(pres)
      setCategoriasGasto(cats.filter(c => c.tipo === 'gasto'))
      setGastoPorCategoria(agruparPorCategoria(txMes, 'gasto'))
    } catch (err) {
      setError(mensajeAmigable(err))
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

  const gastoMap = useMemo(() => Object.fromEntries(gastoPorCategoria.map(g => [g.nombre, g.monto])), [gastoPorCategoria])

  const categoriasDisponibles = useMemo(() => {
    const yaUsadas = new Set(presupuestos.map(p => p.categoria_nombre))
    return categoriasGasto.filter(c => !yaUsadas.has(c.nombre))
  }, [categoriasGasto, presupuestos])

  const handleGuardar = async (categoriaNombre, montoLimite) => {
    setProcesando(true)
    setError(null)
    try {
      await guardarPresupuesto({ userId, categoriaNombre, montoLimite })
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
      await eliminarPresupuesto(aEliminar.id, userId)
      setAEliminar(null)
      await cargar(userId)
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
        <h1>{t('pr_titulo')}</h1>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>{t('pr_info')}</p>

      {error && <p className="error-message">{error}</p>}

      {!cargando && presupuestos.length === 0 && (
        <div className="empty-state"><p>{t('pr_vacio')}</p></div>
      )}

      {presupuestos.map(p => {
        const gastado = gastoMap[p.categoria_nombre] || 0
        const pct = Math.min(100, (gastado / Number(p.monto_limite)) * 100)
        const excedido = gastado > Number(p.monto_limite)
        const cerca = !excedido && pct >= 80
        const color = excedido ? 'var(--danger)' : cerca ? 'var(--warning)' : 'var(--gradient-brand)'

        return (
          <div key={p.id} style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)', padding: 16, marginBottom: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{p.categoria_nombre}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                <Monto valor={gastado} /> / <Monto valor={p.monto_limite} />
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-surface-2)', overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4 }} />
            </div>
            {excedido && <p style={{ fontSize: 12, color: 'var(--danger)', margin: '4px 0 8px', fontWeight: 600 }}>⚠️ {t('pr_excedido')}</p>}
            {cerca && <p style={{ fontSize: 12, color: 'var(--warning)', margin: '4px 0 8px', fontWeight: 600 }}>⚠️ {t('pr_cerca')}</p>}
            <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 4 }}>
              <button onClick={() => setEditando(p)} style={{ flex: 1, background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, padding: 6 }}>✏️ {t('comun_editar')}</button>
              <button onClick={() => setAEliminar(p)} style={{ flex: 1, background: 'transparent', color: 'var(--danger)', fontSize: 12, padding: 6 }}>🗑️ {t('comun_eliminar')}</button>
            </div>
          </div>
        )
      })}

      {categoriasDisponibles.length > 0 && (
        <button
          onClick={() => setEditando({})}
          style={{
            width: '100%', marginTop: 8, padding: 14, borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)',
            color: 'var(--accent-blue)', fontWeight: 600, fontSize: 14
          }}
        >
          + {t('pr_agregar')}
        </button>
      )}
      {categoriasDisponibles.length === 0 && categoriasGasto.length === 0 && !cargando && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>{t('pr_sin_categorias')}</p>
      )}

      {editando !== null && (
        <FormularioPresupuesto
          presupuesto={editando}
          categoriasDisponibles={categoriasDisponibles}
          procesando={procesando}
          onCancelar={() => setEditando(null)}
          onGuardar={handleGuardar}
        />
      )}

      {aEliminar && (
        <div onClick={() => !procesando && setAEliminar(null)} className="modal-backdrop">
          <div onClick={(e) => e.stopPropagation()} className="modal-card">
            <h3>{t('pr_eliminar_titulo')}</h3>
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

function FormularioPresupuesto({ presupuesto, categoriasDisponibles, onCancelar, onGuardar, procesando }) {
  const { t } = usePreferencias()
  const esNuevo = !presupuesto.id
  const [categoriaNombre, setCategoriaNombre] = useState(presupuesto.categoria_nombre || (categoriasDisponibles[0]?.nombre || ''))
  const [montoLimite, setMontoLimite] = useState(presupuesto.monto_limite ? String(presupuesto.monto_limite) : '')

  const montoNum = Number(montoLimite)
  const valido = categoriaNombre && Number.isFinite(montoNum) && montoNum > 0

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 380 }}>
        <h3>{esNuevo ? t('pr_nuevo') : t('pr_editar_titulo')}</h3>

        <label className="field-label">{t('pr_categoria')}</label>
        {esNuevo ? (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0 16px', paddingBottom: 4 }}>
            {categoriasDisponibles.map(c => (
              <button
                key={c.id}
                onClick={() => setCategoriaNombre(c.nombre)}
                style={{
                  flexShrink: 0, padding: '10px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                  background: categoriaNombre === c.nombre ? 'var(--gradient-brand)' : 'var(--bg-surface)',
                  color: categoriaNombre === c.nombre ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid ' + (categoriaNombre === c.nombre ? 'transparent' : 'var(--border-subtle)'),
                  display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <CategoriaIcono icono={c.icono || 'Tag'} size={14} color={categoriaNombre === c.nombre ? '#fff' : 'var(--text-muted)'} />
                {c.nombre}
              </button>
            ))}
          </div>
        ) : (
          <div className="input-shell" style={{ marginBottom: 16 }}>
            <input value={categoriaNombre} disabled />
          </div>
        )}

        <label className="field-label">{t('pr_limite')}</label>
        <div className="input-shell">
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input inputMode="decimal" value={montoLimite} onChange={(e) => setMontoLimite(e.target.value.replace(',', '.'))} placeholder="0.00" autoFocus />
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button onClick={onCancelar} disabled={procesando}>{t('comun_cancelar')}</button>
          <button
            disabled={!valido || procesando}
            onClick={() => onGuardar(categoriaNombre, montoNum)}
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? '#fff' : 'var(--text-muted)' }}
          >
            {procesando ? t('comun_guardando') : t('comun_guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}
