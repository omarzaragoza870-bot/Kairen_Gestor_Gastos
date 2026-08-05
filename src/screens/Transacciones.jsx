import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { eliminarTransaccion, obtenerTodasLasTransacciones, obtenerCuentas, obtenerCategorias } from '../lib/db.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import Monto from '../components/Monto.jsx'
import CategoriaIcono from '../components/CategoriaIcono.jsx'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { mensajeAmigable } from '../lib/errores.js'

const fmt = n => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtFecha = f => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })

export default function Transacciones({ onBack, onEditar, refreshKey, onCambio }) {
  const [lista, setLista] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [cuentaFiltro, setCuentaFiltro] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [aEliminar, setAEliminar] = useState(null)
  const [verDetalle, setVerDetalle] = useState(null)
  useScrollLock(Boolean(aEliminar) || Boolean(verDetalle))
  const [eliminando, setEliminando] = useState(false)
  const [iconosPorCategoria, setIconosPorCategoria] = useState({})
  const { t } = usePreferencias()

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (aEliminar && !eliminando) { setAEliminar(null); return }
      if (verDetalle) { setVerDetalle(null); return }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [verDetalle, aEliminar, eliminando])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getUser()
      if (!data.user) throw new Error('Sesión no disponible.')
      const [tx, ctas, cats] = await Promise.all([
        obtenerTodasLasTransacciones(data.user.id),
        obtenerCuentas(data.user.id),
        obtenerCategorias(data.user.id)
      ])
      setLista(tx)
      setCuentas(ctas)
      const mapa = {}
      cats.forEach(c => { mapa[`${c.tipo}:${c.nombre}`] = c.icono || '🏷️' })
      setIconosPorCategoria(mapa)
    } catch (err) {
      setError(mensajeAmigable(err, 'No se pudieron cargar las transacciones.'))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar, refreshKey])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return lista.filter(tx => {
      if (filtro !== 'todos' && tx.tipo !== filtro) return false
      if (cuentaFiltro !== 'todas' && tx.cuenta_id !== cuentaFiltro) return false
      if (q && !(tx.categoria_nombre?.toLowerCase().includes(q) || tx.descripcion?.toLowerCase().includes(q))) return false
      return true
    })
  }, [filtro, cuentaFiltro, busqueda, lista])

  const cuentaDe = (tx) => cuentas.find(c => c.id === tx.cuenta_id)?.nombre || '—'

  const confirmarEliminar = async () => {
    if (!aEliminar || eliminando) return
    setEliminando(true)
    setError(null)
    try {
      await eliminarTransaccion(aEliminar.id)
      setAEliminar(null)
      await cargar()
      onCambio?.()
    } catch (err) {
      setError(mensajeAmigable(err, 'No se pudo eliminar el movimiento.'))
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div style={{ padding: '16px 16px 40px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header"><button onClick={onBack} className="back-button">←</button><h1>{t('tx_titulo')}</h1></div>

      <div className="input-shell" style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--text-muted)' }}>🔍</span>
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={t('tx_buscar_placeholder')} />
      </div>

      <div className="filter-row">
        {[['todos', t('tx_filtro_todos')], ['gasto', t('tx_filtro_gastos')], ['ingreso', t('tx_filtro_ingresos')]].map(([id, label]) => (
          <button key={id} onClick={() => setFiltro(id)} className={filtro === id ? 'filter active' : 'filter'}>{label}</button>
        ))}
      </div>

      {cuentas.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '10px 0 4px', paddingBottom: 4 }}>
          <button
            onClick={() => setCuentaFiltro('todas')}
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: cuentaFiltro === 'todas' ? 'var(--gradient-brand)' : 'var(--bg-surface)',
              color: cuentaFiltro === 'todas' ? '#fff' : 'var(--text-secondary)',
              border: '1px solid ' + (cuentaFiltro === 'todas' ? 'transparent' : 'var(--border-subtle)')
            }}
          >
            {t('tx_todas_cuentas')}
          </button>
          {cuentas.map(c => (
            <button
              key={c.id}
              onClick={() => setCuentaFiltro(c.id)}
              style={{
                flexShrink: 0, padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: cuentaFiltro === c.id ? 'var(--gradient-brand)' : 'var(--bg-surface)',
                color: cuentaFiltro === c.id ? '#fff' : 'var(--text-secondary)',
                border: '1px solid ' + (cuentaFiltro === c.id ? 'transparent' : 'var(--border-subtle)')
              }}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error-message">{error}</p>}
      {cargando && <div className="empty-state"><p>{t('comun_cargando')}</p></div>}
      {!cargando && filtradas.length === 0 && <div className="empty-state"><p>{t('tx_vacio')}</p></div>}
      {filtradas.map(tx => (
        <div key={tx.id} className="transaction-card">
          <button onClick={() => setVerDetalle(tx)} className="transaction-main" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ flexShrink: 0, display:'flex', alignItems:'center' }}><CategoriaIcono icono={iconosPorCategoria[`${tx.tipo}:${tx.categoria_nombre}`] || 'Tag'} size={20} color='var(--text-secondary)' /></span>
              <div style={{ minWidth: 0, textAlign: 'left' }}><strong>{tx.categoria_nombre}</strong>{tx.descripcion && <span>{tx.descripcion}</span>}<small>{fmtFecha(tx.fecha)}</small></div>
            </div>
            <div className={tx.tipo === 'gasto' ? 'amount expense' : 'amount income'}><Monto valor={tx.monto} prefijo={tx.tipo === 'gasto' ? '-' : '+'} /></div>
          </button>
        </div>
      ))}

      {/* Cuadro de detalle al tocar una transacción — reemplaza los botones inline de Editar/Eliminar */}
      {verDetalle && (
        <div className="modal-backdrop" onClick={() => setVerDetalle(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 8, display:'flex', justifyContent:'center' }}>
              <CategoriaIcono icono={iconosPorCategoria[`${verDetalle.tipo}:${verDetalle.categoria_nombre}`] || 'Tag'} size={44} color='var(--accent-blue)' />
            </div>
            <h3 style={{ margin: '0 0 4px' }}>{verDetalle.categoria_nombre}</h3>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 2px', fontSize: 13, fontWeight: 600 }}>{cuentaDe(verDetalle)}</p>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 16px', fontSize: 12 }}>{fmtFecha(verDetalle.fecha)}</p>
            {verDetalle.descripcion && (
              <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)' }}>{verDetalle.descripcion}</p>
            )}
            <div
              className={verDetalle.tipo === 'gasto' ? 'amount expense' : 'amount income'}
              style={{ fontSize: 30, fontWeight: 700, marginBottom: 24 }}
            >
              <Monto valor={verDetalle.monto} prefijo={verDetalle.tipo === 'gasto' ? '-' : '+'} />
            </div>

            <div className="modal-actions">
              <button onClick={() => setVerDetalle(null)}>{t('comun_cancelar')}</button>
              <button onClick={() => { onEditar(verDetalle); setVerDetalle(null) }}>✏️ {t('comun_editar')}</button>
            </div>
            <button
              className="danger-link"
              style={{ marginTop: 14, width: '100%', textAlign: 'center' }}
              onClick={() => { setAEliminar(verDetalle); setVerDetalle(null) }}
            >
              🗑️ {t('comun_eliminar')}
            </button>
          </div>
        </div>
      )}

      {aEliminar && <div className="modal-backdrop" onClick={() => !eliminando && setAEliminar(null)}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <h3>{t('tx_eliminar_confirmar_titulo')}</h3>
          <p>{t('tx_eliminar_confirmar_1')} "{aEliminar.categoria_nombre}" {t('tx_eliminar_confirmar_2')} <Monto valor={aEliminar.monto} /> {t('tx_eliminar_confirmar_3')}</p>
          <div className="modal-actions"><button onClick={() => setAEliminar(null)} disabled={eliminando}>{t('comun_cancelar')}</button><button className="danger-button" onClick={confirmarEliminar} disabled={eliminando}>{eliminando ? t('comun_eliminando') : t('comun_si_eliminar')}</button></div>
        </div>
      </div>}
    </div>
  )
}