import { createContext, useContext, useEffect, useState } from 'react'

const CLAVE_STORAGE = 'kairen_ocultar_saldos'
const PreferenciasContext = createContext({ ocultarSaldos: false, toggleOcultarSaldos: () => {} })

export function PreferenciasProvider({ children }) {
  const [ocultarSaldos, setOcultarSaldos] = useState(() => {
    try { return localStorage.getItem(CLAVE_STORAGE) === 'true' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem(CLAVE_STORAGE, String(ocultarSaldos)) } catch { /* noop */ }
  }, [ocultarSaldos])

  const toggleOcultarSaldos = () => setOcultarSaldos(v => !v)

  return (
    <PreferenciasContext.Provider value={{ ocultarSaldos, toggleOcultarSaldos }}>
      {children}
    </PreferenciasContext.Provider>
  )
}

export function usePreferencias() {
  return useContext(PreferenciasContext)
}
