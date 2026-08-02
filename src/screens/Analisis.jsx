import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerCuentas, obtenerTransaccionesPorMes, obtenerTransaccionesEnRango, obtenerTransaccionesUltimosMeses } from '../lib/db.js'
import {
  sumar, agruparPorCategoria, agruparPorMes, calcularHabitos, calcularInsights, compararConMesAnterior
} from '../lib/estadisticas.js'
import SelectorPeriodo, { MESES } from '../components/SelectorPeriodo.jsx'
import Monto from '../components/Monto.jsx'

const fmt = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtFechaCorta = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

const COLORES_CATEGORIA = ['#8B5CF6', '#4F6BFF', '#34D399', '#FBBF24', '#FB7185', '#22D3EE', '#F472B6', '#A78BFA']

export default function Analisis() {
  const [tab, setTab] = useState('resumen')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [mesActual, setMesActual] = useState([])
  const [mesAnterior, setMesAnterior] = useState([])
  const [ultimosMeses, setUltimosMeses] = useState([])
  const [cuentasPorId, setCuentasPorId] = useState({})
  const hoy = new Date()
  const [periodo, setPeriodo] = useState({ tipo: 'mes', anio: hoy.getFullYear(), mes: hoy.getMonth() })
  const [mostrarSelector, setMostrarSelector] = useState(false)

  useEffect(() => {
    (async () => {
      setCargando(true)
      setError(null)
      try {
        const { data } = await supabase.auth.getUser()
        if (!data.user) throw new Error('Sesión no disponible.')
        const uid = data.user.id

        let actual, anterior, referenciaHistorico

        if (periodo.tipo === 'mes') {
          const fechaMes = new Date(periodo.anio, periodo.mes, 1)
          actual = await obtenerTransaccionesPorMes(uid, fechaMes)
          anterior = await obtenerTransaccionesPorMes(uid, new Date(periodo.anio, periodo.mes - 1, 1))
          referenciaHistorico = fechaMes
        } else {
          const hastaExclusivo = new Date(`${periodo.hasta}T00:00:00`)
          hastaExclusivo.setDate(hastaExclusivo.getDate() + 1)
          actual = await obtenerTransaccionesEnRango(uid, periodo.desde, hastaExclusivo.toISOString().slice(0, 10))
          anterior = [] // "vs mes anterior" no aplica a un rango libre
          referenciaHistorico = new Date(`${periodo.hasta}T12:00:00`)
        }

        const [historico, cuentas] = await Promise.all([
          obtenerTransaccionesUltimosMeses(uid, 6, referenciaHistorico),
          obtenerCuentas(uid)
        ])

        setMesActual(actual)
        setMesAnterior(anterior)
        setUltimosMeses(historico)
        setCuentasPorId(Object.fromEntries(cuentas.map(c => [c.id, c])))
      } catch (err) {
        setError(err.message || 'No se pudo cargar el análisis.')
      } finally {
        setCargando(false)
      }
    })()
  }, [periodo])

  const ingresos = sumar(mesActual, 'ingreso')
  const gastos = sumar(mesActual, 'gasto')
  const balance = ingresos - gastos
  const tasaAhorro = ingresos > 0 ? (balance / ingresos) * 100 : 0

  const gastosPorCategoria = useMemo(() => agruparPorCategoria(mesActual, 'gasto'), [mesActual])
  const ingresosPorCategoria = useMemo(() => agruparPorCategoria(mesActual, 'ingreso'), [mesActual])
  const referenciaHistorico = periodo.tipo === 'mes' ? new Date(periodo.anio, periodo.mes, 1) : new Date(`${periodo.hasta}T12:00:00`)
  const porMes = useMemo(() => agruparPorMes(ultimosMeses, 6, referenciaHistorico), [ultimosMeses, periodo])
  const habitos = useMemo(() => calcularHabitos(mesActual), [mesActual])
  const insights = useMemo(() => calcularInsights(mesActual, cuentasPorId), [mesActual, cuentasPorId])
  const comparacion = useMemo(() => compararConMesAnterior(mesActual, mesAnterior), [mesActual, mesAnterior])

  const etiquetaPeriodo = periodo.tipo === 'mes'
    ? `${MESES[periodo.mes]} ${periodo.anio}`
    : `${fmtFechaCorta(periodo.desde)} – ${fmtFechaCorta(periodo.hasta)}`

  if (cargando) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando análisis…</div>
  }

  if (error) {
    return <div style={{ padding: 40 }}><p className="error-message">{error}</p></div>
  }

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Análisis Financiero</h1>
        <button onClick={() => setMostrarSelector(true)} aria-label="Seleccionar período" className="icon-button" style={{ fontSize: 18, minHeight: 36, padding: '4px 10px' }}>📅</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>{etiquetaPeriodo}</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['resumen', 'Resumen'], ['distribucion', 'Distribución'], ['tendencias', 'Tendencias']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 999,
              background: tab === id ? 'var(--gradient-brand)' : 'var(--bg-surface)',
              color: tab === id ? '#fff' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600, border: '1px solid ' + (tab === id ? 'transparent' : 'var(--border-subtle)')
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <ResumenTab ingresos={ingresos} gastos={gastos} balance={balance} tasaAhorro={tasaAhorro} porMes={porMes} />
      )}
      {tab === 'distribucion' && (
        <DistribucionTab gastosPorCategoria={gastosPorCategoria} ingresosPorCategoria={ingresosPorCategoria} totalGastos={gastos} totalIngresos={ingresos} />
      )}
      {tab === 'tendencias' && (
        <TendenciasTab comparacion={comparacion} habitos={habitos} insights={insights} esRango={periodo.tipo === 'rango'} />
      )}

      {mostrarSelector && (
        <SelectorPeriodo
          periodoActual={periodo}
          onCerrar={() => setMostrarSelector(false)}
          onAplicar={(nuevo) => { setPeriodo(nuevo); setMostrarSelector(false) }}
        />
      )}
    </div>
  )
}

