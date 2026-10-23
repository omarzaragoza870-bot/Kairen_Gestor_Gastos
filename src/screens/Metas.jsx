import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerMetas, crearMeta, editarMeta, marcarMetaCompletada, eliminarMeta } from '../lib/db.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import MetaDetalle from './MetaDetalle.jsx'
import Monto from '../components/Monto.jsx'
import CategoriaIcono, { ICONOS_DISPONIBLES } from '../components/CategoriaIcono.jsx'
import SelectorIcono from '../components/SelectorIcono.jsx'
import { Pencil, Trash2, CheckCircle2, RotateCcw, Target } from 'lucide-react'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { conRespaldoOffline } from '../lib/offline.js'
import { mensajeAmigable } from '../lib/errores.js'

const fmt = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtFecha = (f) => f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : null

const PRIORIDADES_IDS = [
  ['baja', 'var(--text-secondary)'],
  ['media', 'var(--warning)'],
  ['alta', 'var(--danger)']
]

export default function Metas() {
  const [userId, setUserId] = useState(null)
  const [tab, setTab] = useState('activas')
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null)
  const [aEliminar, setAEliminar] = useState(null)
  const [detalle, setDetalle] = useState(null)
  useScrollLock(editando !== null || Boolean(aEliminar))
  const [procesando, setProcesando] = useState(false)
  const { t } = usePreferencias()
  const PRIORIDADES = PRIORIDADES_IDS.map(([id, color]) => [id, t(`metas_prioridad_${id}`), color])

  const cargar = useCallback(async (uid) => {
    setCargando(true)
    setError(null)
    try {
      setLista(await conRespaldoOffline(`metas:${uid}`, () => obtenerMetas(uid)))
    } catch (err) {
      setError(mensajeAmigable(err, t('metas_vacio_activas')))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const usuario = data.session?.user
      if (usuario) {
        setUserId(usuario.id)
        cargar(usuario.id)
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
    let uid = userId
    if (!uid) {
      const { data } = await supabase.auth.getSession()
      uid = data.session?.user?.id
      if (uid) setUserId(uid)
    }
    if (!uid) throw new Error('No hay sesión activa')

    if (form.id) {
      await editarMeta({ id: form.id, userId: uid, ...form })
    } else {
      await crearMeta({ userId: uid, ...form })
    }
    setEditando(null)
    await cargar(uid)
  } catch (err) {
    setError(mensajeAmigable(err, 'No se pudo guardar la meta.'))
  } finally {
    setProcesando(false)
  }
}

  const handleToggleCompletada = async (meta) => {
    try {
      await marcarMetaCompletada(meta.id, userId, !meta.completada)
      await cargar(userId)
    } catch (err) {
      setError(mensajeAmigable(err, 'No se pudo actualizar la meta.'))
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
      setError(mensajeAmigable(err, 'No se pudo eliminar.'))
    } finally {
      setProcesando(false)
    }
  }

  if (detalle) {
    return (
      <MetaDetalle
        meta={detalle}
        userId={userId}
        onBack={() => setDetalle(null)}
        onCambio={() => cargar(userId)}
      />
    )
  }

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <h1 className="large-title" style={{ margin: '0 0 16px' }}>{t('metas_titulo')}</h1>

      <div className="tab-scroll" role="tablist">
        {[['activas', `${t('metas_activas')}${activas.length ? ` (${activas.length})` : ''}`], ['completadas', `${t('metas_completadas')}${completadas.length ? ` (${completadas.length})` : ''}`]].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={tab === id ? 'tab-pill active' : 'tab-pill'}
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
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}><Target size={34} strokeWidth={1.6} aria-hidden="true" /></div>
          <p style={{ fontSize: 14, margin: 0 }}>
            {tab === 'activas' ? t('metas_vacio_activas') : t('metas_vacio_completadas')}
          </p>
          {tab === 'activas' && <p style={{ fontSize: 13, margin: '4px 0 0' }}>{t('metas_vacio_subtitulo')}</p>}
        </div>
      )}

      <div className="card-grid">
      {mostrar.map(meta => {
        const pct = Math.min(100, (Number(meta.monto_actual) / Number(meta.monto_objetivo)) * 100)
        const prioridad = PRIORIDADES.find(p => p[0] === meta.prioridad) || PRIORIDADES[1]
        return (
          <div key={meta.id} style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)', padding: 16
          }}>
            <div onClick={() => setDetalle(meta)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  <CategoriaIcono icono={meta.icono || 'Target'} size={24} color="var(--text-secondary)" />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{meta.nombre}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: prioridad[2], border: `1px solid ${prioridad[2]}`, borderRadius: 999, padding: '1px 8px' }}>
                      {prioridad[1]}
                    </span>
                  </div>
                  {meta.descripcion && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{meta.descripcion}</div>}
                  {meta.fecha_limite && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('md_meta')}: {fmtFecha(meta.fecha_limite)}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}><Monto valor={meta.monto_actual} /></div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>de <Monto valor={meta.monto_objetivo} /></div>
              </div>
            </div>

            <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-surface-2)', overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: meta.completada ? 'var(--success)' : 'var(--gradient-brand)', borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginBottom: 10 }}>{pct.toFixed(0)}%</div>
            </div>

            <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
              <button onClick={() => setEditando(meta)} className="card-action" style={{ color: 'var(--text-secondary)' }}><Pencil size={14} aria-hidden="true" /> {t('comun_editar')}</button>
              <button onClick={() => handleToggleCompletada(meta)} className="card-action" style={{ color: 'var(--success)' }}>
                {meta.completada
                  ? <><RotateCcw size={14} aria-hidden="true" /> {t('metas_reactivar')}</>
                  : <><CheckCircle2 size={14} aria-hidden="true" /> {t('metas_marcar_completa')}</>}
              </button>
              <button onClick={() => setAEliminar(meta)} className="card-action" style={{ color: 'var(--danger)' }}><Trash2 size={14} aria-hidden="true" /> {t('comun_eliminar')}</button>
            </div>
          </div>
        )
      })}
      </div>

      <button
        onClick={() => setEditando({})}
        aria-label={t('metas_crear_boton')}
        className="floating-button"
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
            <h3>{t('metas_eliminar_titulo')}</h3>
            <p>{t('tx_eliminar_confirmar_1')} "{aEliminar.nombre}" {t('tx_eliminar_confirmar_3')}</p>
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

