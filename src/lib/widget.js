/**
 * Kairen Finanzas — Widget de Android
 *
 * Envía el saldo disponible/ingresos/gastos al widget de la pantalla de
 * inicio via un plugin nativo personalizado (KairenWidgetPlugin.java).
 * No hace nada en web/iOS — el widget es exclusivo de Android.
 */
import { esNativo } from './capacitor.js'

// Capacitor solo permite registrar un plugin una vez; se reutiliza la instancia
let kairenWidget = null

export async function actualizarWidget({ disponible, ingresos, gastos }) {
  if (!esNativo()) return
  try {
    if (!kairenWidget) {
      const { registerPlugin } = await import('@capacitor/core')
      kairenWidget = registerPlugin('KairenWidget')
    }
    await kairenWidget.actualizar({
      disponible,
      ingresos,
      gastos,
      actualizado: new Date().toISOString()
    })
  } catch (err) {
    console.warn('[widget] No se pudo actualizar:', err.message)
  }
}