function Tarjeta({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-subtle)', padding: 18, marginBottom: 14, ...style
    }}>
      {children}
    </div>
  )
}

function ResumenTab({ ingresos, gastos, balance, tasaAhorro, porMes }) {
  const maxMensual = Math.max(...porMes.map(m => Math.max(m.ingresos, m.gastos)), 1)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <MiniStat label="↑ Total Ingresos" valor={<Monto valor={ingresos} />} color="var(--success)" />
        <MiniStat label="↓ Total Gastos" valor={<Monto valor={gastos} />} color="var(--danger)" />
        <MiniStat label="↗ Balance" valor={<Monto valor={balance} />} color={balance >= 0 ? 'var(--success)' : 'var(--danger)'} />
        <MiniStat label="🐷 Tasa de Ahorro" valor={`${tasaAhorro.toFixed(1)}%`} color="var(--success)" />
      </div>

      <Tarjeta>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600 }}>Ingresos vs Gastos</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 140, justifyContent: 'center' }}>
          <Barra etiqueta="Ingreso" valor={ingresos} max={Math.max(ingresos, gastos, 1)} color="var(--success)" />
          <Barra etiqueta="Gasto" valor={gastos} max={Math.max(ingresos, gastos, 1)} color="var(--danger)" />
        </div>
      </Tarjeta>

      <Tarjeta>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600 }}>Balance últimos 6 meses</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120 }}>
          {porMes.map(m => {
            const bal = m.ingresos - m.gastos
            const alturaPct = Math.min(100, (Math.abs(bal) / maxMensual) * 100)
            return (
              <div key={m.clave} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: '100%', height: `${Math.max(alturaPct, 3)}%`, borderRadius: 6,
                  background: bal >= 0 ? 'var(--gradient-brand)' : 'var(--danger)'
                }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{m.etiqueta}</span>
              </div>
            )
          })}
        </div>
      </Tarjeta>
    </>
  )
}

