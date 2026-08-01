import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient.js'
import { asegurarCuentasPorDefecto, asegurarCategoriasPorDefecto } from './lib/db.js'
import BottomNav from './components/BottomNav.jsx'
import Inicio from './screens/Inicio.jsx'
import NuevaTransaccion from './screens/NuevaTransaccion.jsx'
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

  useEffect(() => {
    let yaVistoAntes = false
    try { yaVistoAntes = localStorage.getItem(TOUR_STORAGE_KEY) === 'true' } catch { /* noop */ }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        asegurarCuentasPorDefecto(data.session.user.id).catch(console.error)
        asegurarCategoriasPorDefecto(data.session.user.id).catch(console.error)
        if (!yaVistoAntes) setMostrarTour(true)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nueva) => {
      setSession(nueva)
      if (nueva) {
        asegurarCuentasPorDefecto(nueva.user.id).catch(console.error)
        asegurarCategoriasPorDefecto(nueva.user.id).catch(console.error)
        if (!yaVistoAntes) setMostrarTour(true)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="app-loader">Cargando…</div>
  if (!session) return <Login />

  const abrirNueva = () => { setTransaccionEditar(null); setVista('formulario') }
  const abrirEdicion = tx => { setTransaccionEditar(tx); setVista('formulario') }
  const guardada = () => { setRefreshKey(k => k + 1); setVista(transaccionEditar ? 'lista' : 'principal'); setTransaccionEditar(null) }

  return (
    <div id="app-scroll" style={{ height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingTop: 'var(--safe-top)' }}>
      {vista === 'formulario' && (
        <NuevaTransaccion transaccionEditar={transaccionEditar} onBack={() => setVista(transaccionEditar ? 'lista' : 'principal')} onGuardada={guardada} />
      )}

      {vista === 'lista' && (
        <Transacciones refreshKey={refreshKey} onBack={() => setVista('principal')} onEditar={abrirEdicion} onCambio={() => setRefreshKey(k => k + 1)} />
      )}

      {vista === 'principal' && (
        <>
          {tab === 'inicio' && <Inicio onNuevo={abrirNueva} onEditar={abrirEdicion} onVerTodas={() => setVista('lista')} refreshKey={refreshKey} />}
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