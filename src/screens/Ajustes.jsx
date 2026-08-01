import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import InfoTooltip from '../components/InfoTooltip.jsx'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { exportarTodosLosDatos, importarTodosLosDatos, reiniciarCuentaActual } from '../lib/db.js'
import Categorias from './Categorias.jsx'

export default function Ajustes({ onVerTutorial }) {
  const { ocultarSaldos, toggleOcultarSaldos } = usePreferencias()
  const [user, setUser] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [confirmandoReinicio, setConfirmandoReinicio] = useState(false)
  const [mostrarCategorias, setMostrarCategorias] = useState(false)
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

  const handleLogout = async () => {
    await supabase.auth.signOut()
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

      await supabase.auth.signOut()
    } catch (err) {
      setError('No se pudo eliminar la cuenta. Intenta de nuevo o contáctanos.')
      console.error('[Kairen Finanzas] Error al eliminar cuenta:', err)
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
      setError(err.message || 'No se pudo exportar tus datos.')
    } finally {
      setExportando(false)
    }
  }

  const handleSeleccionarArchivoImportar = () => inputImportarRef.current?.click()

  const handleImportar = async (e) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo || !user) return

    setImportando(true)
    setError(null)
    setMensaje(null)
    try {
      const texto = await archivo.text()
      const datos = JSON.parse(texto)
      await importarTodosLosDatos(user.id, datos)
      setMensaje('Datos importados correctamente. Los verás reflejados en Inicio, Análisis, etc.')
    } catch (err) {
      setError('No se pudo importar el archivo. Verifica que sea un respaldo válido de Kairen Finanzas.')
      console.error('[Kairen Finanzas] Error al importar:', err)
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
      setError(err.message || 'No se pudo reiniciar la cuenta.')
    } finally {
      setReiniciando(false)
    }
  }


  const nombre = user?.user_metadata?.full_name || user?.user_metadata?.name || 'Usuario'
  const avatar = user?.user_metadata?.avatar_url
  const email = user?.email

  if (mostrarCategorias && user) {
    return <Categorias userId={user.id} onBack={() => setMostrarCategorias(false)} />
  }

  return (
    <div style={{ padding: '16px 16px 100px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 20px' }}>Ajustes</h1>

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
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
          <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 2 }}>● Sesión iniciada con Google</div>
        </div>
      </section>

      {/* Cuenta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 8px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>Cuenta</h2>
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
          <span>🎓</span> Ver tutorial de nuevo
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
        <span>🔓</span> Cerrar sesión
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
        <span>🗑️</span> Eliminar cuenta
      </button>

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</p>
      )}

      {/* Preferencias */}
      <div style={{ margin: '24px 0 8px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>Preferencias</h2>
      </div>

      <section style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)', overflow: 'hidden', marginBottom: 16
      }}>
        <FilaAjuste icono="💱" titulo="Moneda" subtitulo="🇲🇽 MXN - Peso Mexicano" etiqueta="Próximamente" />
        <FilaAjuste icono="🌐" titulo="Idioma" subtitulo="Español" />
        <FilaAjuste icono="🎨" titulo="Tema" subtitulo="Oscuro (KAIREN)" etiqueta="Próximamente" />
        <button onClick={() => setMostrarCategorias(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="🏷️" titulo="Administrar categorías" subtitulo="Personalizar categorías" flecha />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
          <span style={{ fontSize: 18 }}>👁️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Ocultar saldos</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Oculta las cifras de tu balance general y cuentas</div>
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
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>Datos</h2>
      </div>

      <section style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)', overflow: 'hidden', marginBottom: 16
      }}>
        <button onClick={handleExportar} disabled={exportando} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="⬇️" titulo="Exportar Datos" subtitulo={exportando ? 'Generando archivo…' : 'Guarda una copia de tus datos actuales'} />
        </button>
        <button onClick={handleSeleccionarArchivoImportar} disabled={importando} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="⬆️" titulo="Importar Datos" subtitulo={importando ? 'Importando…' : 'Carga datos desde un archivo exportado anteriormente'} />
        </button>
        <input ref={inputImportarRef} type="file" accept="application/json" onChange={handleImportar} style={{ display: 'none' }} />
        <button onClick={() => setConfirmandoReinicio(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent' }}>
          <FilaAjuste icono="⏱️" titulo="Reiniciar Cuenta Actual" subtitulo="Volver tu cuenta a su estado inicial" />
        </button>
      </section>

      {/* Acerca de la App */}
      <div style={{ margin: '24px 0 8px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>Acerca de la App</h2>
      </div>

      <section style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)', padding: '16px', textAlign: 'center'
      }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>💜</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Kairen Finanzas</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Versión 1.0.0</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Parte del ecosistema KAIREN</div>
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
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={eliminando}
                style={{
                  flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
                  background: 'var(--danger)', color: '#fff', fontWeight: 700, fontSize: 13
                }}
              >
                {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
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
                Cancelar
              </button>
              <button
                onClick={handleReiniciarCuenta}
                disabled={reiniciando}
                style={{
                  flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
                  background: 'var(--warning)', color: '#1a1500', fontWeight: 700, fontSize: 13
                }}
              >
                {reiniciando ? 'Reiniciando…' : 'Sí, reiniciar'}
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