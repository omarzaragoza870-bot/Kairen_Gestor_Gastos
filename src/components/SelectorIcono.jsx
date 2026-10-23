import CategoriaIcono, { ICONOS_DISPONIBLES } from './CategoriaIcono.jsx'

/**
 * Cuadrícula de íconos para elegir el de una categoría o meta.
 * Las columnas se calculan según el ancho disponible (auto-fill), así que
 * nunca se salen del modal, ni en un Z Fold cerrado (344px).
 */
export default function SelectorIcono({ valor, onCambiar }) {
  return (
    <div className="icon-picker" role="radiogroup">
      {ICONOS_DISPONIBLES.map(item => {
        const activo = valor === item.nombre
        return (
          <button
            key={item.nombre}
            type="button"
            role="radio"
            aria-checked={activo}
            aria-label={item.label}
            title={item.label}
            onClick={() => onCambiar(item.nombre)}
            className={activo ? 'icon-picker-item active' : 'icon-picker-item'}
          >
            <CategoriaIcono icono={item.nombre} size={20} color={activo ? 'var(--on-accent)' : 'var(--text-secondary)'} />
          </button>
        )
      })}
    </div>
  )
}
