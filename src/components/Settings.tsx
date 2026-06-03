import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import { getCurrentUser, getSchoolUsers, toggleUserActive, updateUserRole } from '../services/usersService'
import type { UserProfile } from '../services/usersService'
import type { UserRole } from '../lib/supabase'

interface Props { onBack: () => void }

type Section = 'apariencia' | 'escuela' | 'ciclo' | 'usuarios'

interface SchoolData { id: string; nombre: string; cue: string | null; direccion: string | null; turno: string | null }
interface SchoolYear { id: string; anio: number; fecha_inicio: string; fecha_fin: string; activo: boolean }

export default function Settings({ onBack }: Props) {
  const { theme: t, isDark, toggleTheme } = useTheme()
  const [section, setSection]   = useState<Section>('apariencia')
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [school, setSchool]     = useState<SchoolData | null>(null)
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([])
  const [users, setUsers]       = useState<UserProfile[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [logoUrl, setLogoUrl]   = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError]         = useState<string | null>(null)

  // Formulario escuela
  const [schoolForm, setSchoolForm] = useState({ nombre: '', cue: '', direccion: '', turno: 'mañana' })

  // Formulario nuevo ciclo
  const [newYear, setNewYear] = useState({ anio: new Date().getFullYear() + 1, fecha_inicio: '', fecha_fin: '' })
  const [showNewYear, setShowNewYear] = useState(false)

  // Formulario nuevo usuario
  const [showNewUser, setShowNewUser] = useState(false)
  const [newUser, setNewUser] = useState({ nombre: '', apellido: '', email: '', password: '', rol: 'preceptor' as UserRole })

  useEffect(() => {
    async function load() {
      const profile = await getCurrentUser()
      if (!profile) return
      setCurrentUser(profile)

      const { data: schoolData } = await supabase.from('schools').select('*').eq('id', profile.school_id).single()
      if (schoolData) {
        setSchool(schoolData)
        setSchoolForm({ nombre: schoolData.nombre ?? '', cue: schoolData.cue ?? '', direccion: schoolData.direccion ?? '', turno: schoolData.turno ?? 'mañana' })
        // Cargar logo si existe
        const { data: logoData } = supabase.storage.from('school-logos').getPublicUrl(`${profile.school_id}/logo.png`)
        if (logoData?.publicUrl) {
          // Verificar que el archivo existe con un timestamp para evitar cache
          setLogoUrl(logoData.publicUrl + '?t=' + Date.now())
        }
      }

      const { data: yearsData } = await supabase.from('school_years').select('*').eq('school_id', profile.school_id).order('anio', { ascending: false })
      setSchoolYears(yearsData ?? [])

      const userList = await getSchoolUsers(profile.school_id)
      setUsers(userList)

      setLoading(false)
    }
    load()
  }, [])

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !school) return
    if (!file.name.toLowerCase().endsWith('.png')) {
      setLogoError('Solo se aceptan archivos PNG sin fondo.')
      return
    }
    if (file.size > 500 * 1024) {
      setLogoError('El archivo no puede superar 500KB.')
      return
    }
    setLogoUploading(true)
    setLogoError(null)
    const { error: uploadErr } = await supabase.storage
      .from('school-logos')
      .upload(`${school.id}/logo.png`, file, { upsert: true, contentType: 'image/png' })
    if (uploadErr) {
      setLogoError('Error al subir: ' + uploadErr.message)
    } else {
      const { data } = supabase.storage.from('school-logos').getPublicUrl(`${school.id}/logo.png`)
      setLogoUrl(data.publicUrl + '?t=' + Date.now())
    }
    setLogoUploading(false)
  }

  async function handleLogoDelete() {
    if (!school) return
    setLogoUploading(true)
    await supabase.storage.from('school-logos').remove([`${school.id}/logo.png`])
    setLogoUrl(null)
    setLogoUploading(false)
  }

  async function saveSchool() {
    if (!school) return
    setSaving(true); setError(null)
    const { error } = await supabase.from('schools').update({ nombre: schoolForm.nombre, cue: schoolForm.cue || null, direccion: schoolForm.direccion || null, turno: schoolForm.turno }).eq('id', school.id)
    setSaving(false)
    if (error) setError(error.message)
    else { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  async function activateYear(yearId: string) {
    if (!school) return
    setSaving(true)
    await supabase.from('school_years').update({ activo: false }).eq('school_id', school.id)
    await supabase.from('school_years').update({ activo: true }).eq('id', yearId)
    const { data } = await supabase.from('school_years').select('*').eq('school_id', school.id).order('anio', { ascending: false })
    setSchoolYears(data ?? [])
    setSaving(false)
  }

  async function createYear() {
    if (!school) return
    setSaving(true); setError(null)
    const { error } = await supabase.from('school_years').insert({ school_id: school.id, anio: newYear.anio, fecha_inicio: newYear.fecha_inicio, fecha_fin: newYear.fecha_fin, activo: false })
    if (error) { setError(error.message); setSaving(false); return }
    const { data } = await supabase.from('school_years').select('*').eq('school_id', school.id).order('anio', { ascending: false })
    setSchoolYears(data ?? [])
    setShowNewYear(false)
    setNewYear({ anio: new Date().getFullYear() + 1, fecha_inicio: '', fecha_fin: '' })
    setSaving(false)
  }

  async function handleToggleUser(userId: string, activo: boolean) {
    await toggleUserActive(userId, !activo)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, activo: !activo } : u))
  }

  async function handleRoleChange(userId: string, rol: UserRole) {
    await updateUserRole(userId, rol)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, rol } : u))
  }

  async function createUser() {
    if (!currentUser) return
    setSaving(true); setError(null)
    try {
      // Crear en auth
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({ email: newUser.email, password: newUser.password, email_confirm: true })
      if (authErr) throw authErr
      // Crear perfil
      const { error: profileErr } = await supabase.from('users').insert({ id: authData.user.id, school_id: currentUser.school_id, nombre: newUser.nombre, apellido: newUser.apellido, email: newUser.email, rol: newUser.rol })
      if (profileErr) throw profileErr
      const userList = await getSchoolUsers(currentUser.school_id)
      setUsers(userList)
      setShowNewUser(false)
      setNewUser({ nombre: '', apellido: '', email: '', password: '', rol: 'preceptor' })
    } catch (e: any) {
      setError(e.message ?? 'Error al crear usuario')
    }
    setSaving(false)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPrimary, outline: 'none', fontFamily: 'DM Sans', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'block', fontFamily: 'DM Mono' }
  const btnP: React.CSSProperties = { padding: '8px 18px', borderRadius: 8, border: 'none', background: t.green, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans' }
  const btnS: React.CSSProperties = { padding: '8px 18px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }
  const card: React.CSSProperties = { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }
  const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: t.textPrimary, margin: '0 0 16px' }

  const SECTIONS: { id: Section; label: string; icon: string }[] = [
    { id: 'apariencia', label: 'Apariencia', icon: '🎨' },
    { id: 'escuela', label: 'Escuela', icon: '🏫' },
    { id: 'ciclo', label: 'Ciclo lectivo', icon: '📅' },
    { id: 'usuarios', label: 'Usuarios', icon: '👥' },
  ]

  if (loading) return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: t.textMuted, fontSize: 13 }}>Cargando...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        .settings-layout { display: grid; grid-template-columns: 1fr; }
        .settings-sidebar { display: none; }
        .settings-tabs { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 20px; padding-bottom: 4px; }
        @media (min-width: 768px) {
          .settings-layout { grid-template-columns: 200px 1fr; gap: 24px; }
          .settings-sidebar { display: flex; flex-direction: column; gap: 4px; }
          .settings-tabs { display: none; }
        }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: t.headerBg, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.green, boxShadow: `0 0 8px ${t.green}` }} />
          <span style={{ fontSize: 22, color: t.textMuted, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: '600', textTransform: 'lowercase', letterSpacing: '0.04em'  }}>Configuración</span>
        </div>
        <button onClick={onBack} style={btnS}>← Volver</button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* Mobile tabs */}
        <div className="settings-tabs">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              style={{ padding: '7px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${section === s.id ? t.green : t.border}`, background: section === s.id ? t.greenBg : 'transparent', color: section === s.id ? t.green : t.textMuted }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        <div className="settings-layout">

          {/* Desktop sidebar */}
          <div className="settings-sidebar">
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)}
                style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', textAlign: 'left', border: `1px solid ${section === s.id ? t.green : 'transparent'}`, background: section === s.id ? t.greenBg : 'transparent', color: section === s.id ? t.green : t.textMuted, fontFamily: 'DM Sans' }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>

          {/* Contenido */}
          <div>

            {/* ─── Apariencia ─── */}
            {section === 'apariencia' && (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 300, margin: '0 0 20px' }}>Apariencia</h2>
                <div style={card}>
                  <p style={cardTitle}>Tema de la aplicación</p>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[
                      { label: 'Oscuro', icon: '🌙', value: true },
                      { label: 'Claro', icon: '☀️', value: false },
                    ].map(opt => (
                      <button key={opt.label} onClick={() => { if (isDark !== opt.value) toggleTheme() }}
                        style={{ flex: 1, padding: '20px 16px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${isDark === opt.value ? t.green : t.border}`, background: isDark === opt.value ? t.greenBg : 'transparent', color: isDark === opt.value ? t.green : t.textMuted, fontSize: 13, fontFamily: 'DM Sans', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 28 }}>{opt.icon}</span>
                        <span>{opt.label}</span>
                        {isDark === opt.value && <span style={{ fontSize: 11, color: t.green, fontFamily: 'DM Mono' }}>● Activo</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ─── Escuela ─── */}
            {section === 'escuela' && (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 300, margin: '0 0 20px' }}>Datos de la escuela</h2>
                <div style={card}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={lbl}>Nombre</label>
                      <input style={inp} value={schoolForm.nombre} onChange={e => setSchoolForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Escuela N° 42" />
                    </div>
                    <div>
                      <label style={lbl}>CUE</label>
                      <input style={inp} value={schoolForm.cue} onChange={e => setSchoolForm(f => ({ ...f, cue: e.target.value }))} placeholder="Ej: 060042-00" />
                    </div>
                    <div>
                      <label style={lbl}>Turno</label>
                      <select style={{ ...inp }} value={schoolForm.turno} onChange={e => setSchoolForm(f => ({ ...f, turno: e.target.value }))}>
                        <option value="mañana">Mañana</option>
                        <option value="tarde">Tarde</option>
                        <option value="noche">Noche</option>
                        <option value="completo">Completo</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={lbl}>Dirección</label>
                      <input style={inp} value={schoolForm.direccion} onChange={e => setSchoolForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Ej: Av. San Martín 100" />
                    </div>
                  </div>
                  {error && <p style={{ fontSize: 12, color: t.red, margin: '12px 0 0' }}>{error}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
                    <button onClick={saveSchool} disabled={saving} style={btnP}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
                    {saved && <span style={{ fontSize: 12, color: t.green }}>✓ Guardado</span>}
                  </div>
                </div>

                {/* Logo */}
                <div style={card}>
                  <p style={cardTitle}>Logotipo del establecimiento</p>
                  <p style={{ fontSize: 12, color: t.textMuted, margin: '0 0 16px', lineHeight: 1.6 }}>
                    El logo aparece en todos los informes y documentos generados por la app.<br />
                    <strong>Formato requerido:</strong> PNG sin fondo (transparente) · <strong>Tamaño recomendado:</strong> 300×300 px · <strong>Máximo:</strong> 500 KB
                  </p>

                  {/* Preview actual */}
                  {logoUrl && (
                    <div style={{ marginBottom: 16, padding: 16, background: isDark ? '#1a1a2e' : '#f0f0f0', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 16, border: `1px solid ${t.border}` }}>
                      <img
                        src={logoUrl}
                        alt="Logo"
                        style={{ width: 80, height: 80, objectFit: 'contain' }}
                        onError={() => setLogoUrl(null)}
                      />
                      <div>
                        <p style={{ margin: '0 0 8px', fontSize: 12, color: t.textMuted }}>Logo actual</p>
                        <button onClick={handleLogoDelete} disabled={logoUploading}
                          style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: `1px solid ${t.red}60`, background: 'transparent', color: t.red, cursor: 'pointer' }}>
                          🗑 Eliminar logo
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Upload */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <label style={{ ...btnP, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: logoUploading ? 0.6 : 1 }}>
                      {logoUploading ? 'Subiendo...' : logoUrl ? '🔄 Cambiar logo' : '📤 Subir logo PNG'}
                      <input type="file" accept=".png,image/png" onChange={handleLogoUpload} style={{ display: 'none' }} disabled={logoUploading} />
                    </label>
                    <span style={{ fontSize: 11, color: t.textMuted }}>Solo PNG · sin fondo · 300×300 px recomendado</span>
                  </div>
                  {logoError && <p style={{ fontSize: 12, color: t.red, margin: '10px 0 0' }}>{logoError}</p>}
                </div>
              </div>
            )}

            {/* ─── Ciclo lectivo ─── */}
            {section === 'ciclo' && (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 300, margin: '0 0 20px' }}>Ciclo lectivo</h2>

                {schoolYears.map(sy => (
                  <div key={sy.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 500, color: t.textPrimary }}>{sy.anio}</p>
                      <p style={{ margin: 0, fontSize: 12, color: t.textMuted, fontFamily: 'DM Mono' }}>
                        {sy.fecha_inicio} → {sy.fecha_fin}
                      </p>
                    </div>
                    {sy.activo
                      ? <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: t.greenBg, color: t.green, border: `1px solid ${t.greenBorder}`, fontFamily: 'DM Mono' }}>● Activo</span>
                      : <button onClick={() => activateYear(sy.id)} disabled={saving}
                          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}>
                          Activar
                        </button>
                    }
                  </div>
                ))}

                {!showNewYear
                  ? <button onClick={() => setShowNewYear(true)} style={{ ...btnS, width: '100%', textAlign: 'center' }}>+ Nuevo ciclo lectivo</button>
                  : (
                    <div style={card}>
                      <p style={cardTitle}>Nuevo ciclo lectivo</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={lbl}>Año</label>
                          <input style={inp} type="number" value={newYear.anio} onChange={e => setNewYear(f => ({ ...f, anio: parseInt(e.target.value) }))} />
                        </div>
                        <div>
                          <label style={lbl}>Inicio</label>
                          <input style={inp} type="date" value={newYear.fecha_inicio} onChange={e => setNewYear(f => ({ ...f, fecha_inicio: e.target.value }))} />
                        </div>
                        <div>
                          <label style={lbl}>Fin</label>
                          <input style={inp} type="date" value={newYear.fecha_fin} onChange={e => setNewYear(f => ({ ...f, fecha_fin: e.target.value }))} />
                        </div>
                      </div>
                      {error && <p style={{ fontSize: 12, color: t.red, margin: '10px 0 0' }}>{error}</p>}
                      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button onClick={() => setShowNewYear(false)} style={btnS}>Cancelar</button>
                        <button onClick={createYear} disabled={saving || !newYear.fecha_inicio || !newYear.fecha_fin} style={{ ...btnP, opacity: saving || !newYear.fecha_inicio || !newYear.fecha_fin ? 0.5 : 1 }}>
                          {saving ? 'Creando...' : 'Crear ciclo'}
                        </button>
                      </div>
                    </div>
                  )
                }
              </div>
            )}

            {/* ─── Usuarios ─── */}
            {section === 'usuarios' && (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 300, margin: '0 0 20px' }}>Usuarios del sistema</h2>

                {users.map(u => (
                  <div key={u.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: t.green, flexShrink: 0 }}>
                      {u.nombre[0]}{u.apellido[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 2px', fontSize: 13, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.apellido}, {u.nombre}</p>
                      <p style={{ margin: 0, fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                    </div>
                    <select value={u.rol} onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                      style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.inputBg, color: t.textPrimary, cursor: 'pointer', fontFamily: 'DM Sans' }}
                      disabled={u.id === currentUser?.id}>
                      <option value="director">Directora</option>
                      <option value="admin">Admin</option>
                      <option value="preceptor">Maestra</option>
                      <option value="docente">Maestra aux.</option>
                    </select>
                    {u.id !== currentUser?.id && (
                      <button onClick={() => handleToggleUser(u.id, u.activo)}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${u.activo ? t.border : t.green}`, background: 'transparent', color: u.activo ? t.red : t.green, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </div>
                ))}

                {!showNewUser
                  ? <button onClick={() => setShowNewUser(true)} style={{ ...btnS, width: '100%', textAlign: 'center' }}>+ Agregar usuario</button>
                  : (
                    <div style={card}>
                      <p style={cardTitle}>Nuevo usuario</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div><label style={lbl}>Nombre</label><input style={inp} value={newUser.nombre} onChange={e => setNewUser(f => ({ ...f, nombre: e.target.value }))} /></div>
                        <div><label style={lbl}>Apellido</label><input style={inp} value={newUser.apellido} onChange={e => setNewUser(f => ({ ...f, apellido: e.target.value }))} /></div>
                        <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Email</label><input style={inp} type="email" value={newUser.email} onChange={e => setNewUser(f => ({ ...f, email: e.target.value }))} /></div>
                        <div><label style={lbl}>Contraseña</label><input style={inp} type="password" value={newUser.password} onChange={e => setNewUser(f => ({ ...f, password: e.target.value }))} /></div>
                        <div>
                          <label style={lbl}>Rol</label>
                          <select style={{ ...inp }} value={newUser.rol} onChange={e => setNewUser(f => ({ ...f, rol: e.target.value as UserRole }))}>
                            <option value="preceptor">Maestra</option>
                            <option value="docente">Maestra aux.</option>
                            <option value="admin">Admin</option>
                            <option value="director">Directora</option>
                          </select>
                        </div>
                      </div>
                      {error && <p style={{ fontSize: 12, color: t.red, margin: '10px 0 0' }}>{error}</p>}
                      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button onClick={() => setShowNewUser(false)} style={btnS}>Cancelar</button>
                        <button onClick={createUser} disabled={saving || !newUser.nombre || !newUser.email || !newUser.password}
                          style={{ ...btnP, opacity: saving || !newUser.nombre || !newUser.email || !newUser.password ? 0.5 : 1 }}>
                          {saving ? 'Creando...' : 'Crear usuario'}
                        </button>
                      </div>
                    </div>
                  )
                }
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
