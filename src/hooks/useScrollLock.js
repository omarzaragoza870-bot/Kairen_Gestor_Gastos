import { useEffect } from 'react'

/**
 * Bloquea el scroll del contenedor principal de la app mientras `locked` sea true.
 * Se usa en cualquier modal/overlay (calendarios, formularios, confirmaciones)
 * para que el contenido de atrás no se siga desplazando.
 */
export function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return
    const el = document.getElementById('app-scroll') || document.body
    const anterior = el.style.overflowY
    el.style.overflowY = 'hidden'
    return () => { el.style.overflowY = anterior || 'auto' }
  }, [locked])
}