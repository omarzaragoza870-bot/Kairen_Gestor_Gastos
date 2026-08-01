import { useState } from 'react'
import { useScrollLock } from '../hooks/useScrollLock.js'

export const TOUR_STORAGE_KEY = 'kairen_tour_completado'

const pasos = [
  {
    icono: '👋',
    titulo: 'Bienvenido a Kairen Finanzas',
    texto: 'Un recorrido rápido de 30 segundos para que sepas dónde está todo. Puedes saltarlo cuando quieras.'
  },
  {
    icono: '➕',
    titulo: 'El botón (+)',
    texto: 'Desde Inicio, este botón te deja registrar un Gasto o un Ingreso. Es la acción que más vas a usar.'
  },
  {
    icono: '💵',
    titulo: 'Cuentas: Efectivo y Tarjeta',
    texto: 'Al registrar un movimiento eliges de dónde sale o a dónde entra el dinero. Son cuentas internas de la app — no están conectadas a tu banco real.'
  },
  {
    icono: '🏷️',
    titulo: 'Categorías',
    texto: 'Cada movimiento se clasifica en una categoría (Alimentación, Transporte, etc.) para que Análisis pueda mostrarte en qué se te va el dinero.'
  },
  {
    icono: '📊',
    titulo: 'Análisis',
    texto: 'Aquí ves tu Resumen (ingresos vs gastos), la Distribución por categoría, y Tendencias con hábitos e insights automáticos sobre tu mes.'
  },
  {
    icono: '🏦',
    titulo: 'Ahorro externo',
    texto: 'Esta sección es solo para anotar cuánto llevas en tus cuentas de banco reales, como referencia. No mueve dinero real ni afecta tu Dinero Disponible.'
  },
  {
    icono: '⚙️',
    titulo: 'Ajustes',
    texto: 'Ahí ves tu sesión de Google, puedes cerrar sesión (tus datos quedan guardados) o eliminar tu cuenta por completo. Y puedes volver a ver este tutorial cuando quieras.'
  }
]

export default function OnboardingTour({ onFinalizar }) {
  const [paso, setPaso] = useState(0)
  useScrollLock(true)
  const actual = pasos[paso]
  const esUltimo = paso === pasos.length - 1

  const cerrar = () => {
    try { localStorage.setItem(TOUR_STORAGE_KEY, 'true') } catch { /* noop */ }
    onFinalizar?.()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24
    }}>
      <div style={{
        background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-lg)',
        padding: 28, maxWidth: 340, width: '100%', textAlign: 'center'
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{actual.icono}</div>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px' }}>{actual.titulo}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 22px' }}>
          {actual.texto}
        </p>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
          {pasos.map((_, i) => (
            <span key={i} style={{
              width: i === paso ? 18 : 6, height: 6, borderRadius: 3,
              background: i === paso ? 'var(--gradient-brand)' : 'var(--border-subtle)',
              transition: 'width 0.2s'
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {paso > 0 && (
            <button
              onClick={() => setPaso(p => p - 1)}
              style={{ flex: 1, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}
            >
              Atrás
            </button>
          )}
          <button
            onClick={() => esUltimo ? cerrar() : setPaso(p => p + 1)}
            style={{ flex: 2, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--gradient-brand)', color: '#fff', fontWeight: 700, fontSize: 13 }}
          >
            {esUltimo ? 'Empezar a usar Kairen' : 'Siguiente'}
          </button>
        </div>

        {!esUltimo && (
          <button
            onClick={cerrar}
            style={{ marginTop: 14, background: 'transparent', color: 'var(--text-muted)', fontSize: 12 }}
          >
            Saltar tutorial
          </button>
        )}
      </div>
    </div>
  )
}