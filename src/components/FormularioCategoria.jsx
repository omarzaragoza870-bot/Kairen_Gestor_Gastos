import { useState } from 'react'
import { usePreferencias } from '../context/PreferenciasContext.jsx'

// Selección curada de emojis comunes para categorías de gasto/ingreso.
// Se muestran en cuadrícula porque ningún sitio web puede forzar que el
// teclado del sistema abra directo en la sección de emojis (limitación de
// iOS/Android, no de esta app) — así el usuario elige con un toque, sin
// depender de cambiar de teclado manualmente.
const EMOJIS_COMUNES = [
  '🍔', '🚗', '💡', '🎬', '👕', '❤️', '🏠', '📱',
  '✈️', '🎮', '📚', '🐾', '🎁', '💰', '💼', '📈',
  '🏥', '⚽', '☕', '🎵', '🛒', '💳', '🚌', '⛽',
  '🧾', '🔧', '🎓', '🍺', '🏋️', '🌐', '📺', '🏷️'
]

/**
 * Modal para crear una categoría nueva. Se usa tanto desde Ajustes >
 * Categorías como desde el selector de categoría en Nueva Transacción —
 * mismo componente, mismo comportamiento.
 */
export default function FormularioCategoria({ onCancelar, onGuardar, procesando }) {
  const { t } = usePreferencias()
  const [nombre, setNombre] = useState('')
  const [icono, setIcono] = useState('🏷️')
  const valido = nombre.trim().length > 0

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 380, maxHeight: '85vh', overflowY: 'auto' }}>
        <h3>{t('cat_nueva')}</h3>

        <label className="field-label">Emoji</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 12px' }}>
          <div style={{
            width: 60, height: 60, borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, flexShrink: 0
          }}>
            {icono}
          </div>
          <input
            value={icono}
            onChange={e => {
              const val = [...e.target.value].slice(-2).join('')
              if (val.trim()) setIcono(val.trim())
            }}
            maxLength={4}
            placeholder="🏷️"
            style={{
              flex: 1, padding: '14px 16px', borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              fontSize: 24, textAlign: 'center', color: 'var(--text-primary)'
            }}
          />
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6,
          padding: 10, marginBottom: 16, background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)'
        }}>
          {EMOJIS_COMUNES.map(e => (
            <button
              key={e}
              onClick={() => setIcono(e)}
              style={{
                fontSize: 20, padding: 6, borderRadius: 'var(--radius-sm)',
                background: icono === e ? 'var(--gradient-brand)' : 'transparent'
              }}
            >
              {e}
            </button>
          ))}
        </div>

        <label className="field-label">{t('cat_nombre')}</label>
        <div className="input-shell">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('cat_nombre_placeholder')} maxLength={30} autoFocus />
        </div>

        <div className="modal-actions" style={{ marginTop: 4 }}>
          <button onClick={onCancelar} disabled={procesando}>{t('comun_cancelar')}</button>
          <button
            disabled={!valido || procesando}
            onClick={() => onGuardar(nombre.trim(), icono)}
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? '#fff' : 'var(--text-muted)' }}
          >
            {procesando ? t('comun_guardando') : t('comun_guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}
