import { useEffect, useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerCuentas, obtenerTransaccionesPorMes, obtenerTransaccionesEnRango, obtenerTransaccionesUltimosMeses } from '../lib/db.js'
import {
  sumar, agruparPorCategoria, agruparPorMes, calcularHabitos, calcularInsights, compararConMesAnterior
} from '../lib/estadisticas.js'
import SelectorPeriodo from '../components/SelectorPeriodo.jsx'
import { conRespaldoOffline, leerDeCache } from '../lib/offline.js'
import { mensajeAmigable } from '../lib/errores.js'
import { MESES_POR_IDIOMA } from '../i18n/translations.js'
import Monto from '../components/Monto.jsx'
import Premium from './Premium.jsx'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { CalendarDays, ChevronDown, Sparkles, Lightbulb, TrendingUp, Lock } from 'lucide-react'

const fmtFechaCorta = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
// Colores de sistema de Apple: distinguibles entre sí en tema claro y oscuro
const COLORES_CATEGORIA = ['#0A84FF', '#30D158', '#FF9F0A', '#FF375F', '#64D2FF', '#BF5AF2', '#FFD60A', '#5E5CE6']

export default function Analisis() {
  const [tab, setTab] = useState('resumen')
  const [pregunta, setPregunta] = useState('')
  const [respuesta, setRespuesta] = useState(null)
  const [preguntando, setPreguntando] = useState(false)
  const [errorIA, setErrorIA] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [mesActual, setMesActual] = useState([])
  const [mesAnterior, setMesAnterior] = useState([])
  const [ultimosMeses, setUltimosMeses] = useState([])
  const [cuentasPorId, setCuentasPorId] = useState({})
  const hoy = new Date()
  const [periodo, setPeriodo] = useState({ tipo: 'mes', anio: hoy.getFullYear(), mes: hoy.getMonth() })
  const [mostrarSelector, setMostrarSelector] = useState(false)
  const { t, idioma } = usePreferencias()
  const MESES = MESES_POR_IDIOMA[idioma] || MESES_POR_IDIOMA.es

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      setError(null)
      try {
        const { data } = await supabase.auth.getSession()
        const usuario = data.session?.user
        if (!usuario) throw new Error('Sesión no disponible.')
        const uid = usuario.id
        // Cada consulta es [clave de caché, función de red]; son independientes
        // entre sí, así que se piden en paralelo.
        let consultaActual, consultaAnterior, referenciaHistorico, sufijo
        if (periodo.tipo === 'mes') {
          const fechaMes = new Date(periodo.anio, periodo.mes, 1)
          sufijo = `${periodo.anio}-${periodo.mes}`
          consultaActual = [`analisis:${uid}:${sufijo}`, () => obtenerTransaccionesPorMes(uid, fechaMes)]
          consultaAnterior = [`analisis:${uid}:${sufijo}-anterior`, () => obtenerTransaccionesPorMes(uid, new Date(periodo.anio, periodo.mes - 1, 1))]
          referenciaHistorico = fechaMes
        } else {
          const hastaExclusivo = new Date(`${periodo.hasta}T00:00:00`)
          hastaExclusivo.setDate(hastaExclusivo.getDate() + 1)
          const hastaStr = hastaExclusivo.toISOString().slice(0, 10)
          sufijo = `${periodo.desde}_${hastaStr}`
          consultaActual = [`analisis:${uid}:${sufijo}`, () => obtenerTransaccionesEnRango(uid, periodo.desde, hastaStr)]
          consultaAnterior = [null, async () => []]
          referenciaHistorico = new Date(`${periodo.hasta}T12:00:00`)
        }
        const consultas = [
          consultaActual,
          consultaAnterior,
          [`analisis-historico:${uid}:${sufijo}`, () => obtenerTransaccionesUltimosMeses(uid, 6, referenciaHistorico)],
          [`cuentas:${uid}`, () => obtenerCuentas(uid)]
        ]
        const aplicar = ([actual, anterior, historico, cuentas]) => {
          setMesActual(actual)
          setMesAnterior(anterior)
          setUltimosMeses(historico)
          setCuentasPorId(Object.fromEntries(cuentas.map(c => [c.id, c])))
        }

        // Si hay datos de una visita anterior se muestran al instante y se
        // reemplazan al llegar los del servidor, sin pasar por el esqueleto.
        const cacheados = await Promise.all(consultas.map(([clave]) => clave ? leerDeCache(clave) : []))
        if (cancelado) return
        if (cacheados.every(valor => valor !== null)) {
          aplicar(cacheados)
          setCargando(false)
        } else {
          setCargando(true)
        }

        const frescos = await Promise.all(consultas.map(([clave, fnRed]) => clave ? conRespaldoOffline(clave, fnRed) : fnRed()))
        if (cancelado) return
        aplicar(frescos)
      } catch (err) {
        if (!cancelado) setError(mensajeAmigable(err, t('an_cargando')))
      } finally {
        if (!cancelado) setCargando(false)
      }
    })()
    return () => { cancelado = true }
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

  if (cargando) return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }} aria-busy="true" aria-label={t('an_cargando')}>
      <div className="skeleton" style={{ height: 28, width: 140, borderRadius: 8, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 36, width: 160, borderRadius: 999, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 44, borderRadius: 999, marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 120, marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 200 }} />
    </div>
  )
  if (error) return <div style={{ padding: 40 }}><p className="error-message">{error}</p></div>

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <h1 className="large-title" style={{ margin: '0 0 10px' }}>{t('an_titulo')}</h1>
      <button onClick={() => setMostrarSelector(true)} aria-label={`Seleccionar período: ${etiquetaPeriodo}`} className="period-chip" style={{ marginBottom: 16 }}>
        <CalendarDays size={16} aria-hidden="true" />
        {etiquetaPeriodo}
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      <div className="tab-scroll" role="tablist">
        {[['resumen', t('an_tab_resumen')], ['distribucion', t('an_tab_distribucion')], ['tendencias', t('an_tab_tendencias')], ['kairen', <><Sparkles size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />Kairen</>]].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={e => { setTab(id); e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }) }}
            className={tab === id ? 'tab-pill active' : 'tab-pill'}
          >
            {label}
          </button>
        ))}
      </div>

      {/* key={tab} fuerza desmount/remount para reanimar las gráficas cada vez que cambias de pestaña */}
      {tab === 'resumen' && (
        <ResumenTab key={`resumen-${tab}-${periodo.anio}-${periodo.mes}`} ingresos={ingresos} gastos={gastos} balance={balance} tasaAhorro={tasaAhorro} porMes={porMes} />
      )}
      {tab === 'distribucion' && (
        <DistribucionTab key={`dist-${tab}-${periodo.anio}-${periodo.mes}`} gastosPorCategoria={gastosPorCategoria} ingresosPorCategoria={ingresosPorCategoria} totalGastos={gastos} totalIngresos={ingresos} />
      )}
      {tab === 'tendencias' && (
        <TendenciasTab comparacion={comparacion} habitos={habitos} insights={insights} esRango={periodo.tipo === 'rango'} />
      )}
      {tab === 'kairen' && (
        <KairenIATab
          pregunta={pregunta}
          setPregunta={setPregunta}
          respuesta={respuesta}
          setRespuesta={setRespuesta}
          preguntando={preguntando}
          setPreguntando={setPreguntando}
          errorIA={errorIA}
          setErrorIA={setErrorIA}
        />
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
  const { t } = usePreferencias()
  const balanceData = porMes.map(m => ({
    etiqueta: m.etiqueta,
    bal: m.ingresos - m.gastos,
    positivo: (m.ingresos - m.gastos) >= 0
  }))

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <MiniStat label={`↑ ${t('an_total_ingresos')}`} valor={<Monto valor={ingresos} />} color="var(--success)" />
        <MiniStat label={`↓ ${t('an_total_gastos')}`} valor={<Monto valor={gastos} />} color="var(--danger)" />
        <MiniStat label={`↗ ${t('an_balance')}`} valor={<Monto valor={balance} />} color={balance >= 0 ? 'var(--success)' : 'var(--danger)'} />
        <MiniStat label={t('an_tasa_ahorro')} valor={`${tasaAhorro.toFixed(1)}%`} color="var(--success)" />
      </div>

      <Tarjeta>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600 }}>{t('an_ingresos_vs_gastos')}</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 140, justifyContent: 'center' }}>
          <Barra etiqueta={t('inicio_ingresos')} valor={ingresos} color="var(--success)" />
          <Barra etiqueta={t('nt_gasto')} valor={gastos} color="var(--danger)" />
        </div>
      </Tarjeta>

      <Tarjeta>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>{t('an_balance_6_meses')}</h3>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={balanceData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v) => [`$${Math.abs(Number(v)).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`, 'Balance']}
              contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, fontSize: 12, color: 'var(--text-primary)', boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}
            />
            <Bar dataKey="bal" radius={[6, 6, 0, 0]} isAnimationActive={true} animationDuration={900} animationEasing="ease-out">
              {balanceData.map((entry, i) => (
                <Cell key={i} fill={entry.positivo ? 'var(--accent)' : 'var(--danger)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Tarjeta>
    </>
  )
}

function DistribucionTab({ gastosPorCategoria, ingresosPorCategoria, totalGastos, totalIngresos }) {
  const { t } = usePreferencias()
  return (
    <>
      <Tarjeta>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('an_total_gastos_card')}</h3>
          <span style={{ fontWeight: 700 }}><Monto valor={totalGastos} /></span>
        </div>
        {gastosPorCategoria.length === 0 ? <EmptyMini texto={t('an_sin_gastos')} /> : <Dona datos={gastosPorCategoria} />}
      </Tarjeta>
      <Tarjeta>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('an_total_ingresos_card')}</h3>
          <span style={{ fontWeight: 700 }}><Monto valor={totalIngresos} /></span>
        </div>
        {ingresosPorCategoria.length === 0 ? <EmptyMini texto={t('an_sin_ingresos')} /> : <Dona datos={ingresosPorCategoria} />}
      </Tarjeta>
    </>
  )
}

