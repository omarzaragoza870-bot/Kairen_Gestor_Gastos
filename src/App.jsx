import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient.js'
import { asegurarCuentasPorDefecto, asegurarCategoriasPorDefecto, crearTransaccion, editarTransaccion, crearTransferencia } from './lib/db.js'
import { logError } from './lib/logger.js'
import { useEnLinea } from './hooks/useEnLinea.js'
import { obtenerColaPendiente, sincronizarCola } from './lib/offline.js'
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

  useEffect(() => {
    let yaVistoAntes = false
    try { yaVistoAntes = localStorage.getItem(TOUR_STORAGE_KEY) === 'true' } catch { /* noop */ }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        asegurarCuentasPorDefecto(data.session.user.id).catch(err => logError('Error creando cuentas por defecto', err))
        asegurarCategoriasPorDefecto(data.session.user.id).catch(err => logError('Error creando categorías por defecto', err))
        if (!yaVistoAntes) setMostrarTour(true)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nueva) => {
      setSession(nueva)
      if (nueva) {
        asegurarCuentasPorDefecto(nueva.user.id).catch(err => logError('Error creando cuentas por defecto', err))
        asegurarCategoriasPorDefecto(nueva.user.id).catch(err => logError('Error creando categorías por defecto', err))
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