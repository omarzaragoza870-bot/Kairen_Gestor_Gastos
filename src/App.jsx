import { useState, useEffect } from 'react'
import { supabase } from './lib/supabaseClient.js'
import { asegurarCuentasPorDefecto } from './lib/db.js'
import BottomNav from './components/BottomNav.jsx'
import Inicio from './screens/Inicio.jsx'
import NuevaTransaccion from './screens/NuevaTransaccion.jsx'
import Placeholder from './screens/Placeholder.jsx'
import Login from './screens/Login.jsx'
import Ajustes from './screens/Ajustes.jsx'

export default function App() {
  const [tab, setTab] = useState('inicio')
  const [creando, setCreando] = useState(false)
  const [session, setSession] = useState(undefined) // undefined = cargando, null = sin sesión
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) asegurarCuentasPorDefecto(data.session.user.id)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) asegurarCuentasPorDefecto(newSession.user.id)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Cargando…</div>
  }

  if (!session) {
    return <Login />
  }

  if (creando) {
    return (
      <NuevaTransaccion
        onBack={() => setCreando(false)}
        onGuardada={() => { setCreando(false); setRefreshKey(k => k + 1) }}
      />
    )
  }

  return (
    <div style={{ minHeight: '100dvh', paddingTop: 'var(--safe-top)' }}>
      {tab === 'inicio' && <Inicio onNuevo={() => setCreando(true)} refreshKey={refreshKey} />}
      {tab === 'analisis' && <Placeholder titulo="Análisis" texto="Resumen, distribución y tendencias — próximo paso." />}
      {tab === 'ahorro' && (
        <Placeholder
          titulo="Ahorro externo"
          texto="Anota cuánto llevas acumulado en tus cuentas de banco reales. Solo es referencia: no afecta tu Dinero Disponible ni tus Metas."
        />
      )}
      {tab === 'metas' && <Placeholder titulo="Metas" texto="Crea tu primera meta para comenzar." />}
      {tab === 'ajustes' && <Ajustes />}

      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}