function TendenciasTab({ comparacion, habitos, insights, esRango }) {
  const { t } = usePreferencias()
  return (
    <>
      {!esRango && (
        <Tarjeta>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>↕ {t('an_comparacion_titulo')}</h3>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)' }}>{t('an_comparacion_subtitulo')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ textAlign: 'center', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ color: 'var(--success)', fontSize: 12 }}>↑ {t('inicio_ingresos')}</div>
              <div style={{ fontWeight: 700, fontSize: 16, margin: '4px 0' }}><Monto valor={comparacion.ingresoActual} /></div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{comparacion.variacionIngreso ?? '—'}</div>
            </div>
            <div style={{ textAlign: 'center', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ color: 'var(--warning)', fontSize: 12 }}>↓ {t('nt_gasto')}</div>
              <div style={{ fontWeight: 700, fontSize: 16, margin: '4px 0' }}><Monto valor={comparacion.gastoActual} /></div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{comparacion.variacionGasto ?? '—'}</div>
            </div>
          </div>
        </Tarjeta>
      )}
      {habitos && (
        <Tarjeta>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}><Lightbulb size={16} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />{t('an_habitos')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MiniInfo label={t('an_mayor_gasto')} valor={<Monto valor={habitos.mayorGasto} />} />
            <MiniInfo label={t('an_categoria_frecuente')} valor={`${habitos.categoriaFrecuente} (${habitos.vecesFrecuente}x)`} />
            <MiniInfo label={t('an_dia_mas_gasta')} valor={habitos.diaTop} />
            <MiniInfo label={t('an_gasto_promedio')} valor={<Monto valor={habitos.promedio} />} />
          </div>
        </Tarjeta>
      )}
      <Tarjeta>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}><TrendingUp size={16} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />{t('an_tendencias_detectadas')}</h3>
        {insights.length === 0 ? <EmptyMini texto={t('an_sin_tendencias')} /> : (
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

function Barra({ etiqueta, valor, color }) {
  const data = [{ name: etiqueta, valor }]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 80 }}>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="valor" fill={color} radius={[8, 8, 0, 0]}
            isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
        </BarChart>
      </ResponsiveContainer>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{etiqueta}</span>
    </div>
  )
}

