import { usePreferencias } from '../context/PreferenciasContext.jsx'
import Monto from './Monto.jsx'

/**
 * Aparece justo después de guardar un gasto que hace que te pases del
 * presupuesto de esa categoría. Usa la expresión "sorprendido" de Kairen
 * para que la alerta se sienta como parte de la personalidad de la app,
 * no como un error de formulario más.
 */
export default function AlertaPresupuesto({ categoria, gastado, limite, onCerrar }) {
  const { t } = usePreferencias()
  const excedente = Number(gastado) - Number(limite)

  return (
    <div onClick={onCerrar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 340, textAlign: 'center', paddingTop: 0, overflow: 'hidden' }}>
        <img
          src="/kairen-sorprendido.png"
          alt="Kairen sorprendido"
          style={{ width: 140, height: 'auto', margin: '0 auto 4px', display: 'block', borderRadius: 'var(--radius-md)' }}
        />
        <h3 style={{ margin: '4px 0 6px' }}>{t('pr_excedido')}</h3>
        <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--text-secondary)' }}>
          {t('pr_alerta_categoria')} <strong>{categoria}</strong>
        </p>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>
          <Monto valor={gastado} /> {t('cu_de')} <Monto valor={limite} /> — {t('pr_alerta_excedente')} <strong style={{ color: 'var(--danger)' }}><Monto valor={excedente} /></strong>
        </p>
        <button
          onClick={onCerrar}
          style={{ width: '100%', padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--gradient-brand)', color: '#fff', fontWeight: 700 }}
        >
          {t('pr_alerta_entendido')}
        </button>
      </div>
    </div>
  )
}