function DistribucionTab({ gastosPorCategoria, ingresosPorCategoria, totalGastos, totalIngresos }) {
  return (
    <>
      <Tarjeta>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Total de Gastos</h3>
          <span style={{ fontWeight: 700 }}><Monto valor={totalGastos} /></span>
        </div>
        {gastosPorCategoria.length === 0 ? (
          <EmptyMini texto="Sin gastos este mes." />
        ) : (
          <Dona datos={gastosPorCategoria} />
        )}
      </Tarjeta>

      <Tarjeta>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Total de Ingresos</h3>
          <span style={{ fontWeight: 700 }}><Monto valor={totalIngresos} /></span>
        </div>
        {ingresosPorCategoria.length === 0 ? (
          <EmptyMini texto="Sin ingresos este mes." />
        ) : (
          <Dona datos={ingresosPorCategoria} />
        )}
      </Tarjeta>
    </>
  )
}

function TendenciasTab({ comparacion, habitos, insights, esRango }) {
  return (
    <>
      {!esRango && (
        <Tarjeta>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>↕ Comparación con período anterior</h3>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)' }}>vs mes anterior</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ textAlign: 'center', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ color: 'var(--success)', fontSize: 12 }}>↑ Ingreso</div>
              <div style={{ fontWeight: 700, fontSize: 16, margin: '4px 0' }}><Monto valor={comparacion.ingresoActual} /></div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{comparacion.variacionIngreso ?? '—'}</div>
            </div>
            <div style={{ textAlign: 'center', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ color: 'var(--warning)', fontSize: 12 }}>↓ Gasto</div>
              <div style={{ fontWeight: 700, fontSize: 16, margin: '4px 0' }}><Monto valor={comparacion.gastoActual} /></div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{comparacion.variacionGasto ?? '—'}</div>
            </div>
          </div>
        </Tarjeta>
      )}

      {habitos && (
        <Tarjeta>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>💡 Hábitos</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MiniInfo label="Mayor gasto" valor={<Monto valor={habitos.mayorGasto} />} />
            <MiniInfo label="Categoría frecuente" valor={`${habitos.categoriaFrecuente} (${habitos.vecesFrecuente}x)`} />
            <MiniInfo label="Día donde más gastas" valor={habitos.diaTop} />
            <MiniInfo label="Gasto promedio" valor={<Monto valor={habitos.promedio} />} />
          </div>
        </Tarjeta>
      )}

      <Tarjeta>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>📈 Tendencias detectadas</h3>
        {insights.length === 0 ? (
          <EmptyMini texto="Aún no hay suficientes datos este mes para generar tendencias." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.map((ins, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 18 }}>{ins.icono}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{ins.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{ins.detalle}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Tarjeta>
    </>
  )
}

function MiniStat({ label, valor, color }) {
  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{valor}</div>
    </div>
  )
}

function MiniInfo({ label, valor }) {
  return (
    <div style={{ padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{valor}</div>
    </div>
  )
}

function EmptyMini({ texto }) {
  return <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0' }}>{texto}</p>
}

function Barra({ etiqueta, valor, max, color }) {
  const alturaPct = Math.max((valor / max) * 100, 3)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 60 }}>
      <div style={{ height: 100, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ width: '100%', height: `${alturaPct}%`, background: color, borderRadius: 8 }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{etiqueta}</span>
    </div>
  )
}

/** Dona construida con conic-gradient — sin dependencias externas. */
function Dona({ datos }) {
  let acumulado = 0
  const stops = datos.map((d, i) => {
    const inicio = acumulado
    acumulado += d.pct
    return `${COLORES_CATEGORIA[i % COLORES_CATEGORIA.length]} ${inicio}% ${acumulado}%`
  }).join(', ')

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{
        width: 110, height: 110, borderRadius: '50%', flexShrink: 0,
        background: `conic-gradient(${stops})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--bg-surface)' }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {datos.map((d, i) => (
          <div key={d.nombre} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORES_CATEGORIA[i % COLORES_CATEGORIA.length], flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{d.nombre}</span>
            <span style={{ fontWeight: 700 }}>{d.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}