import { useScrollLock } from '../hooks/useScrollLock.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'

export default function NuevaOperacion({ onCerrar, onTransaccion, onTransferencia }) {
  const { t } = usePreferencias()
  useScrollLock(true)

  return (
    <div onClick={onCerrar} className="modal-backdrop" style={{ alignItems: 'flex-end' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface-2)', borderRadius: '20px 20px 0 0',
          padding: '20px 20px calc(20px + var(--safe-bottom))', width: '100%', maxWidth: 680, margin: '0 auto'
        }}
      >
        <div style={{ width: 36, height: 4, background: 'var(--border-subtle)', borderRadius: 2, margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 16px' }}>{t('op_titulo')}</h2>

        <button
          onClick={onTransaccion}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 12px', marginBottom: 10, textAlign: 'left',
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)'
          }}
        >
          <span style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0
          }}>🧾</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{t('op_nueva_transaccion')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('op_nueva_transaccion_desc')}</div>
          </div>
        </button>

        <button
          onClick={onTransferencia}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 12px', textAlign: 'left',
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)'
          }}
        >
          <span style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0
          }}>🔁</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{t('op_nueva_transferencia')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('op_nueva_transferencia_desc')}</div>
          </div>
        </button>
      </div>
    </div>
  )
}
