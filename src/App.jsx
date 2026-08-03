import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient.js'
import { asegurarCuentasPorDefecto, asegurarCategoriasPorDefecto, crearTransaccion, editarTransaccion, crearTransferencia, obtenerCuentas, obtenerCategorias, obtenerTransaccionesPorMes, obtenerMetas, obtenerAhorroExterno } from './lib/db.js'
import { logError } from './lib/logger.js'
import { useEnLinea } from './hooks/useEnLinea.js'
import { obtenerColaPendiente, sincronizarCola, conRespaldoOffline } from './lib/offline.js'
import BannerSinConexion from './components/BannerSinConexion.jsx'
import BottomNav from './components/BottomNav.jsx'
import Inicio from './screens/Inicio.jsx'
import NuevaTransaccion from './screens/NuevaTransaccion.jsx'
import NuevaTransferencia from './screens/NuevaTransferencia.jsx'
import Transacciones from './screens/Transacciones.jsx'
import Analisis from './screens/Analisis.jsx'
import AhorroExterno from './screens/AhorroExterno.jsx'
import Metas from './screens/Metas.jsx'
import Placeholder from './screens/Placeholder.jsx'
import Login from './screens/Login.jsx'
import Ajustes from './screens/Ajustes.jsx'
import OnboardingTour, { TOUR_STORAGE_KEY } from './components/OnboardingTour.jsx'
import { PreferenciasProvider } from './context/PreferenciasContext.jsx'
import { esNativo } from './lib/capacitor.js'

