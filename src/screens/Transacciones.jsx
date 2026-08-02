import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { eliminarTransaccion, obtenerTodasLasTransacciones } from '../lib/db.js'
import { useScrollLock } from '../hooks/useScrollLock.js'
import Monto from '../components/Monto.jsx'

const fmt = n => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtFecha = f => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })

export default function Transacciones({ onBack, onEditar, refreshKey, onCambio }) {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [aEliminar, setAEliminar] = useState(null)
  useScrollLock(Boolean(aEliminar))
  const [eliminando, setEliminando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getUser()
      if (!data.user) throw new Error('Sesión no disponible.')
      setLista(await obtenerTodasLasTransacciones(data.user.id))
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las transacciones.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar, refreshKey])

  const filtradas = useMemo(() => filtro === 'todos' ? lista : lista.filter(t => t.tipo === filtro), [filtro, lista])

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
      setError(err.message || 'No se pudo eliminar el movimiento.')
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div style={{ padding: '16px 16px 40px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header"><button onClick={onBack} className="back-button">←</button><h1>Todos los movimientos</h1></div>
      <div className="filter-row">
        {[['todos', 'Todos'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos']].map(([id, label]) => (
          <button key={id} onClick={() => setFiltro(id)} className={filtro === id ? 'filter active' : 'filter'}>{label}</button>
        ))}
      </div>
      {error && <p className="error-message">{error}</p>}
      {cargando && <div className="empty-state"><p>Cargando movimientos…</p></div>}
      {!cargando && filtradas.length === 0 && <div className="empty-state"><p>No hay movimientos en este filtro.</p></div>}
      {filtradas.map(tx => (
        <div key={tx.id} className="transaction-card">
          <button onClick={() => onEditar(tx)} className="transaction-main">
            <div style={{ minWidth: 0, textAlign: 'left' }}><strong>{tx.categoria_nombre}</strong>{tx.descripcion && <span>{tx.descripcion}</span>}<small>{fmtFecha(tx.fecha)}</small></div>
            <div className={tx.tipo === 'gasto' ? 'amount expense' : 'amount income'}><Monto valor={tx.monto} prefijo={tx.tipo === 'gasto' ? '-' : '+'} /></div>
          </button>
          <div className="transaction-actions"><button onClick={() => onEditar(tx)}>✏️ Editar</button><button className="danger-link" onClick={() => setAEliminar(tx)}>🗑️ Eliminar</button></div>
        </div>
      ))}

      {aEliminar && <div className="modal-backdrop" onClick={() => !eliminando && setAEliminar(null)}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <h3>¿Eliminar movimiento?</h3>
          <p>Se eliminará "{aEliminar.categoria_nombre}" por <Monto valor={aEliminar.monto} /> y el saldo de la cuenta se corregirá automáticamente.</p>
          <div className="modal-actions"><button onClick={() => setAEliminar(null)} disabled={eliminando}>Cancelar</button><button className="danger-button" onClick={confirmarEliminar} disabled={eliminando}>{eliminando ? 'Eliminando…' : 'Sí, eliminar'}</button></div>
        </div>
      </div>}
    </div>
  )
}