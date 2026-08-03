import { useEffect, useState } from 'react'
import { obtenerConectividad, suscribirseConectividad, marcarConectividad } from '../lib/offline.js'

export function useEnLinea() {
  const [enLinea, setEnLinea] = useState(obtenerConectividad())

  useEffect(() => {
    // Señal 1: evento real del navegador (desconexión real de WiFi/datos)
    const marcarEnLinea = () => marcarConectividad(true)
    const marcarSinConexion = () => marcarConectividad(false)
    window.addEventListener('online', marcarEnLinea)
    window.addEventListener('offline', marcarSinConexion)

    // Señal 2: alguna petición de red real tuvo éxito o falló
    // (esto es lo que sí detecta el modo "Offline" de las DevTools)
    const desuscribir = suscribirseConectividad(setEnLinea)

    return () => {
      window.removeEventListener('online', marcarEnLinea)
      window.removeEventListener('offline', marcarSinConexion)
      desuscribir()
    }
  }, [])

  return enLinea
}