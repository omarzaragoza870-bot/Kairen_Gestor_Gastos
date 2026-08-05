import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import InfoTooltip from '../components/InfoTooltip.jsx'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { usePreferencias, MONEDAS } from '../context/PreferenciasContext.jsx'
import { exportarTodosLosDatos, importarTodosLosDatos, reiniciarCuentaActual } from '../lib/db.js'
import { logError } from '../lib/logger.js'
import Categorias from './Categorias.jsx'
import Presupuestos from './Presupuestos.jsx'
import Recurrentes from './Recurrentes.jsx'
import Reportes from './Reportes.jsx'
import { pushSoportado, permisoPush, suscribirPush, desuscribirPush, estaSuscrito } from '../lib/push.js'
import SelectorMoneda from './SelectorMoneda.jsx'
import SelectorTema from './SelectorTema.jsx'
import SelectorIdioma from './SelectorIdioma.jsx'

export default function Ajustes({ onVerTutorial }) {
  const { ocultarSaldos, toggleOcultarSaldos, moneda, tema, idioma, t } = usePreferencias()
  const [user, setUser] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [confirmandoReinicio, setConfirmandoReinicio] = useState(false)
  const [mostrarCategorias, setMostrarCategorias] = useState(false)
  const [mostrarPresupuestos, setMostrarPresupuestos] = useState(false)
  const [mostrarRecurrentes, setMostrarRecurrentes] = useState(false)
  const [mostrarReportes, setMostrarReportes] = useState(false)
  const [pushActivo, setPushActivo] = useState(false)
  const [cargandoPush, setCargandoPush] = useState(false)

  useEffect(() => {
    estaSuscrito().then(setPushActivo).catch(() => {})
  }, [])

  const togglePush = async () => {
    if (!user) return
    setCargandoPush(true)
    try {
      if (pushActivo) {
        await desuscribirPush(user.id)
        setPushActivo(false)
      } else {
        const ok = await suscribirPush(user.id)
        setPushActivo(ok)
        if (!ok && permisoPush() === 'denied') {
          setError('Tienes las notificaciones bloqueadas en este navegador. Habilítalas desde la configuración del sitio.')
        }
      }
    } catch (err) {
      setError(mensajeAmigable(err))
    } finally {
      setCargandoPush(false)
    }
  }
  const [mostrarMoneda, setMostrarMoneda] = useState(false)
  const [mostrarTema, setMostrarTema] = useState(false)
  const [mostrarIdioma, setMostrarIdioma] = useState(false)
  useScrollLock(confirmando || confirmandoReinicio)
  const [eliminando, setEliminando] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)
  const inputImportarRef = useRef(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  const [vinculando, setVinculando] = useState(false)

  const handleVincularGoogle = async () => {
    setVinculando(true)
    setError(null)
    try {
      const { error: vincularError } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      })
      if (vincularError) throw vincularError
      // Supabase redirige a Google y de vuelta — no hace falta más aquí
    } catch (err) {
      logError('Error vinculando con Google', err)
      setError('No se pudo vincular con Google. Intenta de nuevo.')
      setVinculando(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: 'global' }) // invalida el refresh token en todos los dispositivos, no solo este
    // onAuthStateChange en App.jsx detecta esto solo y regresa al Login
  }

  const handleDeleteAccount = async () => {
    setEliminando(true)
    setError(null)
    try {
      // supabase.functions.invoke ya arma automáticamente el header
      // "apikey" (obligatorio) y "Authorization" con el token de la
      // sesión actual — no hace falta armarlos a mano.
      const { error: fnError } = await supabase.functions.invoke('delete-account')

      if (fnError) throw fnError

      await supabase.auth.signOut({ scope: 'global' }) // invalida el refresh token en todos los dispositivos, no solo este
    } catch (err) {
      setError('No se pudo eliminar la cuenta. Intenta de nuevo o contáctanos.')
      logError('Error al eliminar cuenta', err)
      setEliminando(false)
    }
  }

  const handleExportar = async () => {
    if (!user) return
    setExportando(true)
    setError(null)
    setMensaje(null)
    try {
      const datos = await exportarTodosLosDatos(user.id)
      const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kairen-finanzas-respaldo-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setMensaje('Respaldo descargado correctamente.')
    } catch (err) {
      setError(mensajeAmigable(err, 'No se pudo exportar tus datos.'))
    } finally {
      setExportando(false)
    }
  }

  const handleSeleccionarArchivoImportar = () => inputImportarRef.current?.click()

  const handleImportar = async (e) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo || !user) return

    // IV-02: validar tamaño y tipo del archivo antes de procesarlo (defensa en profundidad —
    // el "accept" del <input> es solo una sugerencia de UI, se puede evadir fácilmente)
    const LIMITE_BYTES = 5 * 1024 * 1024 // 5 MB
    if (archivo.size > LIMITE_BYTES) {
      setError('El archivo es demasiado grande (máximo 5 MB).')
      return
    }
    const esJson = archivo.type === 'application/json' || archivo.name.toLowerCase().endsWith('.json')
    if (!esJson) {
      setError('Selecciona un archivo .json exportado desde Kairen Finanzas.')
      return
    }

    setImportando(true)
    setError(null)
    setMensaje(null)
    try {
      const texto = await archivo.text()
      const datos = JSON.parse(texto)

      // IV-04: validación mínima de forma antes de mandarlo a la base de datos —
      // evita procesar un JSON cualquiera que no sea un respaldo real de la app.
      const clavesEsperadas = ['cuentas', 'categorias', 'transacciones', 'metas']
      const formaValida = datos && typeof datos === 'object' &&
        clavesEsperadas.every(clave => Array.isArray(datos[clave]))
      if (!formaValida) {
        throw new Error('El archivo no tiene el formato de un respaldo de Kairen Finanzas.')
      }

      await importarTodosLosDatos(user.id, datos)
      setMensaje('Datos importados correctamente. Los verás reflejados en Inicio, Análisis, etc.')
    } catch (err) {
      setError('No se pudo importar el archivo. Verifica que sea un respaldo válido de Kairen Finanzas.')
      logError('Error al importar datos', err)
    } finally {
      setImportando(false)
    }
  }

  const handleReiniciarCuenta = async () => {
    if (!user) return
    setReiniciando(true)
    setError(null)
    try {
      await reiniciarCuentaActual(user.id)
      setConfirmandoReinicio(false)
      setMensaje('Tu cuenta se reinició. Todo quedó en cero.')
    } catch (err) {
      setError(mensajeAmigable(err, 'No se pudo reiniciar la cuenta.'))
    } finally {
      setReiniciando(false)
    }
  }


  const nombre = user?.user_metadata?.full_name || user?.user_metadata?.name || 'Usuario'
  const avatarBruto = user?.user_metadata?.avatar_url
  // XSS-03: solo aceptamos avatares servidos por https, nunca esquemas raros (javascript:, data:, etc.)
  const avatar = avatarBruto?.startsWith('https://') ? avatarBruto : null
  const email = user?.email
  const esInvitado = Boolean(user?.is_anonymous)

  if (mostrarCategorias && user) {
    return <Categorias userId={user.id} onBack={() => setMostrarCategorias(false)} />
  }
  if (mostrarPresupuestos) {
    return <Presupuestos onBack={() => setMostrarPresupuestos(false)} />
  }
  if (mostrarRecurrentes) {
    return <Recurrentes onBack={() => setMostrarRecurrentes(false)} />
  }
  if (mostrarReportes) {
    return <Reportes onBack={() => setMostrarReportes(false)} />
  }
  if (mostrarMoneda) {
    return <SelectorMoneda onBack={() => setMostrarMoneda(false)} />
  }
  if (mostrarTema) {
    return <SelectorTema onBack={() => setMostrarTema(false)} />
  }
  if (mostrarIdioma) {
    return <SelectorIdioma onBack={() => setMostrarIdioma(false)} />
  }

  return (
    <div style={{ padding: '16px 16px 100px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 20px' }}>{t('ajustes_titulo')}</h1>

      {/* Perfil */}
      <section style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        padding: 18, display: 'flex', alignItems: 'center', gap: 14,
        border: '1px solid var(--border-subtle)', marginBottom: 16
      }}>
        {avatar ? (
          <img src={avatar} alt="" style={{ width: 52, height: 52, borderRadius: '50%' }} />
        ) : (
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: 'var(--gradient-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700
          }}>
            {nombre.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{nombre}</div>
          {esInvitado ? (
            <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 2 }}>👤 {t('ajustes_cuenta_invitado')}</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
              <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 2 }}>● {t('ajustes_sesion_google')}</div>
            </>
          )}
        </div>
      </section>

      {/* Cuenta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 8px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>{t('ajustes_seccion_cuenta')}</h2>
        <InfoTooltip
          title="Cerrar sesión vs Eliminar cuenta"
          text="Cerrar sesión solo desvincula este dispositivo — tus datos siguen guardados y puedes volver a entrar cuando quieras. Eliminar cuenta borra permanentemente tu perfil y todos tus datos, sin poder recuperarlos."
        />
      </div>

      {onVerTutorial && (
        <button
          onClick={onVerTutorial}
          style={{
            width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 10,
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
            fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10
          }}
        >
          <span>🎓</span> {t('ajustes_ver_tutorial')}
        </button>
      )}

      {esInvitado && (
        <button
          onClick={handleVincularGoogle}
          disabled={vinculando}
          style={{
            width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 10,
            background: 'rgba(79, 107, 255, 0.1)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--accent-blue)', color: 'var(--text-primary)',
            fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10
          }}
        >
          <span>🔵</span>
          <div>
            <div>{vinculando ? t('ajustes_vinculando') : t('ajustes_vincular_google')}</div>
            {!vinculando && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{t('ajustes_vincular_google_desc')}</div>}
          </div>
        </button>
      )}

      <button
        onClick={handleLogout}
        style={{
          width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 10,
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
          fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10
        }}
      >
        <span>🔓</span> {t('ajustes_cerrar_sesion')}
      </button>

      <button
        onClick={() => setConfirmando(true)}
        style={{
          width: '100%', textAlign: 'left', padding: '14px 16px',
          background: 'rgba(251, 113, 133, 0.08)', borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(251, 113, 133, 0.3)', color: 'var(--danger)',
          fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10
        }}
      >
        <span>🗑️</span> {t('ajustes_eliminar_cuenta')}
      </button>

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</p>
      )}

      {/* Preferencias */}
      <div style={{ margin: '24px 0 8px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>{t('ajustes_seccion_preferencias')}</h2>
      </div>

      <section style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)', overflow: 'hidden', marginBottom: 16
      }}>
        <button onClick={() => setMostrarMoneda(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste
            icono="💱" titulo={t('ajustes_moneda')}
            subtitulo={`${MONEDAS.find(m => m.codigo === moneda)?.bandera || ''} ${moneda} - ${MONEDAS.find(m => m.codigo === moneda)?.label || ''}`}
            flecha
          />
        </button>
        <button onClick={() => setMostrarIdioma(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="🌐" titulo={t('ajustes_idioma')} subtitulo={idioma === 'es' ? 'Español' : 'English'} flecha />
        </button>
        <button onClick={() => setMostrarTema(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste
            icono="🎨" titulo={t('ajustes_tema')}
            subtitulo={tema === 'sistema' ? 'Sistema' : tema === 'claro' ? 'Claro' : 'Oscuro'}
            flecha
          />
        </button>
        <button onClick={() => setMostrarCategorias(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="🏷️" titulo={t('ajustes_administrar_categorias')} subtitulo={t('ajustes_personalizar_categorias')} flecha />
        </button>
        <button onClick={() => setMostrarPresupuestos(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="📊" titulo={t('pr_titulo')} subtitulo={t('pr_info')} flecha />
        </button>
        <button onClick={() => setMostrarRecurrentes(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="🔁" titulo="Transacciones Recurrentes" subtitulo="Netflix, renta, sueldo… se crean solos cuando toca" flecha />
        </button>
        <button onClick={() => setMostrarReportes(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="📄" titulo="Reportes en PDF" subtitulo="Descarga un resumen mensual de tus finanzas" flecha />
        </button>

        {pushSoportado() && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
            <span style={{ fontSize: 18 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Notificaciones</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {pushActivo ? 'Activadas en este dispositivo' : 'Recibe alertas de presupuestos y recurrentes'}
              </div>
            </div>
            <button
              onClick={togglePush}
              disabled={cargandoPush}
              aria-label="Activar notificaciones"
              style={{
                width: 46, height: 26, borderRadius: 999, flexShrink: 0, position: 'relative',
                background: pushActivo ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)', opacity: cargandoPush ? 0.6 : 1
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: pushActivo ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.15s'
              }} />
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
          <span style={{ fontSize: 18 }}>👁️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('ajustes_ocultar_saldos')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('ajustes_ocultar_saldos_desc')}</div>
          </div>
          <button
            onClick={toggleOcultarSaldos}
            aria-label="Ocultar saldos"
            style={{
              width: 46, height: 26, borderRadius: 999, flexShrink: 0, position: 'relative',
              background: ocultarSaldos ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: ocultarSaldos ? 22 : 2,
              width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.15s'
            }} />
          </button>
        </div>
      </section>

      {mensaje && (
        <p style={{ color: 'var(--success)', fontSize: 13, margin: '10px 0 0' }}>{mensaje}</p>
      )}

      {/* Datos */}
      <div style={{ margin: '24px 0 8px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>{t('ajustes_seccion_datos')}</h2>
      </div>

      <section style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)', overflow: 'hidden', marginBottom: 16
      }}>
        <button onClick={handleExportar} disabled={exportando} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="⬇️" titulo={t('ajustes_exportar')} subtitulo={exportando ? t('ajustes_exportar_generando') : t('ajustes_exportar_desc')} />
        </button>
        <button onClick={handleSeleccionarArchivoImportar} disabled={importando} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="⬆️" titulo={t('ajustes_importar')} subtitulo={importando ? t('ajustes_importar_cargando') : t('ajustes_importar_desc')} />
        </button>
        <input ref={inputImportarRef} type="file" accept="application/json" onChange={handleImportar} style={{ display: 'none' }} />
        <button onClick={() => setConfirmandoReinicio(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="⏱️" titulo={t('ajustes_reiniciar')} subtitulo={t('ajustes_reiniciar_desc')} />
        </button>
      </section>

      {/* Acerca de la App */}
      <div style={{ margin: '24px 0 8px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>{t('ajustes_acerca')}</h2>
      </div>

      <section style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)', padding: '16px', textAlign: 'center'
      }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>💜</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Kairen Finanzas</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t('ajustes_version')}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{t('ajustes_ecosistema')}</div>
      </section>

      {/* Modal de confirmación para eliminar cuenta */}
      {confirmando && (
        <div
          onClick={() => !eliminando && setConfirmando(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-lg)',
            padding: 24, maxWidth: 320, width: '100%'
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--danger)' }}>
              ¿Eliminar tu cuenta?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Se borrarán permanentemente todas tus transacciones, categorías y datos de ahorro.
              Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmando(false)}
                disabled={eliminando}
                style={{
                  flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13
                }}
              >
                {t('comun_cancelar')}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={eliminando}
                style={{
                  flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
                  background: 'var(--danger)', color: '#fff', fontWeight: 700, fontSize: 13
                }}
              >
                {eliminando ? t('comun_eliminando') : t('comun_si_eliminar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para reiniciar cuenta */}
      {confirmandoReinicio && (
        <div
          onClick={() => !reiniciando && setConfirmandoReinicio(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-lg)',
            padding: 24, maxWidth: 320, width: '100%'
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--warning)' }}>
              ¿Reiniciar tu cuenta?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Se borrarán todas tus transacciones, categorías personalizadas, metas y ahorro externo.
              Tu sesión y tus cuentas (Efectivo/Tarjeta) se conservan, pero con saldo en $0.00.
              Considera exportar tus datos antes, por si quieres conservarlos.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmandoReinicio(false)}
                disabled={reiniciando}
                style={{
                  flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13
                }}
              >
                {t('comun_cancelar')}
              </button>
              <button
                onClick={handleReiniciarCuenta}
                disabled={reiniciando}
                style={{
                  flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
                  background: 'var(--warning)', color: '#1a1500', fontWeight: 700, fontSize: 13
                }}
              >
                {reiniciando ? t('comun_reiniciando') : t('comun_si_reiniciar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilaAjuste({ icono, titulo, subtitulo, etiqueta, flecha }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
      borderBottom: '1px solid var(--border-subtle)'
    }}>
      <span style={{ fontSize: 18 }}>{icono}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{titulo}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitulo}</div>
      </div>
      {etiqueta && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
          border: '1px solid var(--border-subtle)', borderRadius: 999, padding: '2px 8px', flexShrink: 0
        }}>
          {etiqueta}
        </span>
      )}
      {flecha && <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>}
    </div>
  )
}