import { useEffect, useLayoutEffect, useState } from 'react'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { pasosTour } from '../i18n/translations.js'

export const TOUR_STORAGE_KEY = 'kairen_tour_completado'

const MARGEN = 16
const HOLGURA = 6
const ANCHO_BURBUJA = 300

/**
 * Tutorial que señala la pantalla real: oscurece la app, deja un hueco sobre
 * el elemento marcado con data-tour="<objetivo>" y pone al lado una burbuja
 * corta. Si el elemento no aparece (pantalla aún cargando), la burbuja se
 * muestra centrada para no dejar al usuario atorado.
 */
export default function OnboardingTour({ onFinalizar }) {
  const [paso, setPaso] = useState(0)
  const [rect, setRect] = useState(null)
  const { idioma, t } = usePreferencias()
  const pasos = pasosTour[idioma] || pasosTour.es
  useScrollLock(true)
  const actual = pasos[paso]
  const esUltimo = paso === pasos.length - 1

  // Inicio se carga en diferido: se reintenta unos cuadros hasta encontrar el objetivo
  useLayoutEffect(() => {
    let cuadro
    let intentos = 0
    const medir = () => {
      const el = document.querySelector(`[data-tour="${actual.objetivo}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } else if (intentos++ < 60) {
        cuadro = requestAnimationFrame(medir)
      } else {
        setRect(null)
      }
    }
    medir()
    window.addEventListener('resize', medir)
    return () => { cancelAnimationFrame(cuadro); window.removeEventListener('resize', medir) }
  }, [actual.objetivo])

  useEffect(() => {
    const alTeclear = e => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  })

  const cerrar = () => {
    try { localStorage.setItem(TOUR_STORAGE_KEY, 'true') } catch { /* noop */ }
    onFinalizar?.()
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const ancho = Math.min(ANCHO_BURBUJA, vw - MARGEN * 2)
  let burbuja = { top: '50%', left: (vw - ancho) / 2, transform: 'translateY(-50%)' }
  let flecha = null

  if (rect) {
    const centro = rect.left + rect.width / 2
    const left = Math.min(Math.max(centro - ancho / 2, MARGEN), vw - ancho - MARGEN)
    const flechaX = Math.min(Math.max(centro - left, 20), ancho - 20)
    // Los objetivos viven abajo (botón + y barra), así que casi siempre va encima
    if (rect.top + rect.height / 2 > vh / 2) {
      burbuja = { bottom: vh - rect.top + HOLGURA + 14, left }
      flecha = { bottom: -6, left: flechaX - 6 }
    } else {
      burbuja = { top: rect.top + rect.height + HOLGURA + 14, left }
      flecha = { top: -6, left: flechaX - 6 }
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={actual.titulo} style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      {/* Capa transparente que bloquea los toques a la app mientras dura el tour */}
      <div style={{ position: 'absolute', inset: 0 }} />

      {rect ? (
        <div style={{
          position: 'fixed', pointerEvents: 'none',
          top: rect.top - HOLGURA, left: rect.left - HOLGURA,
          width: rect.width + HOLGURA * 2, height: rect.height + HOLGURA * 2,
          borderRadius: Math.min(rect.width, rect.height) / 2 + HOLGURA,
          // El aro claro hace visible el hueco también en tema oscuro
          boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.85), 0 0 0 9999px rgba(0, 0, 0, 0.7)',
          transition: 'all 0.35s var(--ease-ios)'
        }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.7)' }} />
      )}

      <div style={{
        position: 'fixed', width: ancho, ...burbuja,
        background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-lg)',
        padding: '16px 18px', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
        transition: 'left 0.35s var(--ease-ios), bottom 0.35s var(--ease-ios), top 0.35s var(--ease-ios)'
      }}>
        {flecha && (
          <span style={{
            position: 'absolute', ...flecha, width: 12, height: 12,
            background: 'var(--bg-surface-2)', transform: 'rotate(45deg)'
          }} />
        )}

        <div aria-live="polite">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{actual.titulo}</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>{actual.texto}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 5, flex: 1 }}>
            {pasos.map((_, i) => (
              <span key={i} style={{
                width: i === paso ? 16 : 6, height: 6, borderRadius: 3,
                background: i === paso ? 'var(--accent)' : 'var(--border-subtle)',
                transition: 'width 0.2s'
              }} />
            ))}
          </div>
          {!esUltimo && (
            <button onClick={cerrar} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: 13, padding: '8px 4px' }}>
              {t('tour_saltar')}
            </button>
          )}
          <button
            onClick={() => esUltimo ? cerrar() : setPaso(p => p + 1)}
            style={{ padding: '9px 16px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600, fontSize: 13 }}
          >
            {esUltimo ? t('tour_empezar') : t('tour_siguiente')}
          </button>
        </div>
      </div>
    </div>
  )
}
