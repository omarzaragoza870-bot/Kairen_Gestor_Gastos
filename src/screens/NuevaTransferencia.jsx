import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerCuentas, crearTransferencia } from '../lib/db.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import Monto from '../components/Monto.jsx'
import { mensajeAmigable } from '../lib/errores.js'
import { logError } from '../lib/logger.js'
import { encolarOperacion, conRespaldoOffline, obtenerConectividad, marcarConectividad, pareceErrorDeRed, generarIdOperacion } from '../lib/offline.js'
import { hoyLocal } from '../lib/fechas.js'
import IconoCuenta from '../components/IconoCuenta.jsx'

// Mismo filtro usado en NuevaTransaccion: solo dígitos y un único punto decimal.
const limpiarMonto = (valor) => {
  let limpio = valor.replace(',', '.').replace(/[^0-9.]/g, '')
  const partes = limpio.split('.')
  if (partes.length > 2) limpio = partes[0] + '.' + partes.slice(1).join('')
  return limpio
}


export default function NuevaTransferencia({ onBack, onGuardada }) {
  const { t } = usePreferencias()
  const [cuentas, setCuentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [origenId, setOrigenId] = useState(null)
  const [destinoId, setDestinoId] = useState(null)
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(hoyLocal())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  // Identificador único de ESTA transferencia: se reutiliza en cualquier
  // reintento para que el servidor no la registre dos veces.
  const idOperacion = useRef(generarIdOperacion())

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const usuario = data.session?.user
        if (!usuario) throw new Error('No encontramos una sesión activa.')
        const lista = await conRespaldoOffline(`cuentas:${usuario.id}`, () => obtenerCuentas(usuario.id))
        // Las tarjetas de crédito no participan en transferencias: su "saldo"
        // es deuda. Para abonarles está "Pagar tarjeta" en Administrar Cuentas.
        const transferibles = lista.filter(c => c.tipo !== 'tarjeta_credito')
        if (cancelado) return
        setCuentas(transferibles)
        if (transferibles.length > 0) setOrigenId(transferibles[0].id)
        if (transferibles.length > 1) setDestinoId(transferibles[1].id)
      } catch (err) {
        logError('Error cargando cuentas para transferencia', err)
        if (!cancelado) setError(mensajeAmigable(err, 'No se pudieron cargar tus cuentas.'))
      } finally {
        if (!cancelado) setCargando(false)
      }
    })()
    return () => { cancelado = true }
  }, [])

  const montoNum = Number(monto)
  const valido = Boolean(origenId && destinoId) && origenId !== destinoId && Number.isFinite(montoNum) && montoNum > 0 && Boolean(fecha)

  const elegirOrigen = (id) => {
    setOrigenId(id)
    // Si el destino quedó igual al nuevo origen, se mueve a otra cuenta
    if (id === destinoId) setDestinoId(cuentas.find(c => c.id !== id)?.id || null)
  }

  const handleGuardar = async () => {
    if (guardando) return
    if (origenId === destinoId) {
      setError(t('tf_error_misma_cuenta'))
      return
    }
    if (!valido) return
    setGuardando(true)
    setError(null)

    const datosTransferencia = {
      clientOpId: idOperacion.current,
      cuentaOrigenId: origenId,
      cuentaDestinoId: destinoId,
      monto: montoNum,
      descripcion: descripcion.trim() || null,
      fecha
    }

    const intentarEncolar = async () => {
      try {
        await encolarOperacion({ accion: 'crearTransferencia', datos: datosTransferencia })
        onGuardada ? onGuardada() : onBack()
      } catch (err) {
        logError('Error encolando transferencia offline', err)
        setError('No se pudo guardar localmente. Intenta de nuevo.')
        setGuardando(false)
      }
    }

    if (!obtenerConectividad()) {
      await intentarEncolar()
      return
    }

    try {
      await crearTransferencia(datosTransferencia)
      marcarConectividad(true)
      onGuardada ? onGuardada() : onBack()
    } catch (err) {
      if (pareceErrorDeRed(err)) {
        marcarConectividad(false)
        await intentarEncolar()
        return
      }
      logError('Error guardando transferencia', err)
      setError(mensajeAmigable(err, 'No se pudo guardar la transferencia. Intenta de nuevo.'))
      setGuardando(false)
    }
  }

  const tarjetaCuenta = (c, seleccionada, onClick, deshabilitada = false) => (
    <button
      key={c.id}
      onClick={onClick}
      disabled={deshabilitada}
      style={{
        flex: '1 1 45%', padding: 12, borderRadius: 'var(--radius-md)', textAlign: 'left',
        background: 'var(--bg-surface)', opacity: deshabilitada ? 0.4 : 1,
        border: '1.5px solid ' + (seleccionada ? 'var(--accent-blue)' : 'var(--border-subtle)')
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><IconoCuenta tipo={c.tipo || 'efectivo'} size={15} /> {c.nombre}</div>
      <div style={{ fontSize: 12, color: 'var(--success)' }}><Monto valor={c.saldo} /></div>
    </button>
  )

  const faltanCuentas = !cargando && cuentas.length < 2

  return (
    <div style={{ padding: '16px 16px 40px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} className="back-button" aria-label="Volver">←</button>
        <h1>{t('tf_titulo')}</h1>
      </div>

      {faltanCuentas && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
          Necesitas al menos dos cuentas (que no sean tarjetas de crédito) para transferir. Puedes agregarlas desde Inicio → Administrar Cuentas.
        </p>
      )}

      <label className="field-label">{t('tf_cuenta_origen')}</label>
      <div style={{ display: 'flex', gap: 10, margin: '8px 0 20px', flexWrap: 'wrap' }}>
        {cuentas.map(c => tarjetaCuenta(c, origenId === c.id, () => elegirOrigen(c.id)))}
      </div>

      <label className="field-label">{t('tf_cuenta_destino')}</label>
      <div style={{ display: 'flex', gap: 10, margin: '8px 0 20px', flexWrap: 'wrap' }}>
        {cuentas.map(c => tarjetaCuenta(c, destinoId === c.id, () => setDestinoId(c.id), c.id === origenId))}
      </div>

      <label className="field-label">{t('tf_monto')}</label>
      <div className="input-shell" style={{ marginBottom: 20 }}>
        <span style={{ color: 'var(--text-muted)' }}>$</span>
        <input inputMode="decimal" value={monto} onChange={(e) => setMonto(limpiarMonto(e.target.value))} placeholder="0.00" />
      </div>

      <label className="field-label">{t('tf_descripcion')}</label>
      <div className="input-shell" style={{ marginBottom: 20 }}>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={80} />
      </div>

      <label className="field-label">{t('tf_fecha')}</label>
      <div className="input-shell" style={{ marginBottom: 20 }}>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>

      {error && <p className="error-message">{error}</p>}

      <button
        disabled={!valido || guardando}
        onClick={handleGuardar}
        style={{
          width: '100%', padding: 16, borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 15,
          background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
          color: valido ? 'var(--on-accent)' : 'var(--text-muted)'
        }}
      >
        {guardando ? t('tf_guardando') : t('tf_boton_guardar')}
      </button>
    </div>
  )
}