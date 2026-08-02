import { useEffect, useState, useCallback } from 'react'
import { obtenerContribucionesMeta, registrarContribucionMeta } from '../lib/db.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import Monto from '../components/Monto.jsx'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { mensajeAmigable } from '../lib/errores.js'

const fmt = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtFecha = (f) => f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const PRIORIDAD_COLOR = { baja: 'var(--text-secondary)', media: 'var(--warning)', alta: 'var(--danger)' }

export default function MetaDetalle({ meta, userId, onBack, onCambio }) {
  const [contribuciones, setContribuciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [montoActual, setMontoActual] = useState(Number(meta.monto_actual))
  const [modalTipo, setModalTipo] = useState(null) // null | 'contribucion' | 'retiro'
  const [procesando, setProcesando] = useState(false)
  const { t } = usePreferencias()

  useScrollLock(modalTipo !== null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setContribuciones(await obtenerContribucionesMeta(meta.id, userId))
    } catch (err) {
      setError(mensajeAmigable(err))
    } finally {
      setCargando(false)
    }
  }, [meta.id, userId])

  useEffect(() => { cargar() }, [cargar])

  const pct = Math.min(100, (montoActual / Number(meta.monto_objetivo)) * 100)
  const prioridadColor = PRIORIDAD_COLOR[meta.prioridad] || PRIORIDAD_COLOR.media
  const prioridadLabel = t(`metas_prioridad_${meta.prioridad || 'media'}`)

  const handleConfirmar = async (monto, nota) => {
    setProcesando(true)
    setError(null)
    try {
      const nuevoMonto = await registrarContribucionMeta({
        metaId: meta.id,
        userId,
        tipo: modalTipo,
        monto,
        nota,
        montoActualPrevio: montoActual,
        montoObjetivo: Number(meta.monto_objetivo)
      })
      setMontoActual(nuevoMonto)
      setModalTipo(null)
      await cargar()
      onCambio?.()
    } catch (err) {
      setError(mensajeAmigable(err))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 110 }}>
      <div style={{
        background: 'linear-gradient(180deg, var(--bg-surface-2) 0%, var(--bg-base) 100%)',
        padding: '16px 20px 28px', textAlign: 'center'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <button onClick={onBack} aria-label={t('tour_atras')} className="icon-button" style={{ background: 'rgba(255,255,255,0.08)', border: 'none' }}>←</button>
          <span style={{ width: 42 }} />
        </div>
        <div style={{ fontSize: 56, marginBottom: 8 }}>{meta.icono || '🎯'}</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{meta.nombre}</h1>
        {meta.descripcion && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{meta.descripcion}</p>}
      </div>

      <div style={{ padding: '0 16px' }}>
        <section style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)',
          padding: 20, marginTop: -20, display: 'flex', alignItems: 'center', gap: 20
        }}>
          <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
            <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="48" cy="48" r="42" fill="none" stroke="var(--bg-surface-2)" strokeWidth="10" />
              <circle
                cx="48" cy="48" r="42" fill="none"
                stroke={meta.completada ? 'var(--success)' : 'var(--accent-blue)'}
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 42}`}
                strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800 }}>
              {pct.toFixed(0)}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('md_ahorrado')}</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}><Monto valor={montoActual} /></div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('md_meta')}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}><Monto valor={meta.monto_objetivo} /></div>
          </div>
        </section>

        <section style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)',
          padding: 20, marginTop: 14
        }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>{t('md_informacion')}</h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>📅</span>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('md_fecha_objetivo')}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtFecha(meta.fecha_limite)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🚩</span>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('md_prioridad')}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: prioridadColor }}>{prioridadLabel}</div>
            </div>
          </div>
        </section>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            onClick={() => setModalTipo('contribucion')}
            style={{ flex: 1, padding: 16, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-2)', color: '#fff', fontWeight: 700, fontSize: 14 }}
          >
            ＋ {t('md_contribuir')}
          </button>
          <button
            onClick={() => setModalTipo('retiro')}
            disabled={montoActual <= 0}
            style={{
              flex: 1, padding: 16, borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 14,
              background: montoActual > 0 ? 'var(--danger)' : 'var(--bg-surface-2)', color: montoActual > 0 ? '#fff' : 'var(--text-muted)'
            }}
          >
            − {t('md_retirar')}
          </button>
        </div>

        {error && <p className="error-message">{error}</p>}

        <section style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)',
          padding: 20, marginTop: 16, textAlign: contribuciones.length === 0 ? 'center' : 'left'
        }}>
          {cargando ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{t('comun_cargando')}</p>
          ) : contribuciones.length === 0 ? (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
              <p style={{ fontSize: 14, margin: 0 }}>{t('md_sin_contribuciones')}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{t('md_primera_contribucion')}</p>
            </>
          ) : (
            contribuciones.map(c => (
              <div key={c.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid var(--border-subtle)'
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.tipo === 'contribucion' ? t('md_contribucion') : t('md_retiro')}</div>
                  {c.nota && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.nota}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtFecha(c.fecha)}</div>
                </div>
                <div style={{ fontWeight: 700, color: c.tipo === 'contribucion' ? 'var(--success)' : 'var(--danger)' }}>
                  <Monto valor={c.monto} prefijo={c.tipo === 'contribucion' ? '+' : '-'} />
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {modalTipo && (
        <ModalMonto
          tipo={modalTipo}
          maxRetiro={modalTipo === 'retiro' ? montoActual : null}
          procesando={procesando}
          onCancelar={() => setModalTipo(null)}
          onConfirmar={handleConfirmar}
        />
      )}
    </div>
  )
}

function ModalMonto({ tipo, maxRetiro, onCancelar, onConfirmar, procesando }) {
  const { t } = usePreferencias()
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const montoNum = Number(monto)
  const valido = Number.isFinite(montoNum) && montoNum > 0 && (tipo !== 'retiro' || montoNum <= maxRetiro)

  return (
    <div onClick={onCancelar} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ maxWidth: 360 }}>
        <h3>{tipo === 'contribucion' ? t('md_form_contribucion') : t('md_form_retiro')}</h3>

        <label className="field-label">{t('nt_monto')}</label>
        <div className="input-shell">
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(',', '.'))} placeholder="0.00" autoFocus />
        </div>
        {tipo === 'retiro' && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{t('md_maximo_disponible')}: <Monto valor={maxRetiro} /></p>
        )}

        <label className="field-label">{t('ae_nota')}</label>
        <div className="input-shell">
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={60} placeholder={t('md_nota_placeholder')} />
        </div>

        <div className="modal-actions" style={{ marginTop: 4 }}>
          <button onClick={onCancelar} disabled={procesando}>{t('comun_cancelar')}</button>
          <button
            disabled={!valido || procesando}
            onClick={() => onConfirmar(montoNum, nota.trim())}
            style={{
              background: valido ? (tipo === 'contribucion' ? 'var(--gradient-brand)' : 'var(--danger)') : 'var(--bg-surface-2)',
              color: valido ? '#fff' : 'var(--text-muted)'
            }}
          >
            {procesando ? t('comun_guardando') : tipo === 'contribucion' ? t('md_contribuir') : t('md_retirar')}
          </button>
        </div>
      </div>
    </div>
  )
}