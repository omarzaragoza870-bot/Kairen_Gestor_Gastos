/** true si la app corre empacada con Capacitor (Android/iOS nativo), false si es la PWA en navegador normal. */
export function esNativo() {
  return typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.())
}
