import { useEffect, useState, useCallback } from 'react'
import { obtenerCuentas, crearCuenta, editarCuenta, eliminarCuenta, obtenerTransferencias, eliminarTransferencia, pagarTarjetaCredito } from '../lib/db.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import Monto from '../components/Monto.jsx'
import FormularioPago from '../components/FormularioPago.jsx'
import { mensajeAmigable } from '../lib/errores.js'

const TIPOS = ['efectivo', 'tarjeta', 'tarjeta_credito', 'banco', 'otro']
const ICONO_TIPO = { efectivo: '💵', tarjeta: '💳', tarjeta_credito: '💳', banco: '🏦', otro: '📦' }

// Mismo filtro usado en NuevaTransaccion/NuevaTransferencia: solo dígitos y
// un único punto decimal, sin importar si el texto llega escrito o pegado.
const limpiarMonto = (valor) => {
  let limpio = valor.replace(',', '.').replace(/[^0-9.]/g, '')
  const partes = limpio.split('.')
  if (partes.length > 2) limpio = partes[0] + '.' + partes.slice(1).join('')
  return limpio
}

export default function AdministrarCuentas({ userId, onBack, onCambio }) {
  const { t } = usePreferencias()
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null) // null cerrado, {} nueva, {...cuenta} editar
  const [aEliminar, setAEliminar] = useState(null)
  const [aPagar, setAPagar] = useState(null) // tarjeta de crédito seleccionada para pagar
  const [procesando, setProcesando] = useState(false)
  const [transferencias, setTransferencias] = useState([])
  useScrollLock(editando !== null || Boolean(aEliminar) || Boolean(aPagar))

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [cuentasList, tfs] = await Promise.all([obtenerCuentas(userId), obtenerTransferencias(userId)])
      setLista(cuentasList)
      setTransferencias(tfs)
    } catch (err) {
      setError(mensajeAmigable(err))
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
        await editarCuenta({ id: form.id, userId, nombre: form.nombre, tipo: form.tipo, saldo: form.saldo, limiteCredito: form.limiteCredito, fechaCorte: form.fechaCorte, fechaPago: form.fechaPago })
      } else {
        await crearCuenta({ userId, nombre: form.nombre, tipo: form.tipo, saldo: form.saldo, limiteCredito: form.limiteCredito, fechaCorte: form.fechaCorte, fechaPago: form.fechaPago })
      }
      setEditando(null)
      await cargar()
      onCambio?.()
    } catch (err) {
      setError(mensajeAmigable(err))
    } finally {
      setProcesando(false)
    }
  }

  const handlePagar = async (form) => {
    setProcesando(true)
    setError(null)
    try {
      await pagarTarjetaCredito({
        tarjetaId: aPagar.id,
        cuentaOrigenId: form.cuentaOrigenId,
        monto: form.monto,
        fecha: form.fecha,
        descripcion: form.descripcion
      })
      setAPagar(null)
      await cargar()
      onCambio?.()
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
      await eliminarCuenta(aEliminar.id, userId)
      setAEliminar(null)
      await cargar()
      onCambio?.()
    } catch (err) {
      setError(mensajeAmigable(err))
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
      setError(mensajeAmigable(err))
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
            {c.tipo === 'tarjeta_credito' ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--danger)' }}>{t('cu_deuda_actual')}: <Monto valor={c.saldo} /></div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('cu_disponible')}: <Monto valor={Number(c.limite_credito || 0) - Number(c.saldo || 0)} /> {t('cu_de')} <Monto valor={c.limite_credito || 0} /></div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--success)' }}><Monto valor={c.saldo} /></div>
            )}
          </div>
          {c.tipo === 'tarjeta_credito' && (
            <button onClick={() => setAPagar(c)} style={{ background: 'var(--gradient-brand)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999 }}>
              {t('cu_pagar_tarjeta')}
            </button>
          )}
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

      {aPagar && (
        <FormularioPago
          tarjeta={aPagar}
          cuentas={lista.filter(c => c.tipo !== 'tarjeta_credito')}
          procesando={procesando}
          onCancelar={() => setAPagar(null)}
          onGuardar={handlePagar}
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
  const [limiteCredito, setLimiteCredito] = useState(cuenta.limite_credito !== undefined && cuenta.limite_credito !== null ? String(cuenta.limite_credito) : '')
  const [fechaCorte, setFechaCorte] = useState(cuenta.fecha_corte !== undefined && cuenta.fecha_corte !== null ? String(cuenta.fecha_corte) : '')
  const [fechaPago, setFechaPago] = useState(cuenta.fecha_pago !== undefined && cuenta.fecha_pago !== null ? String(cuenta.fecha_pago) : '')

  const esCredito = tipo === 'tarjeta_credito'
  const saldoNum = Number(saldo)
  const limiteNum = Number(limiteCredito || 0)
  const corteNum = fechaCorte ? Number(fechaCorte) : null
  const pagoNum = fechaPago ? Number(fechaPago) : null

  const fechasValidas = (corteNum === null || (corteNum >= 1 && corteNum <= 31)) && (pagoNum === null || (pagoNum >= 1 && pagoNum <= 31))
  const valido = nombre.trim().length > 0 && Number.isFinite(saldoNum) && (!esCredito || (Number.isFinite(limiteNum) && limiteNum > 0 && fechasValidas))

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 380, maxHeight: '85vh', overflowY: 'auto' }}>
        <h3>{cuenta.id ? t('cu_editar_titulo') : t('cu_nueva')}</h3>

        <label className="field-label">{t('cu_nombre')}</label>
        <div className="input-shell">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('cu_nombre_placeholder')} maxLength={40} autoFocus />
        </div>

        <label className="field-label">{t('cu_tipo')}</label>
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px', flexWrap: 'wrap' }}>
          {TIPOS.map(id => (
            <button
              key={id}
              onClick={() => setTipo(id)}
              style={{
                flex: '1 1 18%', minWidth: 44, padding: 10, borderRadius: 'var(--radius-md)', fontSize: 18,
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

        <label className="field-label">{esCredito ? t('cu_deuda_actual') : t('cu_saldo')}</label>
        <div className="input-shell">
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input inputMode="decimal" value={saldo} onChange={(e) => setSaldo(limpiarMonto(e.target.value))} placeholder="0.00" />
        </div>

        {esCredito && (
          <>
            <label className="field-label">{t('cu_limite_credito')}</label>
            <div className="input-shell">
              <span style={{ color: 'var(--text-muted)' }}>$</span>
              <input inputMode="decimal" value={limiteCredito} onChange={(e) => setLimiteCredito(limpiarMonto(e.target.value))} placeholder="0.00" />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">{t('cu_fecha_corte')}</label>
                <div className="input-shell">
                  <input inputMode="numeric" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="1-31" />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">{t('cu_fecha_pago')}</label>
                <div className="input-shell">
                  <input inputMode="numeric" value={fechaPago} onChange={(e) => setFechaPago(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="1-31" />
                </div>
              </div>
            </div>
            {!fechasValidas && <p style={{ fontSize: 11, color: 'var(--danger)', margin: '-10px 0 12px' }}>{t('cu_fechas_invalidas')}</p>}
          </>
        )}

        <div className="modal-actions" style={{ marginTop: 4 }}>
          <button onClick={onCancelar} disabled={procesando}>{t('comun_cancelar')}</button>
          <button
            disabled={!valido || procesando}
            onClick={() => onGuardar({
              id: cuenta.id, nombre: nombre.trim(), tipo, saldo: saldoNum,
              limiteCredito: esCredito ? limiteNum : null,
              fechaCorte: esCredito ? corteNum : null,
              fechaPago: esCredito ? pagoNum : null
            })}
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? '#fff' : 'var(--text-muted)' }}
          >
            {procesando ? t('comun_guardando') : t('comun_guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}