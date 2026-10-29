import { useEffect, useState } from 'react'
import { Crown, Sparkles, Users, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { mensajeAmigable } from '../lib/errores.js'
import { logError } from '../lib/logger.js'
import { esAndroid, pagosDisponibles, obtenerPlanes, comprar, restaurar, URL_ADMINISTRAR_SUSCRIPCION } from '../lib/pagos.js'

const BENEFICIOS = [
  { Icono: Sparkles, clave: 'premium_beneficio_ia' },
  { Icono: Users, clave: 'premium_beneficio_colaborar' }
]

/**
 * Hoja de Kairen Premium: estado actual, planes de Google Play y
 * "Restaurar compras". Quien tiene acceso de fundador no ve planes.
 */
export default function Premium({ onCerrar, onActivado }) {
  const { t } = usePreferencias()
  const [estado, setEstado] = useState(null) // { fundador, premium, invitado }
  const [planes, setPlanes] = useState([])
  const [procesando, setProcesando] = useState(null) // id del plan o 'restaurar'
  const [error, setError] = useState(null)
  const [mensaje, setMensaje] = useState(null)
  useScrollLock(true)

  const cargarEstado = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: perfil } = await supabase.from('perfiles').select('acceso_fundador, plan').eq('user_id', user.id).single()
    setEstado({ fundador: Boolean(perfil?.acceso_fundador), premium: perfil?.plan === 'premium', invitado: Boolean(user.is_anonymous) })
  }

  useEffect(() => {
    cargarEstado().catch(err => setError(mensajeAmigable(err)))
    if (pagosDisponibles()) {
      obtenerPlanes().then(setPlanes).catch(err => {
        logError('No se pudieron cargar los planes', err)
        setError(t('premium_error_planes'))
      })
    }
  }, [])

  const alComprar = async (plan) => {
    setProcesando(plan.id); setError(null); setMensaje(null)
    try {
      const { premium, cancelado, yaComprado } = await comprar(plan)
      if (cancelado) return
      if (yaComprado) { setMensaje(t('premium_ya_comprado')); return }
      await cargarEstado()
      if (premium) { setMensaje(t('premium_gracias')); onActivado?.() }
      // Pago lento (OXXO, efectivo) o el servidor aún no lo ve: se activa solo con el webhook
      else setMensaje(t('premium_pendiente'))
    } catch (err) {
      logError('Compra fallida', err)
      setError(mensajeAmigable(err, t('premium_error_compra')))
    } finally {
      setProcesando(null)
    }
  }

  const alRestaurar = async () => {
    setProcesando('restaurar'); setError(null); setMensaje(null)
    try {
      const { premium, activoEnTienda } = await restaurar()
      await cargarEstado()
      setMensaje(premium ? t('premium_restaurado') : activoEnTienda ? t('premium_pendiente') : t('premium_nada_que_restaurar'))
      if (premium) onActivado?.()
    } catch (err) {
      setError(mensajeAmigable(err, t('premium_error_compra')))
    } finally {
      setProcesando(null)
    }
  }

  const abrirAdministrar = async () => {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url: URL_ADMINISTRAR_SUSCRIPCION })
  }

  const tienePremium = estado?.fundador || estado?.premium

  return (
    <div className="modal-backdrop" onClick={() => !procesando && onCerrar()}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--fill)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Crown size={24} aria-hidden="true" />
          </div>
          <button onClick={onCerrar} disabled={Boolean(procesando)} aria-label={t('comun_cancelar')} className="icon-button" style={{ width: 36, height: 36, minHeight: 36, minWidth: 36 }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <h3 style={{ margin: '12px 0 4px' }}>Kairen Premium</h3>

        {estado === null ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>…</p>
        ) : tienePremium ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 16px' }}>
            {estado.fundador ? t('premium_fundador') : t('premium_activo')}
          </p>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 16px' }}>{t('premium_descripcion')}</p>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'grid', gap: 10 }}>
          {BENEFICIOS.map(({ Icono, clave }) => (
            <li key={clave} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <Icono size={18} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
              <span style={{ flex: 1 }}>{t(clave)}</span>
              {tienePremium && <Check size={16} aria-hidden="true" style={{ color: 'var(--success)' }} />}
            </li>
          ))}
        </ul>

        {estado && !tienePremium && (
          estado.invitado ? (
            <p className="empty-inline" style={{ fontSize: 13 }}>{t('premium_crea_cuenta')}</p>
          ) : !pagosDisponibles() ? (
            <p className="empty-inline" style={{ fontSize: 13 }}>{esAndroid() ? t('premium_pronto') : t('premium_solo_android')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {planes.length === 0 && !error && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>…</p>}
              {planes.map(plan => (
                <button key={plan.id} onClick={() => alComprar(plan)} disabled={Boolean(procesando)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                  padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'var(--on-accent)',
                  fontWeight: 600, fontSize: 15
                }}>
                  <span>{t(`premium_periodo_${plan.periodo}`) === `premium_periodo_${plan.periodo}` ? plan.titulo : t(`premium_periodo_${plan.periodo}`)}</span>
                  <span>{procesando === plan.id ? '…' : plan.precio}</span>
                </button>
              ))}
              <button onClick={alRestaurar} disabled={Boolean(procesando)} className="link-button" style={{ padding: 8 }}>
                {procesando === 'restaurar' ? '…' : t('premium_restaurar')}
              </button>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>{t('premium_letra_chica')}</p>
            </div>
          )
        )}

        {estado?.premium && !estado.fundador && pagosDisponibles() && (
          <button onClick={abrirAdministrar} className="link-button" style={{ padding: 8, width: '100%' }}>{t('premium_administrar')}</button>
        )}

        {mensaje && <p style={{ color: 'var(--success)', fontSize: 13, marginTop: 12 }}>{mensaje}</p>}
        {error && <p className="error-message">{error}</p>}
      </div>
    </div>
  )
}
