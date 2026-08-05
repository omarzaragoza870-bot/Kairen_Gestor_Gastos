import { useEffect, useState, lazy, Suspense } from 'react'
import { supabase } from './lib/supabaseClient.js'
import { asegurarCuentasPorDefecto, asegurarCategoriasPorDefecto, crearTransaccion, editarTransaccion, crearTransferencia, obtenerCuentas, obtenerCategorias, obtenerTransaccionesPorMes, obtenerMetas, obtenerAhorroExterno, procesarRecurrentes } from './lib/db.js'
import { logError } from './lib/logger.js'
import { useEnLinea } from './hooks/useEnLinea.js'
import { obtenerColaPendiente, sincronizarCola, conRespaldoOffline } from './lib/offline.js'
import BannerSinConexion from './components/BannerSinConexion.jsx'
import BottomNav from './components/BottomNav.jsx'
import Login from './screens/Login.jsx'
import OnboardingTour, { TOUR_STORAGE_KEY } from './components/OnboardingTour.jsx'
import { PreferenciasProvider } from './context/PreferenciasContext.jsx'
import { esNativo } from './lib/capacitor.js'

// Inicializar Firebase Messaging en la app nativa (Android)
// Se hace aquí para que el token FCM esté disponible lo antes posible
async function inicializarFirebaseMessaging(userId) {
  if (!esNativo()) return
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')

    // Pedir permiso de notificaciones
    const { receive } = await FirebaseMessaging.requestPermissions()
    if (receive !== 'granted') return

    // Obtener el token FCM de este dispositivo
    const { token } = await FirebaseMessaging.getToken()
    if (!token) return

    // Guardar el token en Supabase para poder enviarle notificaciones
    await supabase.from('fcm_tokens').upsert({
      user_id: userId,
      token,
      plataforma: 'android'
    }, { onConflict: 'user_id,token' })

    // Escuchar notificaciones cuando la app está en primer plano
    await FirebaseMessaging.addListener('notificationReceived', ({ notification }) => {
      console.log('[FCM] Notificación recibida:', notification.title)
    })

    // Cuando el usuario toca la notificación
    await FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
      console.log('[FCM] Notificación tocada:', notification.notification?.title)
    })
  } catch (err) {
    logError('Error inicializando Firebase Messaging', err)
  }
}

// Pantallas cargadas solo cuando el usuario las visita (code splitting)
// — reduce el bundle inicial de ~510 KB a ~150-200 KB
const Inicio = lazy(() => import('./screens/Inicio.jsx'))
const NuevaTransaccion = lazy(() => import('./screens/NuevaTransaccion.jsx'))
const NuevaTransferencia = lazy(() => import('./screens/NuevaTransferencia.jsx'))
const Transacciones = lazy(() => import('./screens/Transacciones.jsx'))
const Analisis = lazy(() => import('./screens/Analisis.jsx'))
const AhorroExterno = lazy(() => import('./screens/AhorroExterno.jsx'))
const Metas = lazy(() => import('./screens/Metas.jsx'))
const Ajustes = lazy(() => import('./screens/Ajustes.jsx'))

// Spinner mínimo mientras carga una pantalla nueva
function CargandoPantalla() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--border-subtle)', borderTopColor: 'var(--accent-blue)', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function AppInner() {
  const [tab, setTab] = useState('inicio')
  const [vista, setVista] = useState('principal')
  const [transaccionEditar, setTransaccionEditar] = useState(null)
  const [session, setSession] = useState(undefined)
  const [refreshKey, setRefreshKey] = useState(0)
  const [mostrarTour, setMostrarTour] = useState(false)
  const [tipoPreseleccionado, setTipoPreseleccionado] = useState('gasto')
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
        // Deep link de los botones rápidos del widget: abre directo el
        // formulario de Nueva Transacción con el tipo ya preseleccionado.
        // Usamos los setters de useState (definidos arriba, antes de
        // cualquier return condicional) para que esto funcione sin
        // importar en qué momento del ciclo de vida se dispare.
        if (url.startsWith('com.kairen.finanzas://nueva-transaccion')) {
          const params = new URL(url).searchParams
          const tipo = params.get('tipo') === 'ingreso' ? 'ingreso' : 'gasto'
          setTransaccionEditar(null)
          setTipoPreseleccionado(tipo)
          setVista('formulario')
          return
        }

        if (!url.startsWith('com.kairen.finanzas://login-callback') &&
            !url.startsWith('https://kairen-gestor-gastos.vercel.app/auth/callback')) return
        if (urlYaProcesada === url) return
        urlYaProcesada = url
        try {
          // PKCE flow: el código llega como ?code=... en la URL.
          // El flow_state se persiste en Capacitor Preferences para que
          // sobreviva el viaje al navegador externo y de regreso al WebView.
          await supabase.auth.exchangeCodeForSession(url)
        } catch (err) {
          logError('Error completando login nativo con PKCE', err)
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

    // Se ejecuta UNA sola vez por usuario/sesión — evita la condición de
    // carrera que creaba cuentas/categorías por defecto duplicadas cuando
    // getSession() y onAuthStateChange() se disparaban casi al mismo tiempo.
    let yaInicializado = false

    const inicializarUsuario = (uid) => {
      if (yaInicializado) return
      yaInicializado = true
      asegurarCuentasPorDefecto(uid).catch(err => logError('Error creando cuentas por defecto', err))
      asegurarCategoriasPorDefecto(uid).catch(err => logError('Error creando categorías por defecto', err))
      precargarOffline(uid)
      procesarRecurrentes().then(n => { if (n > 0) setRefreshKey(k => k + 1) }).catch(() => {})
      inicializarFirebaseMessaging(uid)
      if (!yaVistoAntes) setMostrarTour(true)
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) inicializarUsuario(data.session.user.id)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nueva) => {
      setSession(nueva)
      // 'INITIAL_SESSION' ya lo maneja el getSession() de arriba — solo nos
      // interesa aquí un login/token nuevo genuino (ej. el usuario acaba de
      // iniciar sesión desde la pantalla de Login, o vincular con Google).
      if (nueva && event !== 'INITIAL_SESSION') {
        inicializarUsuario(nueva.user.id)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="app-loader">Cargando…</div>
  if (!session) return <Login />

  const abrirNueva = () => { setTransaccionEditar(null); setTipoPreseleccionado('gasto'); setVista('formulario') }
  const abrirEdicion = tx => { setTransaccionEditar(tx); setVista('formulario') }
  const guardada = () => { setRefreshKey(k => k + 1); actualizarConteoPendientes(); setVista(transaccionEditar ? 'lista' : 'principal'); setTransaccionEditar(null) }
  const abrirTransferencia = () => setVista('transferencia')
  const transferenciaGuardada = () => { setRefreshKey(k => k + 1); actualizarConteoPendientes(); setVista('principal') }

  return (
    <div id="app-scroll" style={{ height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingTop: 'var(--safe-top)' }}>
      {!enLinea && <BannerSinConexion pendientes={pendientes} />}

      <Suspense fallback={<CargandoPantalla />}>
        {vista === 'formulario' && (
          <NuevaTransaccion transaccionEditar={transaccionEditar} tipoInicial={tipoPreseleccionado} onBack={() => setVista(transaccionEditar ? 'lista' : 'principal')} onGuardada={guardada} />
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
      </Suspense>

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