function AppInner() {
  const [tab, setTab] = useState('inicio')
  const [vista, setVista] = useState('principal')
  const [transaccionEditar, setTransaccionEditar] = useState(null)
  const [session, setSession] = useState(undefined)
  const [refreshKey, setRefreshKey] = useState(0)
  const [mostrarTour, setMostrarTour] = useState(false)
  const enLinea = useEnLinea()
  const [pendientes, setPendientes] = useState(0)

  const actualizarConteoPendientes = async () => {
    const cola = await obtenerColaPendiente()
    setPendientes(cola.length)
  }

  const ejecutarOperacionPendiente = async (op) => {
    if (op.accion === 'crearTransaccion') return crearTransaccion(op.datos)
    if (op.accion === 'editarTransaccion') return editarTransaccion(op.datos)
    if (op.accion === 'crearTransferencia') return crearTransferencia(op.datos)
    throw new Error(`Acción offline desconocida: ${op.accion}`)
  }

  useEffect(() => {
    actualizarConteoPendientes()
  }, [])

  useEffect(() => {
    if (!enLinea) return
    // Al recuperar conexión, intenta sincronizar todo lo que quedó pendiente
    sincronizarCola(ejecutarOperacionPendiente)
      .then(sincronizadas => {
        actualizarConteoPendientes()
        if (sincronizadas > 0) setRefreshKey(k => k + 1)
      })
      .catch(err => logError('Error sincronizando cola offline', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea])

  const precargarOffline = (uid) => {
    // Precarga en segundo plano todo lo que las pantallas principales
    // necesitan, sin que el usuario tenga que visitarlas primero.
    conRespaldoOffline(`cuentas:${uid}`, () => obtenerCuentas(uid)).catch(() => {})
    conRespaldoOffline(`categorias:${uid}`, () => obtenerCategorias(uid)).catch(() => {})
    const hoy = new Date()
    conRespaldoOffline(`inicio:${uid}:${hoy.getFullYear()}-${hoy.getMonth()}`, () => obtenerTransaccionesPorMes(uid, hoy)).catch(() => {})
    conRespaldoOffline(`analisis:${uid}:${hoy.getFullYear()}-${hoy.getMonth()}`, () => obtenerTransaccionesPorMes(uid, hoy)).catch(() => {})
    conRespaldoOffline(`metas:${uid}`, () => obtenerMetas(uid)).catch(() => {})
    conRespaldoOffline(`ahorro-externo:${uid}`, () => obtenerAhorroExterno(uid)).catch(() => {})
  }

  useEffect(() => {
    if (!esNativo()) return
    let listenerHandle = null
    let desmontado = false
    let urlYaProcesada = null // evita procesar el mismo deep link dos veces (causaba "flow_state_already_used")
    ;(async () => {
      const { App: CapacitorApp } = await import('@capacitor/app')
      const { Browser } = await import('@capacitor/browser')

      // Cuando la app vuelve a primer plano (el usuario regresa desde el navegador
      // tras el login con Google), intentamos recuperar la sesión que Supabase ya
      // pudo haber creado — aunque el deep link no haya llegado por appUrlOpen.
      const listenerResume = await CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) return
        const { data } = await supabase.auth.getSession()
        if (data?.session) {
          Browser.close().catch(() => {})
          // onAuthStateChange en el otro useEffect detecta la sesión y actualiza la UI
        }
      })

      const nuevoListener = await CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
        if (!url.startsWith('com.kairen.finanzas://login-callback') &&
            !url.startsWith('https://kairen-gestor-gastos.vercel.app/auth/callback')) return
        if (urlYaProcesada === url) return
        urlYaProcesada = url
        try {
          // Implicit flow: el token llega en el hash de la URL (#access_token=...)
          // en vez de como código (?code=...) que requería PKCE + flow state.
          if (url.includes('access_token')) {
            const hashParams = new URLSearchParams(url.split('#')[1] || '')
            const accessToken = hashParams.get('access_token')
            const refreshToken = hashParams.get('refresh_token')
            if (accessToken) {
              await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken || '' })
            }
          } else {
            await supabase.auth.exchangeCodeForSession(url)
          }
        } catch (err) {
          logError('Error completando login nativo', err)
        } finally {
          Browser.close().catch(() => {})
        }
      })

      if (desmontado) {
        nuevoListener.remove()
        listenerResume.remove()
      } else {
        listenerHandle = { remove: () => { nuevoListener.remove(); listenerResume.remove() } }
      }
    })()
    return () => {
      desmontado = true
      listenerHandle?.remove()
    }
  }, [])

  useEffect(() => {
    let yaVistoAntes = false
    try { yaVistoAntes = localStorage.getItem(TOUR_STORAGE_KEY) === 'true' } catch { /* noop */ }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        const uid = data.session.user.id
        asegurarCuentasPorDefecto(uid).catch(err => logError('Error creando cuentas por defecto', err))
        asegurarCategoriasPorDefecto(uid).catch(err => logError('Error creando categorías por defecto', err))
        precargarOffline(uid)
        if (!yaVistoAntes) setMostrarTour(true)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nueva) => {
      setSession(nueva)
      if (nueva) {
        const uid = nueva.user.id
        asegurarCuentasPorDefecto(uid).catch(err => logError('Error creando cuentas por defecto', err))
        asegurarCategoriasPorDefecto(uid).catch(err => logError('Error creando categorías por defecto', err))
        precargarOffline(uid)
        if (!yaVistoAntes) setMostrarTour(true)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="app-loader">Cargando…</div>
  if (!session) return <Login />

  const abrirNueva = () => { setTransaccionEditar(null); setVista('formulario') }
  const abrirEdicion = tx => { setTransaccionEditar(tx); setVista('formulario') }
  const guardada = () => { setRefreshKey(k => k + 1); actualizarConteoPendientes(); setVista(transaccionEditar ? 'lista' : 'principal'); setTransaccionEditar(null) }
  const abrirTransferencia = () => setVista('transferencia')
  const transferenciaGuardada = () => { setRefreshKey(k => k + 1); actualizarConteoPendientes(); setVista('principal') }

  return (
    <div id="app-scroll" style={{ height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingTop: 'var(--safe-top)' }}>
      {!enLinea && <BannerSinConexion pendientes={pendientes} />}

      {vista === 'formulario' && (
        <NuevaTransaccion transaccionEditar={transaccionEditar} onBack={() => setVista(transaccionEditar ? 'lista' : 'principal')} onGuardada={guardada} />
      )}

      {vista === 'transferencia' && (
        <NuevaTransferencia onBack={() => setVista('principal')} onGuardada={transferenciaGuardada} />
      )}

      {vista === 'lista' && (
        <Transacciones refreshKey={refreshKey} onBack={() => setVista('principal')} onEditar={abrirEdicion} onCambio={() => setRefreshKey(k => k + 1)} />
      )}

      {vista === 'principal' && (
        <>
          {tab === 'inicio' && <Inicio onNuevo={abrirNueva} onNuevaTransferencia={abrirTransferencia} onEditar={abrirEdicion} onVerTodas={() => setVista('lista')} refreshKey={refreshKey} />}
          {tab === 'analisis' && <Analisis />}
          {tab === 'ahorro' && <AhorroExterno />}
          {tab === 'metas' && <Metas />}
          {tab === 'ajustes' && <Ajustes onVerTutorial={() => setMostrarTour(true)} />}
          <BottomNav active={tab} onChange={setTab} />
        </>
      )}

      {mostrarTour && <OnboardingTour onFinalizar={() => setMostrarTour(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <PreferenciasProvider>
      <AppInner />
    </PreferenciasProvider>
  )
}