// @ts-nocheck
// supabase/functions/preguntar-kairen/index.ts
//
// IA financiera de Kairen — usa Gemini 2.0 Flash (gratuito)
// Lee los datos reales del usuario y responde preguntas financieras personalizadas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://kairen-gestor-gastos.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('ANON_KEY')!
    const geminiKey   = Deno.env.get('GEMINI_API_KEY')!

    // Verificar que el JWT es válido y obtener el usuario
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { pregunta } = await req.json()
    if (!pregunta?.trim() || pregunta.trim().length > 100) {
      return new Response(JSON.stringify({ error: 'Falta la pregunta' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Leer datos financieros del usuario
    const adminClient = createClient(supabaseUrl, serviceKey)
    const uid = user.id
    const hoy = new Date()
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)

    const [
      { data: cuentas },
      { data: transaccionesMes },
      { data: metas },
      { data: presupuestos },
      { data: categorias }
    ] = await Promise.all([
      adminClient.from('cuentas').select('nombre, saldo, tipo').eq('user_id', uid),
      adminClient.from('transacciones').select('tipo, monto, categoria_nombre, descripcion, fecha')
        .eq('user_id', uid).gte('fecha', inicioMes).order('fecha', { ascending: false }).limit(50),
      adminClient.from('metas').select('nombre, monto_objetivo, monto_actual, fecha_limite, completada')
        .eq('user_id', uid).eq('completada', false),
      adminClient.from('presupuestos').select('categoria_nombre, monto_limite').eq('user_id', uid),
      adminClient.from('categorias').select('nombre, tipo').eq('user_id', uid)
    ])

    // Calcular resumen financiero
    const ingresosMes = (transaccionesMes || [])
      .filter(t => t.tipo === 'ingreso')
      .reduce((s, t) => s + Number(t.monto), 0)
    const gastosMes = (transaccionesMes || [])
      .filter(t => t.tipo === 'gasto')
      .reduce((s, t) => s + Number(t.monto), 0)
    const balanceMes = ingresosMes - gastosMes
    const saldoTotal = (cuentas || []).reduce((s, c) => s + Number(c.saldo), 0)

    // Agrupar gastos por categoría
    const gastosPorCategoria = {}
    ;(transaccionesMes || [])
      .filter(t => t.tipo === 'gasto')
      .forEach(t => {
        gastosPorCategoria[t.categoria_nombre] = (gastosPorCategoria[t.categoria_nombre] || 0) + Number(t.monto)
      })
    const topCategorias = Object.entries(gastosPorCategoria)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([nombre, monto]) => `${nombre}: $${monto.toFixed(2)}`)

    const fmt = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    // Construir el contexto financiero
    const contexto = `
Eres Kairen, un asistente financiero personal amigable y directo. 
Hablas en español mexicano informal pero profesional.
Respondes SOLO con base en los datos reales del usuario que se te proporcionan.
Tus respuestas son concisas (máximo 150 palabras), prácticas y con emojis ocasionales.
Nunca inventas datos ni das consejos genéricos sin base en los números del usuario.

DATOS FINANCIEROS DEL USUARIO (${hoy.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}):

💰 Saldo total en cuentas: ${fmt(saldoTotal)}
${(cuentas || []).map(c => `  - ${c.nombre}: ${fmt(c.saldo)}`).join('\n')}

📊 Este mes:
  - Ingresos: ${fmt(ingresosMes)}
  - Gastos: ${fmt(gastosMes)}
  - Balance: ${fmt(balanceMes)} ${balanceMes >= 0 ? '✅' : '⚠️'}

🏷️ Top categorías de gasto este mes:
${topCategorias.length > 0 ? topCategorias.map(c => `  - ${c}`).join('\n') : '  - Sin gastos registrados este mes'}

🎯 Metas activas:
${(metas || []).length > 0
  ? metas.map(m => `  - ${m.nombre}: ${fmt(m.monto_actual)} de ${fmt(m.monto_objetivo)} ${m.fecha_limite ? `(límite: ${m.fecha_limite})` : ''}`).join('\n')
  : '  - Sin metas activas'}

📋 Presupuestos:
${(presupuestos || []).length > 0
  ? presupuestos.map(p => {
      const gastado = gastosPorCategoria[p.categoria_nombre] || 0
      const pct = Math.round((gastado / p.monto_limite) * 100)
      return `  - ${p.categoria_nombre}: ${fmt(gastado)} de ${fmt(p.monto_limite)} (${pct}%)`
    }).join('\n')
  : '  - Sin presupuestos configurados'}

Número de transacciones este mes: ${(transaccionesMes || []).length}
`.trim()

    // Llamar a Gemini 2.0 Flash
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${contexto}\n\nPREGUNTA DEL USUARIO: ${pregunta}` }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 150,
            topP: 0.9
          }
        })
      }
    )

        const geminiData = await geminiRes.json()
        console.log('[gemini status]', geminiRes.status)
        console.log('[gemini response]', JSON.stringify(geminiData))
        const respuesta = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!respuesta) {
      return new Response(JSON.stringify({ error: 'No se pudo obtener respuesta de la IA' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ respuesta }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[preguntar-kairen]', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