function Dona({ datos }) {
  const pieData = datos.map((d, i) => ({
    name: d.nombre,
    value: d.pct,
    color: COLORES_CATEGORIA[i % COLORES_CATEGORIA.length]
  }))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ width: 110, height: 110, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={52}
              dataKey="value" isAnimationActive={true} animationBegin={0}
              animationDuration={900} animationEasing="ease-out">
              {pieData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
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

const SUGERENCIAS = [
  '¿En qué gasto más dinero?',
  '¿Cómo voy con mis metas?',
  '¿Me alcanza para fin de mes?',
  '¿Cuáles son mis peores hábitos de gasto?',
  '¿Cómo puedo ahorrar más este mes?',
  '¿Cómo estuvo mi mes financieramente?'
]

// Mensajes que se van mostrando mientras Kairen prepara la respuesta, para
// que la espera se sienta como avance y no como una app congelada.
const PASOS_CARGA = [
  'Revisando tus movimientos del mes…',
  'Analizando tus categorías de gasto…',
  'Revisando tus metas y presupuestos…',
  'Preparando tu respuesta…'
]

function CargandoKairen() {
  const [segundos, setSegundos] = useState(0)

  useEffect(() => {
    const intervalo = setInterval(() => setSegundos(s => s + 1), 1000)
    return () => clearInterval(intervalo)
  }, [])

  const paso = Math.min(Math.floor(segundos / 2), PASOS_CARGA.length - 1)
  // Avanza rápido al inicio y se frena cerca del 90%: nunca "termina" antes
  // de que llegue la respuesta real.
  const progreso = Math.round(90 * (1 - Math.exp(-(segundos + 1) / 4)))

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ textAlign: 'center', padding: '28px 20px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', marginBottom: 16 }}
    >
      <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 14px' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid var(--border-subtle)', borderTopColor: 'var(--accent-blue)', animation: 'kairen-giro 1s linear infinite' }} />
        <img src="/kairen-avatar.png" alt="" style={{ position: 'absolute', inset: 8, width: 48, height: 48, borderRadius: '50%', animation: 'pulso-kairen 1.4s ease-in-out infinite' }} />
      </div>

      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Kairen está trabajando</div>
      <div key={paso} style={{ color: 'var(--text-secondary)', fontSize: 13, minHeight: 18, animation: 'kairen-aparecer 0.4s ease-out' }}>
        {PASOS_CARGA[paso]}
      </div>

      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface-2)', overflow: 'hidden', margin: '16px auto 10px', maxWidth: 260 }}>
        <div style={{ height: '100%', width: `${progreso}%`, background: 'var(--gradient-brand)', borderRadius: 3, transition: 'width 1s linear' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
        {PASOS_CARGA.map((_, i) => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i <= paso ? 'var(--accent-blue)' : 'var(--border-subtle)', transition: 'background 0.3s' }} />
        ))}
      </div>

      {segundos >= 10 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>
          Está tardando un poco más de lo normal. Un momento, por favor.
        </div>
      )}

      <style>{`
        @keyframes kairen-giro { to { transform: rotate(360deg); } }
        @keyframes pulso-kairen { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.75; transform: scale(0.94); } }
        @keyframes kairen-aparecer { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

// Si la respuesta no llega en este tiempo se cancela y se avisa, en lugar
// de dejar al usuario esperando indefinidamente.
const TIEMPO_MAXIMO_IA_MS = 30000

// Preguntas cortas: máximo 30 palabras (el servidor también lo valida)
const MAX_PALABRAS_PREGUNTA = 30

const contarPalabras = (texto) => (texto.trim() ? texto.trim().split(/\s+/).length : 0)

/** Recorta el texto a las primeras `max` palabras, respetando los espacios que ya tenía. */
function limitarPalabras(texto, max) {
  const partes = texto.split(/(\s+)/)
  let palabras = 0
  let resultado = ''
  for (const parte of partes) {
    if (parte.trim()) {
      if (palabras >= max) break
      palabras++
    }
    resultado += parte
  }
  return resultado
}

function KairenIATab({ pregunta, setPregunta, respuesta, setRespuesta, preguntando, setPreguntando, errorIA, setErrorIA }) {
  // null = verificando; true/false = si el usuario puede usar Kairen IA.
  // Solo Premium o acceso fundador. El servidor también lo valida.
  const [tieneAcceso, setTieneAcceso] = useState(null)
  const [mostrarPremium, setMostrarPremium] = useState(false)
  const { t } = usePreferencias()

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) {
          if (!cancelado) setTieneAcceso(false)
          return
        }
        const { data: perfil, error } = await supabase
          .from('perfiles')
          .select('acceso_fundador, plan')
          .eq('user_id', uid)
          .maybeSingle()
        if (error) throw error
        if (!cancelado) setTieneAcceso(Boolean(perfil?.acceso_fundador || perfil?.plan === 'premium'))
      } catch {
        // Sin conexión o error al consultar: se muestra la pantalla normal
        // y el servidor decide al momento de preguntar.
        if (!cancelado) setTieneAcceso(true)
      }
    })()
    return () => { cancelado = true }
  }, [])

  const handlePreguntar = async (texto) => {
    const q = texto || pregunta
    if (!q.trim() || preguntando) return
    setPreguntando(true)
    setRespuesta(null)
    setErrorIA(null)
    const controlador = new AbortController()
    const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_IA_MS)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sesión no disponible')
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preguntar-kairen`, {
        method: 'POST',
        signal: controlador.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        // La zona horaria del teléfono: así "este mes" es el mes del usuario,
        // no el del servidor (que está en UTC).
        body: JSON.stringify({ pregunta: q, zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone })
      })
      const data = await res.json()
      if (res.status === 403 && data.error === 'premium_requerido') {
        setTieneAcceso(false)
        return
      }
      if (data.error) throw new Error(data.error)
      setRespuesta(data.respuesta)
    } catch (err) {
      setErrorIA(err?.name === 'AbortError'
        ? 'Kairen tardó demasiado en responder. Intenta de nuevo en un momento.'
        : 'No se pudo obtener respuesta. Intenta de nuevo.')
    } finally {
      clearTimeout(temporizador)
      setPreguntando(false)
    }
  }

  return (
    <div style={{ paddingBottom: 20 }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        padding: 20, marginBottom: 16, textAlign: 'center'
      }}>
        <img src="/kairen-avatar.png" alt="Kairen" style={{ width: 56, height: 56, borderRadius: '50%', marginBottom: 8 }} />
        <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 17 }}>Pregunta a Kairen</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          Tu asistente financiero personal analiza tus datos reales
        </div>
      </div>

      {tieneAcceso === false && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 20, textAlign: 'center' }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}><Lock size={30} strokeWidth={1.6} aria-hidden="true" /></div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Función Premium</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Kairen IA está disponible para usuarios Premium.</div>
          <button onClick={() => setMostrarPremium(true)} style={{ marginTop: 14, padding: '10px 18px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600, fontSize: 14 }}>{t('premium_ver_planes')}</button>
        </div>
      )}

      {mostrarPremium && <Premium onCerrar={() => setMostrarPremium(false)} onActivado={() => { setMostrarPremium(false); setTieneAcceso(true) }} />}

      {tieneAcceso === null && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>Cargando…</p>
      )}

      {tieneAcceso && (
      <>
      {!respuesta && !preguntando && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>PREGUNTAS SUGERIDAS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {SUGERENCIAS.map(s => (
              <button key={s} onClick={() => { setPregunta(s); handlePreguntar(s) }}
                style={{
                  textAlign: 'left', padding: '12px 16px',
                  background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)', fontSize: 13,
                  color: 'var(--text-primary)', fontWeight: 500
                }}>{s}</button>
            ))}
          </div>
        </>
      )}

      {preguntando && <CargandoKairen />}

      {respuesta && !preguntando && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <img src="/kairen-avatar.png" alt="Kairen" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', paddingTop: 6 }}>"{pregunta}"</div>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{respuesta}</div>
          <button onClick={() => { setRespuesta(null); setPregunta('') }}
            style={{ marginTop: 16, width: '100%', padding: '10px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Nueva pregunta
          </button>
        </div>
      )}

      {errorIA && <p className="error-message">{errorIA}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <div className="input-shell" style={{ flex: 1, margin: 0 }}>
          <input value={pregunta} onChange={e => setPregunta(limitarPalabras(e.target.value, MAX_PALABRAS_PREGUNTA))}
            onKeyDown={e => e.key === 'Enter' && handlePreguntar()} maxLength={250}
            placeholder="Escribe tu pregunta financiera..." disabled={preguntando} />
        </div>
        <button onClick={() => handlePreguntar()} disabled={!pregunta.trim() || preguntando}
          style={{ padding: '0 16px', borderRadius: 'var(--radius-md)', background: pregunta.trim() ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: pregunta.trim() ? 'var(--on-accent)' : 'var(--text-muted)', fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
          ↑
        </button>
      </div>
      {pregunta.trim() && (
        <div style={{ fontSize: 11, color: contarPalabras(pregunta) >= MAX_PALABRAS_PREGUNTA ? 'var(--warning, #E0A100)' : 'var(--text-muted)', textAlign: 'right', marginTop: 6 }}>
          {contarPalabras(pregunta)}/{MAX_PALABRAS_PREGUNTA} palabras
        </div>
      )}
      </>
      )}
    </div>
  )
}