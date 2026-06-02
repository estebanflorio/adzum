import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import { getGrades, getDivisions, getActiveSchoolYear } from '../services/divisionsService'
import { useAttendance } from '../hooks/useAttendance'
import type { Grade, Division, AttendanceStatus } from '../lib/supabase'

interface Props { session: Session; onBack: () => void }

const STATUS_LABELS: Record<AttendanceStatus, string> = { presente: 'P', ausente: 'A', tardanza: 'T', justificado: 'J' }

export default function AttendanceSheet({ session, onBack }: Props) {
  const { theme: t, isDark, toggleTheme } = useTheme()
  const [grades, setGrades]                     = useState<Grade[]>([])
  const [divisions, setDivisions]               = useState<Division[]>([])
  const [selectedGrade, setSelectedGrade]       = useState<Grade | null>(null)
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null)
  const [schoolYearId, setSchoolYearId]         = useState<string | null>(null)
  const [userName, setUserName]                 = useState('')
  const [initLoading, setInitLoading]           = useState(true)

  const today = new Date().toISOString().split('T')[0]
  const { students, attendance, stats, loading, saving, error, isDirty, lastSaved, setStudentAttendance, save } =
    useAttendance({ divisionId: selectedDivision?.id ?? '', fecha: today })

  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.from('users').select('nombre, apellido, school_id').eq('id', session.user.id).single()
      if (!userData) return
      setUserName(`${userData.nombre} ${userData.apellido}`)
      const schoolYear = await getActiveSchoolYear(userData.school_id)
      if (!schoolYear) return
      setSchoolYearId(schoolYear.id)
      const gradeList = await getGrades(userData.school_id)
      setGrades(gradeList)
      if (gradeList.length > 0) {
        setSelectedGrade(gradeList[0])
        const divList = await getDivisions(gradeList[0].id, schoolYear.id)
        setDivisions(divList)
        if (divList.length > 0) setSelectedDivision(divList[0])
      }
      setInitLoading(false)
    }
    init()
  }, [session])

  async function handleGradeChange(grade: Grade) {
    setSelectedGrade(grade)
    setSelectedDivision(null)
    if (!schoolYearId) return
    const divList = await getDivisions(grade.id, schoolYearId)
    setDivisions(divList)
    if (divList.length > 0) setSelectedDivision(divList[0])
  }

  const fechaDisplay = new Date(today + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const statusActive: Record<AttendanceStatus, React.CSSProperties> = {
    presente:    { background: t.greenBg, borderColor: t.green, color: t.green },
    ausente:     { background: t.redBg,   borderColor: t.red,   color: t.red },
    tardanza:    { background: t.amberBg, borderColor: t.amber, color: t.amber },
    justificado: { background: t.blueBg,  borderColor: t.blue,  color: t.blue },
  }

  if (initLoading) return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: t.textMuted, fontSize: 13 }}>Cargando datos...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        .att-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 16px; }
        @media (max-width: 480px) { .att-stats { grid-template-columns: repeat(2,1fr); } }
      `}</style>

      {/* Header */}
      <div style={{ background: t.headerBg, borderBottom: `1px solid ${t.border}`, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.textPrimary }}>Tomar asistencia</p>
          <p style={{ margin: 0, fontSize: 11, color: t.textMuted, textTransform: 'capitalize' }}>{fechaDisplay}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: t.textMuted }}>{userName}</span>
          <button onClick={toggleTheme} style={{ fontSize: 14, background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>{isDark ? '☀️' : '🌙'}</button>
          <button onClick={onBack} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}>← Volver</button>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px' }}>
        {/* Salas (antes "Grados") */}
        <p style={{ fontSize: 11, fontWeight: 500, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: 'DM Mono' }}>Sala</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {grades.map(grade => (
            <button key={grade.id} onClick={() => handleGradeChange(grade)}
              style={{ padding: '5px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: `1px solid ${selectedGrade?.id === grade.id ? t.green : t.border}`, background: selectedGrade?.id === grade.id ? t.green : 'transparent', color: selectedGrade?.id === grade.id ? '#fff' : t.textMuted, fontWeight: selectedGrade?.id === grade.id ? 500 : 400 }}>
              {grade.nombre}
            </button>
          ))}
        </div>

        {/* División */}
        <p style={{ fontSize: 11, fontWeight: 500, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: 'DM Mono' }}>División</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {divisions.map(div => (
            <button key={div.id} onClick={() => setSelectedDivision(div)}
              style={{ padding: '5px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: `1px solid ${selectedDivision?.id === div.id ? t.green : t.border}`, background: selectedDivision?.id === div.id ? t.greenBg : 'transparent', color: selectedDivision?.id === div.id ? t.green : t.textMuted }}>
              Div. {div.nombre}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="att-stats">
          {[
            { label: 'Total', value: stats.total, color: t.textPrimary },
            { label: 'Presentes', value: stats.presente, color: t.green },
            { label: 'Ausentes', value: stats.ausente, color: t.red },
            { label: 'Tardanzas', value: stats.tardanza, color: t.amber },
          ].map(s => (
            <div key={s.label} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ margin: '0 0 4px', fontSize: 11, color: t.textMuted }}>{s.label}</p>
              <p style={{ margin: 0, fontSize: 24, fontWeight: 500, color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {error && <div style={{ background: t.redBg, border: `1px solid ${t.red}40`, color: t.red, fontSize: 12, padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>{error}</div>}

        {/* Lista */}
        <p style={{ fontSize: 11, fontWeight: 500, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: 'DM Mono' }}>Lista de asistencia</p>
        {loading ? (
          <div style={{ background: t.cardBg, borderRadius: 12, border: `1px solid ${t.border}`, padding: 32, textAlign: 'center' }}>
            <p style={{ color: t.textMuted, fontSize: 13, margin: 0 }}>Cargando alumnos...</p>
          </div>
        ) : students.length === 0 ? (
          <div style={{ background: t.cardBg, borderRadius: 12, border: `1px solid ${t.border}`, padding: 32, textAlign: 'center' }}>
            <p style={{ color: t.textMuted, fontSize: 13, margin: 0 }}>No hay alumnos en esta sala.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {students.map((s, i) => {
              const estado = attendance[s.enrollment_id] ?? 'presente'
              return (
                <div key={s.enrollment_id} style={{ background: t.cardBg, borderRadius: 10, border: `1px solid ${t.border}`, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: t.border, minWidth: 18 }}>{i + 1}</span>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: t.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, color: t.green, flexShrink: 0 }}>
                    {s.apellido[0]}{s.nombre[0]}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.apellido}, {s.nombre}</span>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map(st => (
                      <button key={st} onClick={() => setStudentAttendance(s.enrollment_id, st)}
                        style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid', fontSize: 11, fontWeight: 500, cursor: 'pointer', ...(estado === st ? statusActive[st] : { background: 'transparent', borderColor: t.border, color: t.textMuted }) }}>
                        {STATUS_LABELS[st]}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Guardar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
          <span style={{ fontSize: 12, color: t.textMuted }}>
            {lastSaved ? `Guardado ${lastSaved.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : isDirty ? 'Sin guardar' : 'Sin cambios'}
          </span>
          <button onClick={save} disabled={saving || !isDirty}
            style={{ padding: '8px 20px', background: saving || !isDirty ? t.border : t.green, color: saving || !isDirty ? t.textMuted : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving || !isDirty ? 'default' : 'pointer' }}>
            {saving ? 'Guardando...' : 'Guardar asistencia'}
          </button>
        </div>
      </div>
    </div>
  )
}
