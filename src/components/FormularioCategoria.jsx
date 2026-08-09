import { useState } from 'react'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import CategoriaIcono, { ICONOS_DISPONIBLES } from './CategoriaIcono.jsx'

/**
 * Modal para crear una categoría nueva. Se usa tanto desde Ajustes >
 * Categorías como desde el selector de categoría en Nueva Transacción —
 * mismo componente, mismo comportamiento.
 */
export default function FormularioCategoria({ onCancelar, onGuardar, procesando }) {
  const { t } = usePreferencias()
  const [nombre, setNombre] = useState('')
  const [icono, setIcono] = useState('Tag')
  const valido = nombre.trim().length > 0

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 380, maxHeight: '85vh', overflowY: 'auto' }}>
        <h3>{t('cat_nueva')}</h3>

        <label className="field-label">Ícono</label>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8,
          padding: 12, margin: '8px 0 16px', background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)'
        }}>
          {ICONOS_DISPONIBLES.map(item => (
            <button
              key={item.nombre}
              onClick={() => setIcono(item.nombre)}
              title={item.label}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 10, borderRadius: 'var(--radius-sm)',
                background: icono === item.nombre ? 'var(--gradient-brand)' : 'transparent'
              }}
            >
              <CategoriaIcono icono={item.nombre} size={20} color={icono === item.nombre ? '#fff' : 'var(--text-secondary)'} />
            </button>
          ))}
        </div>

        <label className="field-label">{t('cat_nombre')}</label>
        <div className="input-shell">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('cat_nombre_placeholder')} maxLength={30} autoFocus />
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
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
