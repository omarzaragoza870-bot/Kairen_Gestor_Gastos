import { useState } from 'react'
import { useScrollLock } from '../hooks/useScrollLock.js'

function fechaLocal(date) {
  const a = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${a}-${m}-${d}`
}

function calcularRangoRapido(id) {
  const hoy = new Date()
  const fin = fechaLocal(hoy)

  switch (id) {
    case 'hoy':
      return { desde: fin, hasta: fin }
    case 'semana': {
      const inicio = new Date(hoy)
      inicio.setDate(inicio.getDate() - 6)
      return { desde: fechaLocal(inicio), hasta: fin }
    }
    case '30dias': {
      const inicio = new Date(hoy)
      inicio.setDate(inicio.getDate() - 29)
      return { desde: fechaLocal(inicio), hasta: fin }
    }
    case '3meses': {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 3, hoy.getDate())
      return { desde: fechaLocal(inicio), hasta: fin }
    }
    case '6meses': {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 6, hoy.getDate())
      return { desde: fechaLocal(inicio), hasta: fin }
    }
    case 'anio': {
      const inicio = new Date(hoy.getFullYear(), 0, 1)
      return { desde: fechaLocal(inicio), hasta: fin }
    }
    default:
      return { desde: fin, hasta: fin }
  }
}

const RANGOS_RAPIDOS = [
  ['hoy', 'Hoy'],
  ['semana', 'Última semana'],
  ['30dias', 'Últimos 30 días'],
  ['3meses', 'Últimos 3 meses'],
  ['6meses', '6 meses'],
  ['anio', 'Este Año']
]

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function generarAnios() {
  const actual = new Date().getFullYear()
  const anios = []
  for (let a = actual - 5; a <= actual + 3; a++) anios.push(a)
  return anios
}

const Chip = ({ activo, children, onClick }) => (
  <button
    onClick={onClick}
    style={{
      flexShrink: 0, padding: '10px 16px', borderRadius: 999,
      background: activo ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
      color: activo ? '#fff' : 'var(--text-secondary)',
      fontSize: 13, fontWeight: 600, border: '1px solid ' + (activo ? 'transparent' : 'var(--border-subtle)')
    }}
  >
    {children}
  </button>
)

/**
 * periodoActual: { tipo: 'mes', anio, mes } | { tipo: 'rango', desde, hasta }
 * onAplicar(periodo) — se llama al confirmar
 */
export default function SelectorPeriodo({ periodoActual, onAplicar, onCerrar }) {
  const [modo, setModo] = useState(periodoActual.tipo === 'rango' ? 'rango' : 'mes')
  const [anio, setAnio] = useState(periodoActual.anio ?? new Date().getFullYear())
  const [mes, setMes] = useState(periodoActual.mes ?? new Date().getMonth())
  const [desde, setDesde] = useState(periodoActual.desde || '')
  const [hasta, setHasta] = useState(periodoActual.hasta || '')
  useScrollLock(true)

  const anios = generarAnios()

  const etiquetaPreview = modo === 'mes'
    ? `${MESES[mes]} ${anio}`
    : (desde && hasta ? `${desde} → ${hasta}` : 'Selecciona un rango')

  const etiquetaActual = periodoActual.tipo === 'rango'
    ? `${periodoActual.desde} → ${periodoActual.hasta}`
    : `${MESES[periodoActual.mes]} ${periodoActual.anio}`

  const puedeAplicar = modo === 'mes' || (desde && hasta && desde <= hasta)

  const handleAplicar = () => {
    if (modo === 'mes') onAplicar({ tipo: 'mes', anio, mes })
    else onAplicar({ tipo: 'rango', desde, hasta })
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', zIndex: 150 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface-2)', borderRadius: '20px 20px 0 0',
          padding: '20px 20px calc(20px + var(--safe-bottom))', width: '100%', maxHeight: '85vh', overflowY: 'auto'
        }}
      >
        <div style={{ width: 36, height: 4, background: 'var(--border-subtle)', borderRadius: 2, margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 16px' }}>Seleccionar Período</h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button
            onClick={() => setModo('mes')}
            style={{
              flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
              background: modo === 'mes' ? 'var(--gradient-brand)' : 'var(--bg-surface)',
              color: modo === 'mes' ? '#fff' : 'var(--text-secondary)', fontWeight: 600, fontSize: 13,
              border: '1px solid ' + (modo === 'mes' ? 'transparent' : 'var(--border-subtle)')
            }}
          >
            📅 Año/Mes
          </button>
          <button
            onClick={() => setModo('rango')}
            style={{
              flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
              background: modo === 'rango' ? 'var(--gradient-brand)' : 'var(--bg-surface)',
              color: modo === 'rango' ? '#fff' : 'var(--text-secondary)', fontWeight: 600, fontSize: 13,
              border: '1px solid ' + (modo === 'rango' ? 'transparent' : 'var(--border-subtle)')
            }}
          >
            Personalizado
          </button>
        </div>

        {modo === 'mes' ? (
          <>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Año</label>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0 18px', paddingBottom: 4 }}>
              {anios.map(a => <Chip key={a} activo={a === anio} onClick={() => setAnio(a)}>{a}</Chip>)}
            </div>

            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Mes de {anio}</label>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0 18px', paddingBottom: 4 }}>
              {MESES.map((nombre, i) => <Chip key={nombre} activo={i === mes} onClick={() => setMes(i)}>{nombre}</Chip>)}
            </div>
          </>
        ) : (
          <>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Desde</label>
            <div className="input-shell" style={{ marginBottom: 14 }}>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Hasta</label>
            <div className="input-shell" style={{ marginBottom: 14 }}>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} min={desde || undefined} />
            </div>

            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Rangos Rápidos:</label>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '8px 0 4px', paddingBottom: 4 }}>
              {RANGOS_RAPIDOS.map(([id, etiqueta]) => (
                <Chip key={id} activo={false} onClick={() => {
                  const { desde: d, hasta: h } = calcularRangoRapido(id)
                  setDesde(d); setHasta(h)
                }}>
                  {etiqueta}
                </Chip>
              ))}
            </div>
          </>
        )}

        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: 14, marginTop: 4, marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Período a Aplicar:</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{etiquetaPreview}</div>
        </div>

        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Período Actual:</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{etiquetaActual}</div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCerrar}
            style={{ flex: 1, padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}
          >
            Cancelar
          </button>
          <button
            disabled={!puedeAplicar}
            onClick={handleAplicar}
            style={{
              flex: 1, padding: 14, borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 14,
              background: puedeAplicar ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
              color: puedeAplicar ? '#fff' : 'var(--text-muted)'
            }}
          >
            Aplicar Filtro
          </button>
        </div>
      </div>
    </div>
  )
}

export { MESES, MESES_CORTO }