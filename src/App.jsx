import { useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import Inicio from './screens/Inicio.jsx'
import NuevaTransaccion from './screens/NuevaTransaccion.jsx'
import Placeholder from './screens/Placeholder.jsx'

export default function App() {
  const [tab, setTab] = useState('inicio')
  const [creando, setCreando] = useState(false)

  if (creando) {
    return <NuevaTransaccion onBack={() => setCreando(false)} />
  }

  return (
    <div style={{ minHeight: '100dvh', paddingTop: 'var(--safe-top)' }}>
      {tab === 'inicio' && <Inicio onNuevo={() => setCreando(true)} />}
      {tab === 'analisis' && <Placeholder titulo="Análisis" texto="Resumen, distribución y tendencias — próximo paso." />}
      {tab === 'ahorro' && (
        <Placeholder
          titulo="Ahorro externo"
          texto="Anota cuánto llevas acumulado en tus cuentas de banco reales. Solo es referencia: no afecta tu Dinero Disponible ni tus Metas."
        />
      )}
      {tab === 'metas' && <Placeholder titulo="Metas" texto="Crea tu primera meta para comenzar." />}
      {tab === 'ajustes' && <Placeholder titulo="Ajustes" texto="Perfil, sync con Google, categorías y más." />}

      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}
