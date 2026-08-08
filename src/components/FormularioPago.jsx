import { useState } from 'react'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import Monto from './Monto.jsx'

const ICONO_TIPO = { efectivo: '💵', tarjeta: '💳', tarjeta_credito: '💳', banco: '🏦', otro: '📦' }

// Mismo filtro usado en el resto de la app: solo dígitos y un único punto
// decimal, sin importar si el texto llega escrito o pegado.
const limpiarMonto = (valor) => {
  let limpio = valor.replace(',', '.').replace(/[^0-9.]/g, '')
  const partes = limpio.split('.')
  if (partes.length > 2) limpio = partes[0] + '.' + partes.slice(1).join('')
  return limpio
}

/**
 * Modal para pagar una tarjeta de crédito. Se usa tanto desde Inicio (acceso
 * rápido) como desde AdministrarCuentas — mismo componente, mismo comportamiento.
 */
export default function FormularioPago({ tarjeta, cuentas, onCancelar, onGuardar, procesando }) {
  const { t } = usePreferencias()
  const hoy = new Date().toISOString().slice(0, 10)
  const [cuentaOrigenId, setCuentaOrigenId] = useState(cuentas[0]?.id || null)
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoy)

  const montoNum = Number(monto)
  const valido = Boolean(cuentaOrigenId) && Number.isFinite(montoNum) && montoNum > 0

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 380 }}>
        <h3>{t('cu_pagar_tarjeta_titulo')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
          {tarjeta.nombre} — {t('cu_deuda_actual')}: <Monto valor={tarjeta.saldo} />
        </p>

        <label className="field-label">{t('cu_pagar_desde')}</label>
        <div style={{ display: 'flex', gap: 10, margin: '8px 0 16px', flexWrap: 'wrap' }}>
          {cuentas.length === 0 && <div className="empty-inline">{t('cu_sin_cuentas_origen')}</div>}
          {cuentas.map(c => (
            <button key={c.id} onClick={() => setCuentaOrigenId(c.id)} style={{
              flex: '1 1 45%', padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)',
              border: '1.5px solid ' + (cuentaOrigenId === c.id ? 'var(--accent-blue)' : 'var(--border-subtle)'), textAlign: 'left'
            }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{ICONO_TIPO[c.tipo] || '📦'} {c.nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--success)' }}><Monto valor={c.saldo} /></div>
            </button>
          ))}
        </div>

        <label className="field-label">{t('cu_pagar_monto')}</label>
        <div className="input-shell">
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input inputMode="decimal" value={monto} onChange={(e) => setMonto(limpiarMonto(e.target.value))} placeholder="0.00" />
        </div>

        <label className="field-label">{t('nt_fecha')}</label>
        <div className="input-shell" style={{ marginTop: 8 }}>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button onClick={onCancelar} disabled={procesando}>{t('comun_cancelar')}</button>
          <button
            disabled={!valido || procesando}
            onClick={() => onGuardar({ cuentaOrigenId, monto: montoNum, fecha })}
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? '#fff' : 'var(--text-muted)' }}
          >
            {procesando ? t('comun_guardando') : t('cu_pagar_tarjeta')}
          </button>
        </div>
      </div>
    </div>
  )
}
