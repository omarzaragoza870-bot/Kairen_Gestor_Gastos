import { useEffect, useState, useCallback } from 'react'
import { obtenerCuentas, crearCuenta, editarCuenta, eliminarCuenta, obtenerTransferencias, eliminarTransferencia } from '../lib/db.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import Monto from '../components/Monto.jsx'

const TIPOS = ['efectivo', 'tarjeta', 'banco', 'otro']
const ICONO_TIPO = { efectivo: '💵', tarjeta: '💳', banco: '🏦', otro: '📦' }

export default function AdministrarCuentas({ userId, onBack, onCambio }) {
  const { t } = usePreferencias()
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null) // null cerrado, {} nueva, {...cuenta} editar
  const [aEliminar, setAEliminar] = useState(null)
  const [procesando, setProcesando] = useState(false)
  const [transferencias, setTransferencias] = useState([])
  useScrollLock(editando !== null || Boolean(aEliminar))

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [cuentasList, tfs] = await Promise.all([obtenerCuentas(userId), obtenerTransferencias(userId)])
      setLista(cuentasList)
      setTransferencias(tfs)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [userId])

  useEffect(() => { cargar() }, [cargar])

  const handleGuardar = async (form) => {
    setProcesando(true)
    setError(null)
    try {
      if (form.id) {
        await editarCuenta({ id: form.id, userId, nombre: form.nombre, tipo: form.tipo, saldo: form.saldo })
      } else {
        await crearCuenta({ userId, nombre: form.nombre, tipo: form.tipo, saldo: form.saldo })
      }
      setEditando(null)
      await cargar()
      onCambio?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  const confirmarEliminar = async () => {
    if (!aEliminar) return
    setProcesando(true)
    try {
      await eliminarCuenta(aEliminar.id, userId)
      setAEliminar(null)
      await cargar()
      onCambio?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleEliminarTransferencia = async (id) => {
    try {
      await eliminarTransferencia(id)
      await cargar()
      onCambio?.()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} className="back-button">←</button>
        <h1>{t('cu_titulo')}</h1>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        {t('cu_info')}
      </p>

      {error && <p className="error-message">{error}</p>}

      {!cargando && lista.map(c => (
        <div key={c.id} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', marginBottom: 8
        }}>
          <span style={{ fontSize: 20 }}>{ICONO_TIPO[c.tipo] || '📦'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{c.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--success)' }}><Monto valor={c.saldo} /></div>
          </div>
          <button onClick={() => setEditando(c)} style={{ background: 'transparent', color: 'var(--text-secondary)', fontSize: 16 }}>✏️</button>
          <button onClick={() => setAEliminar(c)} style={{ background: 'transparent', color: 'var(--danger)', fontSize: 16 }}>🗑️</button>
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
        + {t('cu_agregar')}
      </button>

      <div style={{ margin: '24px 0 8px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>{t('tf_recientes')}</h2>
      </div>

      {!cargando && transferencias.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('tf_vacio')}</p>
      )}

      {transferencias.map(tf => (
        <div key={tf.id} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', marginBottom: 6
        }}>
          <span style={{ fontSize: 16 }}>🔁</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {tf.cuenta_origen_nombre} → {tf.cuenta_destino_nombre}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tf.fecha}</div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 13 }}><Monto valor={tf.monto} /></div>
          <button onClick={() => handleEliminarTransferencia(tf.id)} style={{ background: 'transparent', color: 'var(--danger)', fontSize: 14 }}>🗑️</button>
        </div>
      ))}

      {editando !== null && (
        <FormularioCuenta
          cuenta={editando}
          procesando={procesando}
          onCancelar={() => setEditando(null)}
          onGuardar={handleGuardar}
        />
      )}

      {aEliminar && (
        <div onClick={() => !procesando && setAEliminar(null)} className="modal-backdrop">
          <div onClick={(e) => e.stopPropagation()} className="modal-card">
            <h3>{t('cu_eliminar_titulo')}</h3>
            <p>{t('cu_eliminar_info')}</p>
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

function FormularioCuenta({ cuenta, onCancelar, onGuardar, procesando }) {
  const { t } = usePreferencias()
  const [nombre, setNombre] = useState(cuenta.nombre || '')
  const [tipo, setTipo] = useState(cuenta.tipo || 'otro')
  const [saldo, setSaldo] = useState(cuenta.saldo !== undefined ? String(cuenta.saldo) : '0')

  const saldoNum = Number(saldo)
  const valido = nombre.trim().length > 0 && Number.isFinite(saldoNum)

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 380 }}>
        <h3>{cuenta.id ? t('cu_editar_titulo') : t('cu_nueva')}</h3>

        <label className="field-label">{t('cu_nombre')}</label>
        <div className="input-shell">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('cu_nombre_placeholder')} maxLength={40} autoFocus />
        </div>

        <label className="field-label">{t('cu_tipo')}</label>
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px' }}>
          {TIPOS.map(id => (
            <button
              key={id}
              onClick={() => setTipo(id)}
              style={{
                flex: 1, padding: 10, borderRadius: 'var(--radius-md)', fontSize: 18,
                background: tipo === id ? 'var(--gradient-brand)' : 'var(--bg-surface)',
                border: '1px solid ' + (tipo === id ? 'transparent' : 'var(--border-subtle)')
              }}
              title={t(`cu_tipo_${id}`)}
            >
              {ICONO_TIPO[id]}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '-10px 0 16px' }}>{t(`cu_tipo_${tipo}`)}</p>

        <label className="field-label">{t('cu_saldo')}</label>
        <div className="input-shell">
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value.replace(',', '.'))} placeholder="0.00" />
        </div>

        <div className="modal-actions" style={{ marginTop: 4 }}>
          <button onClick={onCancelar} disabled={procesando}>{t('comun_cancelar')}</button>
          <button
            disabled={!valido || procesando}
            onClick={() => onGuardar({ id: cuenta.id, nombre: nombre.trim(), tipo, saldo: saldoNum })}
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? '#fff' : 'var(--text-muted)' }}
          >
            {procesando ? t('comun_guardando') : t('comun_guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}