function FormularioMeta({ meta, onCancelar, onGuardar, guardando }) {
  const { t } = usePreferencias()
  const PRIORIDADES = PRIORIDADES_IDS.map(([id, color]) => [id, t(`metas_prioridad_${id}`), color])
  const esNueva = !meta.id

  // Detectar si el icono guardado es un emoji antiguo o un nombre Lucide.
  // Si es un emoji (no está en ICONOS_DISPONIBLES), migrarlo a 'Target' por defecto.
  const iconoInicial = ICONOS_DISPONIBLES.find(i => i.nombre === meta.icono)
    ? meta.icono
    : 'Target'

  const [nombre, setNombre] = useState(meta.nombre || '')
  const [descripcion, setDescripcion] = useState(meta.descripcion || '')
  const [icono, setIcono] = useState(iconoInicial)
  const [prioridad, setPrioridad] = useState(meta.prioridad || 'media')
  const [montoObjetivo, setMontoObjetivo] = useState(meta.monto_objetivo ? String(meta.monto_objetivo) : '')
  const [montoActual, setMontoActual] = useState(meta.monto_actual ? String(meta.monto_actual) : '0')
  const [fechaLimite, setFechaLimite] = useState(meta.fecha_limite || '')

  const objetivoNum = Number(montoObjetivo)
  const actualNum = Number(montoActual)
  const valido = nombre.trim().length > 0 && Number.isFinite(objetivoNum) && objetivoNum > 0 && Number.isFinite(actualNum) && actualNum >= 0

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 420 }}>
        <h3>{esNueva ? t('metas_form_nueva') : t('metas_form_editar')}</h3>

        <label className="field-label">Ícono de la meta</label>
        <SelectorIcono valor={icono} onCambiar={setIcono} />

        <label className="field-label">{t('metas_nombre')}</label>
        <div className="input-shell">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('metas_nombre_placeholder')} maxLength={40} />
        </div>

        <label className="field-label">{t('metas_descripcion')}</label>
        <div className="input-shell">
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={t('metas_descripcion').replace(' (opcional)', '').replace(' (optional)', '')} maxLength={80} />
        </div>

        <label className="field-label">{t('metas_monto_objetivo')}</label>
        <div className="input-shell">
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input inputMode="decimal" value={montoObjetivo} onChange={(e) => setMontoObjetivo(e.target.value.replace(',', '.'))} placeholder="0.00" />
        </div>

        <label className="field-label">{t('metas_fecha_objetivo')}</label>
        <div className="input-shell">
          <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
        </div>

        <label className="field-label">{t('metas_prioridad')}</label>
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px' }}>
          {PRIORIDADES.map(([id, label, color]) => (
            <button
              key={id}
              onClick={() => setPrioridad(id)}
              style={{
                flex: 1, padding: 12, borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 13,
                background: prioridad === id ? `color-mix(in srgb, ${color} 16%, transparent)` : 'var(--fill)',
                color: prioridad === id ? color : 'var(--text-secondary)',
                border: '1px solid ' + (prioridad === id ? color : 'transparent')
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="field-label">{esNueva ? t('metas_aporte_inicial') : t('metas_cuanto_llevas')}</label>
        <div className="input-shell">
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input inputMode="decimal" value={montoActual} onChange={(e) => setMontoActual(e.target.value.replace(',', '.'))} placeholder="0.00" />
        </div>

        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button onClick={onCancelar} disabled={guardando}>{t('comun_cancelar')}</button>
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
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? 'var(--on-accent)' : 'var(--text-muted)' }}
          >
            {guardando ? t('comun_guardando') : esNueva ? t('metas_crear_boton') : t('nt_boton_actualizar')}
          </button>
        </div>
      </div>
    </div>
  )
}
