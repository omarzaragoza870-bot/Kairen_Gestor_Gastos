import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { obtenerTransaccionesPorMes, obtenerCuentas } from '../lib/db.js'
import { agruparPorCategoria } from '../lib/estadisticas.js'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import { mensajeAmigable } from '../lib/errores.js'

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function Reportes({ onBack }) {
  const { t } = usePreferencias()
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth())
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState(null)
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUserId(data.session.user.id)
    })
  }, [])

  const generarPDF = async () => {
    if (!userId) return
    setGenerando(true)
    setError(null)

    try {
      // Cargar jsPDF dinámicamente
      const { jsPDF } = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      const [transacciones, cuentas] = await Promise.all([
        obtenerTransaccionesPorMes(userId, new Date(anio, mes, 1)),
        obtenerCuentas(userId)
      ])

      const ingresos = transacciones.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0)
      const gastos   = transacciones.filter(t => t.tipo === 'gasto').reduce((s, t) => s + Number(t.monto), 0)
      const balance  = ingresos - gastos
      const gastosPorCat = agruparPorCategoria(transacciones, 'gasto')
      const fmt = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

      const W = 210
      let y = 0

      // ─── Header ───────────────────────────────────────────────
      doc.setFillColor(11, 15, 26)
      doc.rect(0, 0, W, 35, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('Kairen Finanzas', 14, 16)

      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text(`Reporte mensual — ${MESES_ES[mes]} ${anio}`, 14, 26)

      doc.setTextColor(120, 130, 160)
      doc.setFontSize(8)
      doc.text(`Generado el ${new Date().toLocaleDateString('es-MX')}`, W - 14, 26, { align: 'right' })

      y = 45

      // ─── Resumen ──────────────────────────────────────────────
      doc.setFillColor(20, 25, 45)
      doc.roundedRect(14, y, W - 28, 36, 3, 3, 'F')

      const col = (W - 28) / 3
      const tarjetas = [
        { label: 'Ingresos', valor: fmt(ingresos), color: [52, 211, 153] },
        { label: 'Gastos',   valor: fmt(gastos),   color: [248, 113, 113] },
        { label: 'Balance',  valor: fmt(balance),   color: balance >= 0 ? [52, 211, 153] : [248, 113, 113] },
      ]

      tarjetas.forEach((card, i) => {
        const x = 14 + i * col + col / 2
        doc.setFontSize(8)
        doc.setTextColor(120, 130, 160)
        doc.setFont('helvetica', 'normal')
        doc.text(card.label.toUpperCase(), x, y + 12, { align: 'center' })
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...card.color)
        doc.text(card.valor, x, y + 26, { align: 'center' })
      })

      y += 46

      // ─── Gastos por categoría ─────────────────────────────────
      if (gastosPorCat.length > 0) {
        doc.setTextColor(11, 15, 26)
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text('Gastos por categoría', 14, y)
        y += 8

        const maxMonto = gastosPorCat[0]?.monto || 1
        gastosPorCat.slice(0, 8).forEach(cat => {
          const pct = (cat.monto / gastos) * 100
          const barW = Math.max(2, ((cat.monto / maxMonto) * (W - 90)))

          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(30, 35, 60)
          doc.text(`${cat.nombre}`, 14, y + 4)
          doc.setTextColor(120, 130, 160)
          doc.text(`${pct.toFixed(1)}%`, 90, y + 4)
          doc.setTextColor(30, 35, 60)
          doc.setFont('helvetica', 'bold')
          doc.text(fmt(cat.monto), W - 14, y + 4, { align: 'right' })

          // Barra de progreso
          doc.setFillColor(235, 238, 248)
          doc.roundedRect(14, y + 6, W - 28, 4, 2, 2, 'F')
          doc.setFillColor(79, 124, 255)
          if (barW > 0) doc.roundedRect(14, y + 6, barW, 4, 2, 2, 'F')

          y += 16
          if (y > 260) { doc.addPage(); y = 20 }
        })
        y += 4
      }

      // ─── Transacciones del mes ────────────────────────────────
      if (y > 230) { doc.addPage(); y = 20 }

      doc.setTextColor(11, 15, 26)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Movimientos del mes', 14, y)
      y += 8

      // Encabezado de tabla
      doc.setFillColor(11, 15, 26)
      doc.rect(14, y, W - 28, 7, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text('Fecha', 17, y + 5)
      doc.text('Categoría', 45, y + 5)
      doc.text('Descripción', 95, y + 5)
      doc.text('Monto', W - 14, y + 5, { align: 'right' })
      y += 9

      // Filas
      transacciones.slice(0, 30).forEach((tx, i) => {
        if (y > 270) { doc.addPage(); y = 20 }

        if (i % 2 === 0) {
          doc.setFillColor(248, 249, 254)
          doc.rect(14, y - 1, W - 28, 7, 'F')
        }

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(80, 90, 120)
        doc.text(tx.fecha, 17, y + 4)
        doc.setTextColor(30, 35, 60)
        doc.text(tx.categoria_nombre?.substring(0, 20) || '', 45, y + 4)
        doc.setTextColor(120, 130, 160)
        doc.text((tx.descripcion || '').substring(0, 25), 95, y + 4)

        const esGasto = tx.tipo === 'gasto'
        doc.setTextColor(...(esGasto ? [220, 60, 60] : [40, 180, 100]))
        doc.setFont('helvetica', 'bold')
        doc.text(`${esGasto ? '-' : '+'}${fmt(tx.monto)}`, W - 14, y + 4, { align: 'right' })
        y += 7
      })

      if (transacciones.length > 30) {
        doc.setTextColor(120, 130, 160)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8)
        doc.text(`... y ${transacciones.length - 30} movimientos más`, 14, y + 6)
        y += 12
      }

      // ─── Saldos de cuentas ────────────────────────────────────
      if (y > 240) { doc.addPage(); y = 20 }
      y += 6

      doc.setTextColor(11, 15, 26)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Saldo de cuentas', 14, y)
      y += 8

      cuentas.forEach(c => {
        if (y > 270) { doc.addPage(); y = 20 }
        const esCredito = c.tipo === 'tarjeta_credito'

        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(30, 35, 60)
        doc.text(c.nombre, 14, y + 4)

        if (esCredito) {
          // Para tarjeta de crédito, "saldo" es deuda — mostrarla en rojo,
          // y calcular el disponible real (límite - deuda) por separado.
          const disponible = Number(c.limite_credito || 0) - Number(c.saldo || 0)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(52, 211, 153)
          doc.text(`Disponible: ${fmt(disponible)}`, W - 14, y + 4, { align: 'right' })
          doc.setFontSize(8)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(220, 60, 60)
          doc.text(`Deuda: ${fmt(c.saldo)}`, W - 14, y + 9, { align: 'right' })
          doc.setDrawColor(230, 233, 245)
          doc.line(14, y + 12, W - 14, y + 12)
          y += 15
        } else {
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(52, 211, 153)
          doc.text(fmt(c.saldo), W - 14, y + 4, { align: 'right' })
          doc.setDrawColor(230, 233, 245)
          doc.line(14, y + 7, W - 14, y + 7)
          y += 10
        }
      })

      // ─── Footer ───────────────────────────────────────────────
      const totalPages = doc.internal.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setFontSize(7)
        doc.setTextColor(180, 185, 200)
        doc.setFont('helvetica', 'normal')
        doc.text(`Kairen Finanzas · ${MESES_ES[mes]} ${anio} · Página ${i} de ${totalPages}`, W / 2, 292, { align: 'center' })
      }

      doc.save(`KairenFinanzas-${MESES_ES[mes]}-${anio}.pdf`)

    } catch (err) {
      setError(mensajeAmigable(err, 'No se pudo generar el reporte. Intenta de nuevo.'))
    } finally {
      setGenerando(false)
    }
  }

  const anios = [hoy.getFullYear() - 1, hoy.getFullYear()]

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} className="back-button">←</button>
        <h1>Reportes en PDF</h1>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 24px' }}>
        Genera un resumen mensual con tus ingresos, gastos, distribución por categoría y saldo de cuentas.
      </p>

      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: 20, marginBottom: 20 }}>

        <label className="field-label">Año</label>
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px' }}>
          {anios.map(a => (
            <button key={a} onClick={() => setAnio(a)} style={{
              flex: 1, padding: 12, borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 14,
              background: anio === a ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
              color: anio === a ? '#fff' : 'var(--text-secondary)',
              border: '1px solid ' + (anio === a ? 'transparent' : 'var(--border-subtle)')
            }}>{a}</button>
          ))}
        </div>

        <label className="field-label">Mes</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, margin: '8px 0 24px' }}>
          {MESES_ES.map((m, i) => (
            <button key={i} onClick={() => setMes(i)} style={{
              padding: '10px 4px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 11,
              background: mes === i ? 'var(--gradient-brand)' : 'var(--bg-surface-2)',
              color: mes === i ? '#fff' : 'var(--text-secondary)',
              border: '1px solid ' + (mes === i ? 'transparent' : 'var(--border-subtle)')
            }}>{m.substring(0, 3)}</button>
          ))}
        </div>

        {error && <p className="error-message">{error}</p>}

        <button
          onClick={generarPDF}
          disabled={generando || !userId}
          style={{
            width: '100%', padding: 16, borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 15,
            background: generando ? 'var(--bg-surface-2)' : 'var(--gradient-brand)',
            color: generando ? 'var(--text-muted)' : '#fff'
          }}
        >
          {generando ? '⏳ Generando PDF…' : `📄 Descargar reporte — ${MESES_ES[mes]} ${anio}`}
        </button>
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>El reporte incluye:</p>
        <ul style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
          <li>Resumen de ingresos, gastos y balance</li>
          <li>Gráfica de gastos por categoría</li>
          <li>Lista completa de movimientos</li>
          <li>Saldo actual de cada cuenta</li>
        </ul>
      </div>
    </div>
  )
}
