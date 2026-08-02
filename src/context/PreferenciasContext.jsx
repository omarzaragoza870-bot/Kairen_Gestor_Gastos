import { createContext, useContext, useEffect, useState } from 'react'

const CLAVE_OCULTAR = 'kairen_ocultar_saldos'
const CLAVE_MONEDA = 'kairen_moneda'
const CLAVE_TEMA = 'kairen_tema'

export const MONEDAS = [
  { codigo: 'MXN', label: 'Peso Mexicano', bandera: '🇲🇽' },
  { codigo: 'USD', label: 'Dólar Estadounidense', bandera: '🇺🇸' },
  { codigo: 'EUR', label: 'Euro', bandera: '🇪🇺' },
  { codigo: 'COP', label: 'Peso Colombiano', bandera: '🇨🇴' },
  { codigo: 'ARS', label: 'Peso Argentino', bandera: '🇦🇷' },
  { codigo: 'CLP', label: 'Peso Chileno', bandera: '🇨🇱' },
  { codigo: 'PEN', label: 'Sol Peruano', bandera: '🇵🇪' },
  { codigo: 'GTQ', label: 'Quetzal Guatemalteco', bandera: '🇬🇹' }
]

const PreferenciasContext = createContext({
  ocultarSaldos: false, toggleOcultarSaldos: () => {},
  moneda: 'MXN', setMoneda: () => {},
  tema: 'sistema', setTema: () => {}
})

export function PreferenciasProvider({ children }) {
  const [ocultarSaldos, setOcultarSaldos] = useState(() => {
    try { return localStorage.getItem(CLAVE_OCULTAR) === 'true' } catch { return false }
  })
  const [moneda, setMoneda] = useState(() => {
    try { return localStorage.getItem(CLAVE_MONEDA) || 'MXN' } catch { return 'MXN' }
  })
  const [tema, setTema] = useState(() => {
    try { return localStorage.getItem(CLAVE_TEMA) || 'sistema' } catch { return 'sistema' }
  })

  useEffect(() => {
    try { localStorage.setItem(CLAVE_OCULTAR, String(ocultarSaldos)) } catch { /* noop */ }
  }, [ocultarSaldos])

  useEffect(() => {
    try { localStorage.setItem(CLAVE_MONEDA, moneda) } catch { /* noop */ }
  }, [moneda])

  useEffect(() => {
    try { localStorage.setItem(CLAVE_TEMA, tema) } catch { /* noop */ }

    const aplicar = () => {
      let resuelto = tema
      if (tema === 'sistema') {
        const prefiereClaro = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        resuelto = prefiereClaro ? 'claro' : 'oscuro'
      }
      document.documentElement.setAttribute('data-theme', resuelto)
    }

    aplicar()

    if (tema === 'sistema' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: light)')
      mq.addEventListener('change', aplicar)
      return () => mq.removeEventListener('change', aplicar)
    }
  }, [tema])

  const toggleOcultarSaldos = () => setOcultarSaldos(v => !v)

  return (
    <PreferenciasContext.Provider value={{ ocultarSaldos, toggleOcultarSaldos, moneda, setMoneda, tema, setTema }}>
      {children}
    </PreferenciasContext.Provider>
  )
}

export function usePreferencias() {
  return useContext(PreferenciasContext)
}