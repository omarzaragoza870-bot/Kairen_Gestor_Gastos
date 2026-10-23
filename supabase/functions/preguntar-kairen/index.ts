// @ts-nocheck
// supabase/functions/preguntar-kairen/index.ts
//
// IA financiera de Kairen — usa Gemini 2.0 Flash (gratuito)
// Lee los datos reales del usuario y responde preguntas financieras personalizadas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeadersPara } from '../_shared/cors.ts'

// El servidor de Supabase corre en UTC. Sin una zona horaria, el último
// día del mes después de las 6 pm (hora de México) ya se consideraba el
// mes siguiente y los totales salían en cero.
const ZONA_POR_DEFECTO = 'America/Mexico_City'
const MAX_PALABRAS_PREGUNTA = 30
const MAX_PREGUNTAS_POR_HORA = 30

/**
 * Si la IA llegó al límite de longitud, recorta hasta la última oración
 * completa para que el usuario nunca vea una respuesta cortada a la mitad.
 */
function cerrarEnOracionCompleta(texto: string): string {
  const limpio = texto.trim()
  // Ya termina en oración completa (y no en un número cortado como "1,450.")
  if (/[.!?]$/.test(limpio) && !/\d\.$/.test(limpio)) return limpio
  // Último punto, signo de exclamación o interrogación seguido de espacio:
  // así no se confunde con el punto decimal de una cifra ($1,450.00).
  let corte = -1
  for (const coincidencia of limpio.matchAll(/[.!?](?=\s)/g)) corte = coincidencia.index ?? corte
  return corte > 0 ? limpio.slice(0, corte + 1) : limpio
}

function zonaValida(zona: unknown): zona is string {
  if (typeof zona !== 'string' || zona.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona })
    return true
  } catch {
    return false
  }
}

