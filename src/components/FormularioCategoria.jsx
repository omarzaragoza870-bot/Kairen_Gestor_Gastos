import { useState } from 'react'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import SelectorIcono from './SelectorIcono.jsx'

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
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 380 }}>
        <h3>{t('cat_nueva')}</h3>

        <label className="field-label">Ícono</label>
        <SelectorIcono valor={icono} onCambiar={setIcono} />

        <label className="field-label">{t('cat_nombre')}</label>
        <div className="input-shell">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('cat_nombre_placeholder')} maxLength={30} autoFocus />
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button onClick={onCancelar} disabled={procesando}>{t('comun_cancelar')}</button>
          <button
            disabled={!valido || procesando}
            onClick={() => onGuardar(nombre.trim(), icono)}
            style={{ background: valido ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: valido ? 'var(--on-accent)' : 'var(--text-muted)' }}
          >
            {procesando ? t('comun_guardando') : t('comun_guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}
