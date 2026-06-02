import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import { getActiveSchoolYear, getGrades, getDivisions } from '../services/divisionsService'
import { createStudent, enrollStudent, searchStudents } from '../services/studentsService'
import type { Grade, Division, Student } from '../lib/supabase'

interface Props { onBack: () => void }
type Step = 'search' | 'form' | 'enroll' | 'success'

export default function AddStudent({ onBack }: Props) {
  const { theme: t, isDark, toggleTheme } = useTheme()
  const [step, setStep]               = useState<Step>('search')
  const [grades, setGrades]           = useState<Grade[]>([])
  const [divisions, setDivisions]     = useState<Division[]>([])
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null)
  const [selectedDiv, setSelectedDiv] = useState<Division | null>(null)
  const [schoolId, setSchoolId]       = useState<string>('')
  const [schoolYearId, setSchoolYearId] = useState<string>('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Student[]>([])
  const [createdStudent, setCreatedStudent] = useState<Student | null>(null)
  const [form, setForm] = useState({ nombre: '', apellido: '', dni: '', fecha_nacimiento: '', legajo_nro: '' })

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('school_id').eq('id', user.id).single()
      if (!profile) return
      setSchoolId(profile.school_id)
      const sy = await getActiveSchoolYear(profile.school_id)
      if (!sy) return
      setSchoolYearId(sy.id)
      const gradeList = await getGrades(profile.school_id)
      setGrades(gradeList)
      if (gradeList.length > 0) {
        setSelectedGrade(gradeList[0])
        const divList = await getDivisions(gradeList[0].id, sy.id)
        setDivisions(divList)
        if (divList.length > 0) setSelectedDiv(divList[0])
      }
    }
    init()
  }, [])

  async function handleSearch() {
    if (!searchQuery.trim()) return
    const results = await searchStudents(schoolId, searchQuery)
    setSearchResults(results)
  }

  async function handleCreate() {
    setLoading(true); setError(null)
    try {
      const student = await createStudent(schoolId, { nombre: form.nombre, apellido: form.apellido, dni: form.dni || undefined, fecha_nacimiento: form.fecha_nacimiento || undefined, legajo_nro: form.legajo_nro || undefined })
      setCreatedStudent(student); setStep('enroll')
    } catch (e: any) { setError(e.message ?? 'Error al crear alumno') }
    finally { setLoading(false) }
  }

  async function handleEnroll(student: Student) {
    if (!selectedDiv) return
    setLoading(true); setError(null)
    try {
      await enrollStudent({ student_id: student.id, division_id: selectedDiv.id, school_year_id: schoolYearId })
      setCreatedStudent(student); setStep('success')
    } catch (e: any) { setError(e.message?.includes('unique') ? 'Este alumno ya está inscripto en este ciclo.' : e.message) }
    finally { setLoading(false) }
  }

  async function handleGradeChange(grade: Grade) {
    setSelectedGrade(grade)
    const divList = await getDivisions(grade.id, schoolYearId)
    setDivisions(divList)
    if (divList.length > 0) setSelectedDiv(divList[0])
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPrimary, outline: 'none', fontFamily: 'DM Sans', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'block', fontFamily: 'DM Mono' }
  const btnP: React.CSSProperties = { padding: '9px 20px', borderRadius: 8, border: 'none', background: t.green, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans' }
  const btnS: React.CSSProperties = { padding: '9px 20px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: t.headerBg, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.green, boxShadow: `0 0 8px ${t.green}` }} />
          <span style={{ fontSize: 22, color: t.textMuted, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: '600', textTransform: 'lowercase', letterSpacing: '0.04em' }}>Agregar alumno</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleTheme} style={{ fontSize: 14, background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>{isDark ? '☀️' : '🌙'}</button>
          <button onClick={onBack} style={btnS}>← Volver</button>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '32px auto', padding: '0 16px' }}>

        {step === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 300, margin: '0 0 4px' }}>¿Ya existe el alumno?</h2>
              <p style={{ fontSize: 13, color: t.textMuted, margin: 0 }}>Buscalo antes de crear uno nuevo.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Nombre, apellido o DNI..." style={{ ...inp, flex: 1 }} />
              <button onClick={handleSearch} style={btnP}>Buscar</button>
            </div>
            {searchResults.length > 0 && (
              <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <p style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 14px', borderBottom: `1px solid ${t.border}`, margin: 0, fontFamily: 'DM Mono' }}>Resultados</p>
                {searchResults.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${t.border}`, gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 14, color: t.textPrimary }}>{s.apellido}, {s.nombre}</p>
                      {s.dni && <p style={{ margin: '2px 0 0', fontSize: 11, color: t.textMuted, fontFamily: 'DM Mono' }}>DNI {s.dni}</p>}
                    </div>
                    <button onClick={() => { setCreatedStudent(s); setStep('enroll') }} style={btnP}>Inscribir →</button>
                  </div>
                ))}
              </div>
            )}
            {searchResults.length === 0 && searchQuery && <p style={{ fontSize: 13, color: t.textMuted, textAlign: 'center' }}>No se encontraron resultados.</p>}
            <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 20 }}>
              <button onClick={() => setStep('form')} style={{ ...btnS, width: '100%', textAlign: 'center' }}>+ Crear alumno nuevo</button>
            </div>
          </div>
        )}

        {step === 'form' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 300, margin: '0 0 4px' }}>Datos del alumno</h2>
              <p style={{ fontSize: 13, color: t.textMuted, margin: 0 }}>Solo nombre y apellido son obligatorios.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><label style={lbl}>Nombre *</label><input style={inp} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Camila" /></div>
              <div><label style={lbl}>Apellido *</label><input style={inp} value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} placeholder="Ej: Rodríguez" /></div>
              <div><label style={lbl}>DNI</label><input style={inp} value={form.dni} onChange={e => setForm(f => ({ ...f, dni: e.target.value }))} placeholder="Ej: 50123456" /></div>
              <div><label style={lbl}>Legajo</label><input style={inp} value={form.legajo_nro} onChange={e => setForm(f => ({ ...f, legajo_nro: e.target.value }))} placeholder="Ej: 2025-001" /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Fecha de nacimiento</label><input style={inp} type="date" value={form.fecha_nacimiento} onChange={e => setForm(f => ({ ...f, fecha_nacimiento: e.target.value }))} /></div>
            </div>
            {error && <p style={{ fontSize: 12, color: t.red, background: t.redBg, padding: '10px 12px', borderRadius: 8, margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('search')} style={btnS}>Cancelar</button>
              <button onClick={handleCreate} disabled={loading || !form.nombre || !form.apellido} style={{ ...btnP, opacity: loading || !form.nombre || !form.apellido ? 0.5 : 1 }}>{loading ? 'Guardando...' : 'Continuar →'}</button>
            </div>
          </div>
        )}

        {step === 'enroll' && createdStudent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 300, margin: '0 0 4px' }}>Inscribir al alumno</h2>
              <p style={{ fontSize: 13, color: t.textMuted, margin: 0 }}>{createdStudent.apellido}, {createdStudent.nombre} — elegí la sala y división.</p>
            </div>
            <div>
              <label style={lbl}>Sala</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {grades.map(g => <button key={g.id} onClick={() => handleGradeChange(g)} style={{ padding: '5px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: `1px solid ${selectedGrade?.id === g.id ? t.green : t.border}`, background: selectedGrade?.id === g.id ? t.greenBg : 'transparent', color: selectedGrade?.id === g.id ? t.green : t.textMuted }}>{g.nombre}</button>)}
              </div>
            </div>
            <div>
              <label style={lbl}>División</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {divisions.map(d => <button key={d.id} onClick={() => setSelectedDiv(d)} style={{ padding: '5px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: `1px solid ${selectedDiv?.id === d.id ? t.blue : t.border}`, background: selectedDiv?.id === d.id ? t.blueBg : 'transparent', color: selectedDiv?.id === d.id ? t.blue : t.textMuted }}>{d.nombre}</button>)}
              </div>
            </div>
            {error && <p style={{ fontSize: 12, color: t.red, background: t.redBg, padding: '10px 12px', borderRadius: 8, margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('search')} style={btnS}>Cancelar</button>
              <button onClick={() => handleEnroll(createdStudent)} disabled={loading || !selectedDiv} style={{ ...btnP, opacity: loading || !selectedDiv ? 0.5 : 1 }}>{loading ? 'Inscribiendo...' : 'Inscribir alumno'}</button>
            </div>
          </div>
        )}

        {step === 'success' && createdStudent && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: t.greenBg, border: `1px solid ${t.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 24 }}>✓</div>
            <h2 style={{ fontSize: 20, fontWeight: 300, margin: '0 0 8px' }}>Alumno inscripto</h2>
            <p style={{ fontSize: 14, color: t.textMuted, margin: '0 0 28px' }}>{createdStudent.apellido}, {createdStudent.nombre} fue inscripto en {selectedGrade?.nombre} {selectedDiv?.nombre}.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { setStep('search'); setForm({ nombre: '', apellido: '', dni: '', fecha_nacimiento: '', legajo_nro: '' }); setSearchQuery(''); setSearchResults([]) }} style={btnS}>Agregar otro</button>
              <button onClick={onBack} style={btnP}>Volver al dashboard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
