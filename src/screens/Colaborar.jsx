import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { mensajeAmigable } from '../lib/errores.js'
import { Lock, Check, Crown, User } from 'lucide-react'
import { usePreferencias } from '../context/PreferenciasContext.jsx'
import Premium from './Premium.jsx'

export default function Colaborar({ onBack }) {
  const [cargando, setCargando] = useState(true)
  const [esPremium, setEsPremium] = useState(false)
  const [grupos, setGrupos] = useState([])
  const [userId, setUserId] = useState(null)
  const [creando, setCreando] = useState(false)
  const [uniendose, setUniendose] = useState(false)
  const [nombreGrupo, setNombreGrupo] = useState('')
  const [codigoInput, setCodigoInput] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState(null)
  const [mensaje, setMensaje] = useState(null)
  const [mostrarPremium, setMostrarPremium] = useState(false)
  const { t } = usePreferencias()

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)
      try {
        const { data } = await supabase.auth.getSession()
        const uid = data.session?.user?.id
        if (!uid) return
        setUserId(uid)

        const [{ data: perfil }, { data: miembros }] = await Promise.all([
          supabase.from('perfiles').select('acceso_fundador, plan').eq('user_id', uid).single(),
          supabase.from('miembros_grupo').select('grupo_id, rol, grupos(id, nombre, codigo_invitacion, creado_por)').eq('user_id', uid)
        ])

        setEsPremium(perfil?.acceso_fundador || perfil?.plan === 'premium')
        setGrupos(miembros?.map(m => ({ ...m.grupos, mi_rol: m.rol })) || [])
      } catch (err) {
        setError(mensajeAmigable(err))
      } finally {
        setCargando(false)
      }
    }
    cargar()
  }, [])

  const handleCrearGrupo = async () => {
    if (!nombreGrupo.trim()) return
    setProcesando(true)
    setError(null)
    try {
      const { error } = await supabase.rpc('crear_grupo', { p_nombre: nombreGrupo.trim() })
      if (error) throw error
      setMensaje('¡Grupo creado!')
      setCreando(false)
      setNombreGrupo('')
      // Recargar
      const { data: miembros } = await supabase.from('miembros_grupo').select('grupo_id, rol, grupos(id, nombre, codigo_invitacion, creado_por)').eq('user_id', userId)
      setGrupos(miembros?.map(m => ({ ...m.grupos, mi_rol: m.rol })) || [])
    } catch (err) {
      setError(mensajeAmigable(err))
    } finally {
      setProcesando(false)
    }
  }

  const handleUnirse = async () => {
    if (!codigoInput.trim()) return
    setProcesando(true)
    setError(null)
    try {
      const { error } = await supabase.rpc('unirse_a_grupo', { p_codigo: codigoInput.replace(/\s/g, '').toUpperCase() })
      if (error) throw error
      setMensaje('¡Te uniste al grupo!')
      setUniendose(false)
      setCodigoInput('')
      const { data: miembros } = await supabase.from('miembros_grupo').select('grupo_id, rol, grupos(id, nombre, codigo_invitacion, creado_por)').eq('user_id', userId)
      setGrupos(miembros?.map(m => ({ ...m.grupos, mi_rol: m.rol })) || [])
    } catch (err) {
      setError(mensajeAmigable(err))
    } finally {
      setProcesando(false)
    }
  }

  const copiarCodigo = (codigo) => {
    navigator.clipboard.writeText(codigo).then(() => setMensaje('¡Código copiado!'))
  }

  if (cargando) return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} aria-label="Volver" className="back-button">←</button>
        <h1>Colaborar</h1>
      </div>
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Cargando…</div>
    </div>
  )

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' }}>
      <div className="screen-header">
        <button onClick={onBack} aria-label="Volver" className="back-button">←</button>
        <h1>Colaborar</h1>
      </div>

      {!esPremium && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 20, marginBottom: 20, textAlign: 'center' }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}><Lock size={30} strokeWidth={1.6} aria-hidden="true" /></div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Función Premium</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>El modo colaborativo requiere una suscripción Premium.</div>
          <button onClick={() => setMostrarPremium(true)} style={{ marginTop: 14, padding: '10px 18px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600, fontSize: 14 }}>{t('premium_ver_planes')}</button>
        </div>
      )}

      {mostrarPremium && <Premium onCerrar={() => setMostrarPremium(false)} onActivado={() => { setMostrarPremium(false); setEsPremium(true) }} />}

      {esPremium && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
            Crea metas y presupuestos compartidos con tu pareja o familia — cada quien mantiene sus finanzas personales privadas.
          </p>

          {error && <p className="error-message">{error}</p>}
          {mensaje && <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 12 }}><Check size={14} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />{mensaje}</p>}

          {/* Grupos existentes */}
          {grupos.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px' }}>Tus grupos</h2>
              {grupos.map(g => (
                <div key={g.id} style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 10
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{g.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    Tu rol: {g.mi_rol === 'admin' ? <><Crown size={12} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 4, marginLeft: 2 }} />Admin</> : <><User size={12} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 4, marginLeft: 2 }} />Miembro</>}
                  </div>
                  {g.mi_rol === 'admin' && (
                    <div style={{ background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Código de invitación</div>
                        <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: 1, wordBreak: 'break-all', fontFamily: 'monospace' }}>{g.codigo_invitacion}</div>
                      </div>
                      <button
                        onClick={() => copiarCodigo(g.codigo_invitacion)}
                        style={{ background: 'var(--gradient-brand)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 999 }}
                      >
                        Copiar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Crear grupo */}
          {!creando && !uniendose && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button
                onClick={() => setCreando(true)}
                style={{ flex: 1, padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--gradient-brand)', color: 'var(--on-accent)', fontWeight: 700 }}
              >
                + Crear grupo
              </button>
              <button
                onClick={() => setUniendose(true)}
                style={{ flex: 1, padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 700, border: '1px solid var(--border-subtle)' }}
              >
                Unirme con código
              </button>
            </div>
          )}

          {creando && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px' }}>Nuevo grupo</h3>
              <label className="field-label">Nombre del grupo</label>
              <div className="input-shell" style={{ marginBottom: 14 }}>
                <input value={nombreGrupo} onChange={e => setNombreGrupo(e.target.value)} placeholder="Ej. Omar y Dory" maxLength={40} autoFocus />
              </div>
              <div className="modal-actions">
                <button onClick={() => { setCreando(false); setNombreGrupo('') }} disabled={procesando}>Cancelar</button>
                <button
                  onClick={handleCrearGrupo}
                  disabled={!nombreGrupo.trim() || procesando}
                  style={{ background: nombreGrupo.trim() ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: nombreGrupo.trim() ? 'var(--on-accent)' : 'var(--text-muted)' }}
                >
                  {procesando ? 'Creando…' : 'Crear'}
                </button>
              </div>
            </div>
          )}

          {uniendose && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px' }}>Unirme a un grupo</h3>
              <label className="field-label">Código de invitación</label>
              <div className="input-shell" style={{ marginBottom: 14 }}>
                <input
                  value={codigoInput}
                  onChange={e => setCodigoInput(e.target.value.replace(/\s/g, '').toUpperCase().slice(0, 16))}
                  placeholder="XXXXXXXXXXXXXXXX"
                  maxLength={40}
                  autoFocus
                  autoCapitalize="characters"
                  style={{ letterSpacing: 1, fontFamily: 'monospace', fontSize: 16, textAlign: 'center' }}
                />
              </div>
              <div className="modal-actions">
                <button onClick={() => { setUniendose(false); setCodigoInput('') }} disabled={procesando}>Cancelar</button>
                <button
                  onClick={handleUnirse}
                  disabled={codigoInput.length < 16 || procesando}
                  style={{ background: codigoInput.length >= 16 ? 'var(--gradient-brand)' : 'var(--bg-surface-2)', color: codigoInput.length >= 16 ? 'var(--on-accent)' : 'var(--text-muted)' }}
                >
                  {procesando ? 'Uniéndome…' : 'Unirme'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
