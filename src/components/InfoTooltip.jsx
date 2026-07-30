import { useState } from 'react'

/**
 * Icono (i) que se coloca junto a cualquier tarjeta o control.
 * Al presionarlo, abre un popover corto explicando qué hace ese
 * elemento. El mismo texto se reutiliza como contenido del tour
 * guiado (ver components/OnboardingTour.jsx).
 */
export default function InfoTooltip({ title, text }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        aria-label={`Qué hace: ${title}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          color: 'var(--text-secondary)',
          fontSize: 12,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        i
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'flex-end', zIndex: 100
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface-2)',
              borderRadius: '20px 20px 0 0',
              padding: '24px 20px calc(24px + var(--safe-bottom))',
              width: '100%'
            }}
          >
            <div style={{ width: 36, height: 4, background: 'var(--border-subtle)', borderRadius: 2, margin: '0 auto 16px' }} />
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>{title}</h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{text}</p>
            <button
              onClick={() => setOpen(false)}
              style={{
                marginTop: 20, width: '100%', padding: '12px', borderRadius: 'var(--radius-md)',
                background: 'var(--gradient-brand)', color: '#fff', fontWeight: 600, fontSize: 14
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
