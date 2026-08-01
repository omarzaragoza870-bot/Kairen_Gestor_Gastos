import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient.js'
import { asegurarCuentasPorDefecto } from './lib/db.js'
import BottomNav from './components/BottomNav.jsx'
import Inicio from './screens/Inicio.jsx'
import NuevaTransaccion from './screens/NuevaTransaccion.jsx'
import Transacciones from './screens/Transacciones.jsx'
import Analisis from './screens/Analisis.jsx'
import Placeholder from './screens/Placeholder.jsx'
import Login from './screens/Login.jsx'
import Ajustes from './screens/Ajustes.jsx'

export default function App() {
  const [tab, setTab] = useState('inicio')
  const [vista, setVista] = useState('principal')
  const [transaccionEditar, setTransaccionEditar] = useState(null)
  const [session, setSession] = useState(undefined)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) asegurarCuentasPorDefecto(data.session.user.id).catch(console.error)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nueva) => {
      setSession(nueva)
      if (nueva) asegurarCuentasPorDefecto(nueva.user.id).catch(console.error)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="app-loader">Cargando…</div>
  if (!session) return <Login />

  const abrirNueva = () => { setTransaccionEditar(null); setVista('formulario') }
  const abrirEdicion = tx => { setTransaccionEditar(tx); setVista('formulario') }
  const guardada = () => { setRefreshKey(k => k + 1); setVista(transaccionEditar ? 'lista' : 'principal'); setTransaccionEditar(null) }

  if (vista === 'formulario') return <NuevaTransaccion transaccionEditar={transaccionEditar} onBack={() => setVista(transaccionEditar ? 'lista' : 'principal')} onGuardada={guardada} />
  if (vista === 'lista') return <Transacciones refreshKey={refreshKey} onBack={() => setVista('principal')} onEditar={abrirEdicion} onCambio={() => setRefreshKey(k => k + 1)} />

  return (
    <div style={{ minHeight: '100dvh', paddingTop: 'var(--safe-top)' }}>
      {tab === 'inicio' && <Inicio onNuevo={abrirNueva} onEditar={abrirEdicion} onVerTodas={() => setVista('lista')} refreshKey={refreshKey} />}
      {tab === 'analisis' && <Analisis />}
      {tab === 'ahorro' && <Placeholder titulo="Ahorro externo" texto="Registra cuánto llevas en cuentas externas sin modificar tu dinero disponible ni tus metas." />}
      {tab === 'metas' && <Placeholder titulo="Metas" texto="Crea tu primera meta para comenzar." />}
      {tab === 'ajustes' && <Ajustes />}
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}