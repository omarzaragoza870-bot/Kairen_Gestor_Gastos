/**
 * Kairen Finanzas — Widget de Android
 *
 * Envía el saldo disponible/ingresos/gastos al widget de la pantalla de
 * inicio via un plugin nativo personalizado (KairenWidgetPlugin.java).
 * No hace nada en web/iOS — el widget es exclusivo de Android.
 */
import { esNativo } from './capacitor.js'

export async function actualizarWidget({ disponible, ingresos, gastos }) {
  if (!esNativo()) return
  try {
    const { registerPlugin } = await import('@capacitor/core')
    const KairenWidget = registerPlugin('KairenWidget')
    await KairenWidget.actualizar({
      disponible,
      ingresos,
      gastos,
      actualizado: new Date().toISOString()
    })
  } catch (err) {
    console.warn('[widget] No se pudo actualizar:', err.message)
  }
}