/** Fecha de hoy ('YYYY-MM-DD') en la zona horaria indicada. */
function hoyEnZona(zona: string): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersPara(req)

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

    const { pregunta, zonaHoraria } = await req.json()
    // Máximo 30 palabras (y 250 caracteres como tope de seguridad)
    const textoPregunta = String(pregunta || '').trim()
    const palabrasPregunta = textoPregunta ? textoPregunta.split(/\s+/).length : 0
    if (!textoPregunta || palabrasPregunta > MAX_PALABRAS_PREGUNTA || textoPregunta.length > 250) {
      return new Response(JSON.stringify({ error: `La pregunta debe tener entre 1 y ${MAX_PALABRAS_PREGUNTA} palabras.` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const adminClient = createClient(supabaseUrl, serviceKey)
    const uid = user.id

    // Nombre de pila del usuario para el saludo (Google o registro con correo).
    // Se limpia para que no pueda colar instrucciones dentro del prompt.
    const nombreCompleto = String(user.user_metadata?.full_name || user.user_metadata?.name || '')
    const nombre = nombreCompleto
      .replace(/[^\p{L}\p{M}' -]/gu, '')
      .trim()
      .split(/\s+/)[0]
      ?.slice(0, 30) || ''

    const zona = zonaValida(zonaHoraria) ? zonaHoraria : ZONA_POR_DEFECTO
    const hoyStr = hoyEnZona(zona)
    const anio = Number(hoyStr.slice(0, 4))
    const mes = Number(hoyStr.slice(5, 7)) // 1-12
    const inicioMes = `${hoyStr.slice(0, 7)}-01`
    const inicioSiguiente = mes === 12
      ? `${anio + 1}-01-01`
      : `${anio}-${String(mes + 1).padStart(2, '0')}-01`
    const nombreMes = new Date(Date.UTC(anio, mes - 1, 15)).toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' })

    // TODOS los movimientos del mes, en páginas de 1000. Antes se tomaban
    // solo los últimos 50, y con más movimientos los totales salían mal.
    const traerTransaccionesMes = async () => {
      const filas: { tipo: string, monto: number, categoria_nombre: string }[] = []
      for (let desde = 0; desde < 50000; desde += 1000) {
        const { data, error } = await adminClient.from('transacciones')
          .select('id, tipo, monto, categoria_nombre')
          .eq('user_id', uid)
          .gte('fecha', inicioMes)
          .lt('fecha', inicioSiguiente)
          .order('id', { ascending: true })
          .range(desde, desde + 999)
        if (error) throw error
        filas.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      return filas
    }

    // Todas las consultas en paralelo (antes iban una tras otra): la
    // respuesta llega antes. Nada se envía a la IA ni al usuario hasta
    // confirmar el acceso.
    const [
      { data: perfil },
      transaccionesMes,
      { data: cuentas },
      { data: metas },
      { data: presupuestos }
    ] = await Promise.all([
      adminClient.from('perfiles').select('acceso_fundador, plan').eq('user_id', uid).maybeSingle(),
      traerTransaccionesMes(),
      adminClient.from('cuentas').select('nombre, saldo, tipo').eq('user_id', uid),
      adminClient.from('metas').select('nombre, monto_objetivo, monto_actual, fecha_limite, completada')
        .eq('user_id', uid).eq('completada', false),
      adminClient.from('presupuestos').select('categoria_nombre, monto_limite').eq('user_id', uid)
    ])

    // Kairen IA es solo para usuarios Premium o con acceso fundador. Se
    // valida aquí (en el servidor) porque el bloqueo de la pantalla se
    // puede saltar; sin esta verificación cualquiera podría usarla.
    const tieneAcceso = perfil?.acceso_fundador === true || perfil?.plan === 'premium'
    if (!tieneAcceso) {
      return new Response(JSON.stringify({ error: 'premium_requerido' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Límite de uso por usuario (tabla ia_rate_limit): protege la cuota de
    // Gemini. Si la tabla falla, no se bloquea al usuario.
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: usadas, error: errorLimite } = await adminClient.from('ia_rate_limit')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .gte('created_at', haceUnaHora)
    if (!errorLimite && (usadas ?? 0) >= MAX_PREGUNTAS_POR_HORA) {
      return new Response(JSON.stringify({ error: 'Demasiadas preguntas. Intente de nuevo más tarde.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    await adminClient.from('ia_rate_limit').insert({ user_id: uid })

    // Calcular resumen financiero
    const ingresosMes = (transaccionesMes || [])
      .filter(t => t.tipo === 'ingreso')
      .reduce((s, t) => s + Number(t.monto), 0)
    const gastosMes = (transaccionesMes || [])
      .filter(t => t.tipo === 'gasto')
      .reduce((s, t) => s + Number(t.monto), 0)
    const balanceMes = ingresosMes - gastosMes
    // En tarjetas de crédito `saldo` es DEUDA: no puede sumarse como dinero.
    const cuentasLiquidas = (cuentas || []).filter(c => c.tipo !== 'tarjeta_credito')
    const tarjetasCredito = (cuentas || []).filter(c => c.tipo === 'tarjeta_credito')
    const saldoTotal = cuentasLiquidas.reduce((s, c) => s + Number(c.saldo), 0)
    const deudaTarjetas = tarjetasCredito.reduce((s, c) => s + Number(c.saldo), 0)

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
Eres Kairen, el asistente financiero de la app Kairen Finanzas.

ESTILO OBLIGATORIO:
- Tono formal, cordial y profesional, en español neutro. Trata al usuario de "usted".
- ${nombre
    ? `El usuario se llama ${nombre}. Inicia la respuesta saludándolo por su nombre (por ejemplo: "Buen día, ${nombre}." o "Hola, ${nombre}.").`
    : 'Inicia la respuesta con un saludo breve y formal (por ejemplo: "Buen día.").'}
- No uses modismos, regionalismos ni expresiones coloquiales (por ejemplo: "qué onda", "chido", "neta", "güey").
- No uses emojis.

FORMATO DE RESPUESTA (lo más importante):
- Lo más breve posible: 1 o 2 oraciones, máximo 35 palabras contando el saludo.
- Ve directo al dato que se pregunta, con la cifra exacta de los datos. Sin introducciones, sin repetir la pregunta, sin listas ni viñetas.
- Si es útil, agrega un solo tip corto al final, en la misma respuesta.
- Termina siempre con una oración completa.
- Responde SOLO con base en los datos reales del usuario que se te proporcionan. Nunca inventes datos.
- Si la pregunta no tiene que ver con sus finanzas, indícalo en una sola oración.

EJEMPLOS DEL LARGO Y ESTILO ESPERADOS (los corchetes se reemplazan con los datos reales, nunca se copian):
- "¿En qué gasto más?" → "Buen día. Su mayor gasto este mes es [categoría], con [monto]. Considere fijarle un presupuesto."
- "¿Me alcanza para fin de mes?" → "Buen día. Sí: tiene [monto] disponible y su balance del mes es positivo."
- "¿Cómo voy con mis metas?" → "Buen día. Su meta [nombre] lleva [monto] de [monto objetivo], un [porcentaje]%."

DATOS FINANCIEROS DEL USUARIO (${nombreMes}):

💰 Dinero en cuentas (efectivo, débito, banco): ${fmt(saldoTotal)}
${cuentasLiquidas.map(c => `  - ${c.nombre}: ${fmt(c.saldo)}`).join('\n')}
${tarjetasCredito.length > 0 ? `
💳 Deuda en tarjetas de crédito: ${fmt(deudaTarjetas)}
${tarjetasCredito.map(c => `  - ${c.nombre}: debe ${fmt(c.saldo)}`).join('\n')}
` : ''}
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

    // Llamar a Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${contexto}\n\nPREGUNTA DEL USUARIO: ${textoPregunta}` }]
            }
          ],
          generationConfig: {
            // Más baja = respuestas más directas y consistentes
            temperature: 0.4,
            // Techo de seguridad, no el largo deseado: el largo lo controla
            // el prompt (máx. 35 palabras). Se deja margen para que nunca corte.
            maxOutputTokens: 300,
            topP: 0.9
          }
        })
      }
    )

    const geminiData = await geminiRes.json()
    // Solo el estado: la respuesta completa contiene datos financieros del
    // usuario y no debe quedar en los logs de Supabase.
    if (!geminiRes.ok) console.error('[preguntar-kairen] Gemini respondió', geminiRes.status)
    const candidato = geminiData?.candidates?.[0]
    const textoIA = (candidato?.content?.parts || [])
      .filter((parte: { text?: string, thought?: boolean }) => parte?.text && !parte.thought)
      .map((parte: { text: string }) => parte.text)
      .join('')
      .trim()
    const respuesta = candidato?.finishReason === 'MAX_TOKENS'
      ? cerrarEnOracionCompleta(textoIA)
      : textoIA

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
    return new Response(JSON.stringify({ error: 'No se pudo procesar la pregunta.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})