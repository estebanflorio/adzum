import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

interface Props { onBack: () => void }

// ── Tipos ─────────────────────────────────────────────────────
interface SchoolInfo { nombre: string; direccion: string; cue: string; distrito: string }
interface Alumno { enrollment_id: string; student_id: string; nombre: string; apellido: string; dni: string | null }
interface DiaAsistencia { fecha: string; estado: 'presente' | 'ausente' | 'tardanza' | 'justificado' | null }
interface AlumnoConAsistencia extends Alumno { dias: DiaAsistencia[]; presentes: number; ausentes: number; tardanzas: number; justificados: number; porcentaje: number }
interface Grade { id: string; nombre: string }
interface Division { id: string; nombre: string; grade_id: string }
interface SchoolYear { id: string; anio: number }

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const ESTADO_LETRA: Record<string, string> = { presente: 'P', ausente: 'A', tardanza: 'T', justificado: 'J' }
const ESTADO_COLOR: Record<string, string> = { presente: '#22c55e', ausente: '#ef4444', tardanza: '#f59e0b', justificado: '#3b82f6' }

type ReportType = 'menu' | 'planilla-mensual' | 'resumen-mensual' | 'notificacion' | 'estadistica-anual' | 'evolucion-mensual' | 'boletin'

export default function Reports({ onBack }: Props) {
  const { theme: t, isDark, toggleTheme } = useTheme()

  const [reportType, setReportType]     = useState<ReportType>('menu')
  const [schoolInfo, setSchoolInfo]     = useState<SchoolInfo>({ nombre: '', direccion: '', cue: '', distrito: '' })
  const [grades, setGrades]             = useState<Grade[]>([])
  const [divisions, setDivisions]       = useState<Division[]>([])
  const [schoolYears, setSchoolYears]   = useState<SchoolYear[]>([])

  // Filtros
  const [selectedGrade, setSelectedGrade]     = useState<Grade | null>(null)
  const [selectedDiv, setSelectedDiv]         = useState<Division | null>(null)
  const [selectedYear, setSelectedYear]       = useState<SchoolYear | null>(null)
  const [selectedMonth, setSelectedMonth]     = useState<number>(new Date().getMonth() + 1)
  const [selectedAlumnos, setSelectedAlumnos] = useState<string[]>([])

  // Datos del reporte
  const [reportData, setReportData]     = useState<AlumnoConAsistencia[]>([])
  const [diasHabiles, setDiasHabiles]   = useState<string[]>([])
  const [loading, setLoading]           = useState(false)
  const [dataLoaded, setDataLoaded]     = useState(false)
  const [activeSchoolYearId, setActiveSchoolYearId] = useState('')

  // ── Init ──
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('school_id').eq('id', user.id).single()
      if (!profile) return

      const [{ data: school }, { data: sysData }, { data: gradesData }] = await Promise.all([
        supabase.from('schools').select('nombre, direccion, cue, distrito').eq('id', profile.school_id).single(),
        supabase.from('school_years').select('id, anio').eq('school_id', profile.school_id).order('anio', { ascending: false }),
        supabase.from('grades').select('id, nombre').eq('school_id', profile.school_id).order('orden'),
      ])

      if (school) setSchoolInfo(school)
      if (sysData && sysData.length > 0) {
        setSchoolYears(sysData)
        setSelectedYear(sysData[0])
        setActiveSchoolYearId(sysData[0].id)
      }
      if (gradesData && gradesData.length > 0) {
        setGrades(gradesData)
        setSelectedGrade(gradesData[0])
        // Cargar divisiones del primer grado
        const { data: divs } = await supabase.from('divisions').select('id, nombre, grade_id')
          .eq('grade_id', gradesData[0].id)
          .eq('school_year_id', sysData?.[0]?.id ?? '')
        if (divs && divs.length > 0) {
          setDivisions(divs)
          setSelectedDiv(divs[0])
        }
      }
    }
    init()
  }, [])

  async function handleGradeChange(grade: Grade) {
    setSelectedGrade(grade)
    setSelectedDiv(null)
    setDataLoaded(false)
    const { data: divs } = await supabase.from('divisions').select('id, nombre, grade_id')
      .eq('grade_id', grade.id)
      .eq('school_year_id', selectedYear?.id ?? activeSchoolYearId)
    if (divs) {
      setDivisions(divs)
      if (divs.length > 0) setSelectedDiv(divs[0])
    }
  }

  // ── Obtener días hábiles del mes (lunes a viernes) ──
  function getDiasHabiles(anio: number, mes: number): string[] {
    const dias: string[] = []
    const date = new Date(anio, mes - 1, 1)
    while (date.getMonth() === mes - 1) {
      const dow = date.getDay()
      if (dow !== 0 && dow !== 6) {
        dias.push(date.toISOString().split('T')[0])
      }
      date.setDate(date.getDate() + 1)
    }
    return dias
  }

  // ── Cargar datos de asistencia ──
  async function loadData() {
    if (!selectedDiv || !selectedYear) return
    setLoading(true)
    setDataLoaded(false)

    const anio = selectedYear.anio
    const mesStr = String(selectedMonth).padStart(2, '0')
    const fechaInicio = `${anio}-${mesStr}-01`
    const fechaFin = `${anio}-${mesStr}-31`

    // Alumnos de la división
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('id, students(id, nombre, apellido, dni)')
      .eq('division_id', selectedDiv.id)
      .eq('school_year_id', selectedYear.id)
      .eq('activo', true)

    if (!enrollments || enrollments.length === 0) {
      setReportData([])
      setDiasHabiles(getDiasHabiles(anio, selectedMonth))
      setLoading(false)
      setDataLoaded(true)
      return
    }

    const enrollmentIds = enrollments.map((e: any) => e.id)

    // Asistencias del mes
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('enrollment_id, fecha, estado')
      .in('enrollment_id', enrollmentIds)
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)

    const dias = getDiasHabiles(anio, selectedMonth)
    setDiasHabiles(dias)

    // Construir mapa por enrollment_id
    const attMap: Record<string, Record<string, string>> = {}
    for (const a of (attendanceData ?? [])) {
      if (!attMap[a.enrollment_id]) attMap[a.enrollment_id] = {}
      attMap[a.enrollment_id][a.fecha] = a.estado
    }

    const result: AlumnoConAsistencia[] = enrollments.map((e: any) => {
      const diasData: DiaAsistencia[] = dias.map(f => ({
        fecha: f,
        estado: (attMap[e.id]?.[f] ?? null) as DiaAsistencia['estado'],
      }))
      const presentes    = diasData.filter(d => d.estado === 'presente').length
      const ausentes     = diasData.filter(d => d.estado === 'ausente').length
      const tardanzas    = diasData.filter(d => d.estado === 'tardanza').length
      const justificados = diasData.filter(d => d.estado === 'justificado').length
      const diasConRegistro = diasData.filter(d => d.estado !== null).length
      const porcentaje = diasConRegistro > 0 ? Math.round(((presentes + tardanzas) / diasConRegistro) * 100) : 0
      return {
        enrollment_id: e.id,
        student_id: e.students.id,
        nombre: e.students.nombre,
        apellido: e.students.apellido,
        dni: e.students.dni,
        dias: diasData,
        presentes, ausentes, tardanzas, justificados, porcentaje,
      }
    })
    result.sort((a, b) => a.apellido.localeCompare(b.apellido))
    setReportData(result)
    setLoading(false)
    setDataLoaded(true)
  }

  // ── Imprimir ──
  function imprimir() {
    window.print()
  }

  const btnS: React.CSSProperties = { padding: '7px 16px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans' }
  const btnP: React.CSSProperties = { padding: '8px 20px', borderRadius: 8, border: 'none', background: t.green, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans' }
  const lbl: React.CSSProperties = { fontSize: 11, color: t.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6, display: 'block', fontFamily: 'DM Mono' }
  const inp: React.CSSProperties = { padding: '8px 12px', fontSize: 13, borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPrimary, outline: 'none', fontFamily: 'DM Sans' }

  const mesNombre = MESES[selectedMonth]
  const anioActual = selectedYear?.anio ?? new Date().getFullYear()

  // ── Filtros comunes ──
  const FiltrosComunes = ({ conMes = true }: { conMes?: boolean }) => (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <div>
        <label style={lbl}>Ciclo lectivo</label>
        <select value={selectedYear?.id ?? ''} onChange={e => setSelectedYear(schoolYears.find(y => y.id === e.target.value) ?? null)} style={inp}>
          {schoolYears.map(y => <option key={y.id} value={y.id}>{y.anio}</option>)}
        </select>
      </div>
      <div>
        <label style={lbl}>Sala</label>
        <select value={selectedGrade?.id ?? ''} onChange={e => handleGradeChange(grades.find(g => g.id === e.target.value)!)} style={inp}>
          {grades.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
      </div>
      <div>
        <label style={lbl}>División / Turno</label>
        <select value={selectedDiv?.id ?? ''} onChange={e => { setSelectedDiv(divisions.find(d => d.id === e.target.value) ?? null); setDataLoaded(false) }} style={inp}>
          {divisions.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
      </div>
      {conMes && (
        <div>
          <label style={lbl}>Mes</label>
          <select value={selectedMonth} onChange={e => { setSelectedMonth(Number(e.target.value)); setDataLoaded(false) }} style={inp}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{MESES[m]}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <button onClick={loadData} disabled={loading || !selectedDiv} style={{ ...btnP, opacity: !selectedDiv ? 0.5 : 1 }}>
          {loading ? 'Cargando...' : 'Generar informe'}
        </button>
      </div>
    </div>
  )

  // ────────────────────────────────────────────────────────────
  // HEADER compartido
  // ────────────────────────────────────────────────────────────
  const Header = ({ titulo }: { titulo: string }) => (
    <div style={{ borderBottom: `1px solid ${t.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: t.headerBg, zIndex: 10 }} className="no-print">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.green, boxShadow: `0 0 8px ${t.green}` }} />
        <span style={{ fontSize: 18, fontWeight: 600, color: t.textPrimary, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{titulo}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {dataLoaded && <button onClick={imprimir} style={{ ...btnP, background: '#3b82f6' }}>🖨 Imprimir / PDF</button>}
        <button onClick={toggleTheme} style={{ fontSize: 14, background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>{isDark ? '☀️' : '🌙'}</button>
        <button onClick={() => { setReportType('menu'); setDataLoaded(false) }} style={btnS}>← Informes</button>
        <button onClick={onBack} style={btnS}>Panel</button>
      </div>
    </div>
  )

  // ────────────────────────────────────────────────────────────
  // CABECERA de impresión (aparece en todos los PDFs)
  // ────────────────────────────────────────────────────────────
  const PrintHeader = ({ subtitulo }: { subtitulo: string }) => (
    <div className="print-only" style={{ display: 'none', marginBottom: 16 }}>
      <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{schoolInfo.nombre || 'Jardín de Infantes'}</div>
        {schoolInfo.cue && <div style={{ fontSize: 11 }}>CUE: {schoolInfo.cue} {schoolInfo.distrito ? `— Distrito: ${schoolInfo.distrito}` : ''}</div>}
        {schoolInfo.direccion && <div style={{ fontSize: 11 }}>{schoolInfo.direccion}</div>}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', marginBottom: 4 }}>{subtitulo}</div>
      <div style={{ fontSize: 11, textAlign: 'center', color: '#555' }}>
        {selectedGrade?.nombre} — División {selectedDiv?.nombre} — {mesNombre} {anioActual}
      </div>
    </div>
  )

  // ────────────────────────────────────────────────────────────
  // 1. PLANILLA MENSUAL (la más compleja — grilla día x alumno)
  // ────────────────────────────────────────────────────────────
  if (reportType === 'planilla-mensual') {
    const diasChunks: string[][] = []
    for (let i = 0; i < diasHabiles.length; i += 16) diasChunks.push(diasHabiles.slice(i, i + 16))

    return (
      <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
        <style>{`
          @media print {
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            body { background: white !important; color: black !important; }
            .print-table { font-size: 9px !important; }
            .print-page-break { page-break-before: always; }
          }
          .print-only { display: none; }
        `}</style>
        <Header titulo="Planilla Mensual de Asistencia" />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
          <div className="no-print">
            <FiltrosComunes />
          </div>
          {dataLoaded && (
            <>
              <PrintHeader subtitulo="PLANILLA MENSUAL DE ASISTENCIA" />
              {diasChunks.map((chunk, ci) => (
                <div key={ci} className={ci > 0 ? 'print-page-break' : ''} style={{ marginBottom: 32 }}>
                  {ci > 0 && (
                    <div className="no-print" style={{ height: 1, background: t.border, margin: '24px 0' }} />
                  )}
                  <div style={{ overflowX: 'auto' }}>
                    <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'left', background: '#f8f8f8', minWidth: 160, fontSize: 11 }}>Alumno</th>
                          {chunk.map(f => {
                            const d = new Date(f + 'T12:00:00')
                            return (
                              <th key={f} style={{ border: '1px solid #ccc', padding: '4px 2px', textAlign: 'center', background: '#f8f8f8', minWidth: 28, fontSize: 10 }}>
                                <div style={{ fontWeight: 600 }}>{d.getDate()}</div>
                                <div style={{ fontWeight: 400, color: '#666', fontSize: 9 }}>{['D','L','M','X','J','V','S'][d.getDay()]}</div>
                              </th>
                            )
                          })}
                          <th style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'center', background: '#e8f5e9', fontSize: 10, minWidth: 30 }}>P</th>
                          <th style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'center', background: '#ffebee', fontSize: 10, minWidth: 30 }}>A</th>
                          <th style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'center', background: '#fff8e1', fontSize: 10, minWidth: 30 }}>T</th>
                          <th style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'center', background: '#e3f2fd', fontSize: 10, minWidth: 30 }}>J</th>
                          <th style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'center', background: '#f3e5f5', fontSize: 10, minWidth: 40 }}>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.map((a, i) => (
                          <tr key={a.enrollment_id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ border: '1px solid #ddd', padding: '5px 8px', fontSize: 11 }}>{a.apellido}, {a.nombre}</td>
                            {chunk.map(f => {
                              const dia = a.dias.find(d => d.fecha === f)
                              const est = dia?.estado ?? null
                              return (
                                <td key={f} style={{ border: '1px solid #ddd', padding: '4px 2px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: est ? ESTADO_COLOR[est] : '#ddd' }}>
                                  {est ? ESTADO_LETRA[est] : '·'}
                                </td>
                              )
                            })}
                            <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: 10, color: '#22c55e', fontWeight: 600 }}>{a.presentes}</td>
                            <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: 10, color: '#ef4444', fontWeight: 600 }}>{a.ausentes}</td>
                            <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>{a.tardanzas}</td>
                            <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: 10, color: '#3b82f6', fontWeight: 600 }}>{a.justificados}</td>
                            <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: a.porcentaje >= 85 ? '#22c55e' : a.porcentaje >= 70 ? '#f59e0b' : '#ef4444' }}>{a.porcentaje}%</td>
                          </tr>
                        ))}
                        {/* Totales */}
                        <tr style={{ background: '#f0f0f0', fontWeight: 700 }}>
                          <td style={{ border: '1px solid #ccc', padding: '5px 8px', fontSize: 11 }}>TOTALES</td>
                          {chunk.map(f => {
                            const presDay = reportData.filter(a => a.dias.find(d => d.fecha === f)?.estado === 'presente').length
                            return (
                              <td key={f} style={{ border: '1px solid #ccc', padding: '4px 2px', textAlign: 'center', fontSize: 9 }}>{presDay || ''}</td>
                            )
                          })}
                          <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center', fontSize: 10 }}>{reportData.reduce((s, a) => s + a.presentes, 0)}</td>
                          <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center', fontSize: 10 }}>{reportData.reduce((s, a) => s + a.ausentes, 0)}</td>
                          <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center', fontSize: 10 }}>{reportData.reduce((s, a) => s + a.tardanzas, 0)}</td>
                          <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center', fontSize: 10 }}>{reportData.reduce((s, a) => s + a.justificados, 0)}</td>
                          <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center', fontSize: 10 }}>
                            {reportData.length > 0 ? Math.round(reportData.reduce((s, a) => s + a.porcentaje, 0) / reportData.length) : 0}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {/* Leyenda y firma */}
              <div style={{ marginTop: 24, fontSize: 11, color: t.textMuted, display: 'flex', gap: 16, flexWrap: 'wrap' }} className="no-print">
                {[['P','Presente','#22c55e'],['A','Ausente','#ef4444'],['T','Tardanza','#f59e0b'],['J','Justificado','#3b82f6']].map(([l,n,c]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 700, color: c, fontFamily: 'DM Mono' }}>{l}</span> = {n}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 12, color: t.textMuted }}>Firma Maestra</div>
                <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 12, color: t.textMuted }}>Firma Directora</div>
              </div>
              {reportData.length === 0 && (
                <p style={{ textAlign: 'center', color: t.textMuted, marginTop: 40 }}>No hay alumnos o registros para este período.</p>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // 2. RESUMEN MENSUAL DE INASISTENCIAS
  // ────────────────────────────────────────────────────────────
  if (reportType === 'resumen-mensual') {
    const ordenados = [...reportData].sort((a, b) => b.ausentes - a.ausentes)
    const criticos  = ordenados.filter(a => a.porcentaje < 70)
    const alertas   = ordenados.filter(a => a.porcentaje >= 70 && a.porcentaje < 85)
    return (
      <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
        <style>{`@media print { .no-print{display:none!important} .print-only{display:block!important} body{background:white!important;color:black!important} } .print-only{display:none}`}</style>
        <Header titulo="Resumen Mensual de Inasistencias" />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
          <div className="no-print"><FiltrosComunes /></div>
          {dataLoaded && (
            <>
              <PrintHeader subtitulo={`RESUMEN DE INASISTENCIAS — ${mesNombre.toUpperCase()} ${anioActual}`} />
              {/* Stats rápidas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }} className="no-print">
                {[
                  { label: 'Alumnos', value: reportData.length, color: t.textPrimary },
                  { label: 'Asistencia prom.', value: `${reportData.length > 0 ? Math.round(reportData.reduce((s,a) => s+a.porcentaje,0)/reportData.length) : 0}%`, color: t.green },
                  { label: 'En alerta', value: alertas.length, color: t.amber },
                  { label: 'Críticos', value: criticos.length, color: t.red },
                ].map(s => (
                  <div key={s.label} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '14px 16px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono' }}>{s.label}</p>
                    <p style={{ margin: 0, fontSize: 24, fontWeight: 500, color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
              {/* Tabla */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8f8f8' }}>
                    <th style={{ border: '1px solid #ddd', padding: '8px 12px', textAlign: 'left', fontSize: 11 }}>Alumno</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11, color: '#22c55e' }}>Pres.</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11, color: '#ef4444' }}>Aus.</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11, color: '#f59e0b' }}>Tard.</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11, color: '#3b82f6' }}>Just.</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11 }}>% Asist.</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenados.map((a, i) => (
                    <tr key={a.enrollment_id} style={{ background: a.porcentaje < 70 ? '#fff5f5' : a.porcentaje < 85 ? '#fffbf0' : i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ border: '1px solid #eee', padding: '7px 12px', fontSize: 13 }}>{a.apellido}, {a.nombre}</td>
                      <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', fontWeight: 600, color: '#22c55e' }}>{a.presentes}</td>
                      <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', fontWeight: 600, color: '#ef4444' }}>{a.ausentes}</td>
                      <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', fontWeight: 600, color: '#f59e0b' }}>{a.tardanzas}</td>
                      <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', fontWeight: 600, color: '#3b82f6' }}>{a.justificados}</td>
                      <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', fontWeight: 700, color: a.porcentaje >= 85 ? '#22c55e' : a.porcentaje >= 70 ? '#f59e0b' : '#ef4444' }}>{a.porcentaje}%</td>
                      <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', fontSize: 11 }}>
                        {a.porcentaje < 70 ? <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠ Crítico</span> : a.porcentaje < 85 ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠ Alerta</span> : <span style={{ color: '#22c55e' }}>✓ Normal</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportData.length === 0 && <p style={{ textAlign: 'center', color: t.textMuted, marginTop: 32 }}>No hay datos para este período.</p>}
              <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 12, color: t.textMuted }}>Firma Maestra</div>
                <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 12, color: t.textMuted }}>Firma Directora</div>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // 3. NOTIFICACIÓN INDIVIDUAL A FAMILIAS
  // ────────────────────────────────────────────────────────────
  if (reportType === 'notificacion') {
    return (
      <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
        <style>{`
          @media print {
            .no-print{display:none!important}
            .print-only{display:block!important}
            body{background:white!important;color:black!important}
            .notif-card { page-break-after: always; border: 1px solid #000 !important; padding: 24px !important; }
          }
          .print-only{display:none}
        `}</style>
        <Header titulo="Notificaciones a Familias" />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
          <div className="no-print">
            <FiltrosComunes />
            {dataLoaded && reportData.length > 0 && (
              <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: t.textMuted }}>Seleccioná los alumnos para los que querés imprimir notificación (solo se muestran los que tienen alertas):</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setSelectedAlumnos(reportData.filter(a => a.porcentaje < 85).map(a => a.enrollment_id))} style={{ ...btnS, fontSize: 11 }}>Seleccionar todos con alerta</button>
                  <button onClick={() => setSelectedAlumnos([])} style={{ ...btnS, fontSize: 11 }}>Limpiar</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {reportData.filter(a => a.porcentaje < 85).map(a => (
                    <label key={a.enrollment_id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={selectedAlumnos.includes(a.enrollment_id)}
                        onChange={e => setSelectedAlumnos(prev => e.target.checked ? [...prev, a.enrollment_id] : prev.filter(id => id !== a.enrollment_id))} />
                      {a.apellido}, {a.nombre} — <span style={{ color: a.porcentaje < 70 ? t.red : t.amber, fontWeight: 600 }}>{a.porcentaje}% asistencia ({a.ausentes} ausencias)</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Notificaciones imprimibles */}
          {dataLoaded && reportData.filter(a => selectedAlumnos.includes(a.enrollment_id)).map(a => (
            <div key={a.enrollment_id} className="notif-card" style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 28, marginBottom: 24, background: t.cardBg }}>
              <div style={{ textAlign: 'center', borderBottom: `2px solid ${t.border}`, paddingBottom: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{schoolInfo.nombre || 'Jardín de Infantes'}</div>
                {schoolInfo.cue && <div style={{ fontSize: 12, color: t.textMuted }}>CUE: {schoolInfo.cue}</div>}
              </div>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>NOTIFICACIÓN DE INASISTENCIAS</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>{mesNombre} {anioActual}</div>
              </div>
              <p style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>
                Por medio de la presente, se notifica a los padres / tutores del/la alumno/a <strong>{a.apellido}, {a.nombre}</strong>, de la {selectedGrade?.nombre} — División {selectedDiv?.nombre}, que durante el mes de <strong>{mesNombre}</strong> presentó <strong>{a.ausentes} inasistencia{a.ausentes !== 1 ? 's' : ''}</strong>{a.tardanzas > 0 ? ` y ${a.tardanzas} tardanza${a.tardanzas !== 1 ? 's' : ''}` : ''}, acumulando un porcentaje de asistencia del <strong style={{ color: a.porcentaje < 70 ? '#ef4444' : '#f59e0b' }}>{a.porcentaje}%</strong>.
              </p>
              {a.porcentaje < 70 ? (
                <p style={{ fontSize: 12, color: '#ef4444', background: '#fff5f5', padding: '10px 14px', borderRadius: 8, border: '1px solid #ef444430', marginBottom: 16 }}>
                  ⚠ La asistencia es inferior al 70%. Se solicita encarecidamente regularizar la situación y comunicarse con la institución.
                </p>
              ) : (
                <p style={{ fontSize: 12, color: '#f59e0b', background: '#fffbf0', padding: '10px 14px', borderRadius: 8, border: '1px solid #f59e0b30', marginBottom: 16 }}>
                  ⚠ La asistencia es inferior al 85% recomendado. Se solicita mejorar la regularidad escolar.
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 24, textAlign: 'center' }}>
                {[['Presentes', a.presentes, '#22c55e'], ['Ausentes', a.ausentes, '#ef4444'], ['Tardanzas', a.tardanzas, '#f59e0b'], ['Justificados', a.justificados, '#3b82f6']].map(([l, v, c]) => (
                  <div key={String(l)} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '10px 8px' }}>
                    <div style={{ fontSize: 10, color: '#777', marginBottom: 4 }}>{l}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: String(c) }}>{String(v)}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 32 }}>
                <div>
                  <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 11, color: t.textMuted }}>Firma y aclaración (Directora)</div>
                </div>
                <div>
                  <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 11, color: t.textMuted }}>Firma y aclaración (Padre/Madre/Tutor)</div>
                  <div style={{ marginTop: 16, borderTop: '1px solid #999', paddingTop: 8, fontSize: 11, color: t.textMuted }}>Fecha de recepción: ___/___/______</div>
                </div>
              </div>
            </div>
          ))}
          {dataLoaded && selectedAlumnos.length === 0 && reportData.filter(a => a.porcentaje < 85).length === 0 && (
            <p style={{ textAlign: 'center', color: t.textMuted, marginTop: 32 }}>✓ No hay alumnos con alertas este mes.</p>
          )}
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // 4. ESTADÍSTICA ANUAL
  // ────────────────────────────────────────────────────────────
  if (reportType === 'estadistica-anual') {
    return (
      <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
        <style>{`@media print{.no-print{display:none!important}.print-only{display:block!important}body{background:white!important;color:black!important}}.print-only{display:none}`}</style>
        <Header titulo="Estadística Anual" />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
          <div className="no-print">
            <FiltrosComunes conMes={false} />
          </div>
          {dataLoaded && (
            <>
              <PrintHeader subtitulo={`ESTADÍSTICA ANUAL DE ASISTENCIA — ${anioActual}`} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Matrícula', value: reportData.length },
                  { label: 'Promedio asistencia', value: `${reportData.length > 0 ? Math.round(reportData.reduce((s,a)=>s+a.porcentaje,0)/reportData.length) : 0}%` },
                  { label: 'Total ausencias', value: reportData.reduce((s,a)=>s+a.ausentes,0) },
                ].map(s => (
                  <div key={s.label} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '16px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 6px', fontSize: 11, color: t.textMuted, textTransform: 'uppercase', fontFamily: 'DM Mono' }}>{s.label}</p>
                    <p style={{ margin: 0, fontSize: 28, fontWeight: 600, color: t.textPrimary }}>{s.value}</p>
                  </div>
                ))}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8f8f8' }}>
                    <th style={{ border: '1px solid #ddd', padding: '8px 12px', textAlign: 'left', fontSize: 11 }}>Alumno</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11 }}>Total Pres.</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11 }}>Total Aus.</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11 }}>Total Tard.</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11 }}>Total Just.</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11 }}>% Anual</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((a, i) => (
                    <tr key={a.enrollment_id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ border: '1px solid #eee', padding: '7px 12px' }}>{a.apellido}, {a.nombre}</td>
                      <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', color: '#22c55e', fontWeight: 600 }}>{a.presentes}</td>
                      <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', color: '#ef4444', fontWeight: 600 }}>{a.ausentes}</td>
                      <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', color: '#f59e0b', fontWeight: 600 }}>{a.tardanzas}</td>
                      <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', color: '#3b82f6', fontWeight: 600 }}>{a.justificados}</td>
                      <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', fontWeight: 700, color: a.porcentaje >= 85 ? '#22c55e' : a.porcentaje >= 70 ? '#f59e0b' : '#ef4444' }}>{a.porcentaje}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportData.length === 0 && <p style={{ textAlign: 'center', color: t.textMuted, marginTop: 32 }}>No hay datos anuales registrados aún.</p>}
              <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 12, color: t.textMuted }}>Firma Maestra</div>
                <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 12, color: t.textMuted }}>Firma Directora</div>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // 5. EVOLUCIÓN MENSUAL (comparativa)
  // ────────────────────────────────────────────────────────────
  if (reportType === 'evolucion-mensual') {
    const mesesConDatos = reportData.length > 0
      ? Array.from(new Set(reportData.flatMap(a => a.dias.filter(d => d.estado).map(d => d.fecha.slice(0,7))))).sort()
      : []
    return (
      <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
        <style>{`@media print{.no-print{display:none!important}.print-only{display:block!important}body{background:white!important;color:black!important}}.print-only{display:none}`}</style>
        <Header titulo="Evolución Mensual" />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
          <div className="no-print">
            <FiltrosComunes conMes={false} />
          </div>
          {dataLoaded && (
            <>
              <PrintHeader subtitulo={`EVOLUCIÓN MENSUAL DE ASISTENCIA — ${anioActual}`} />
              {mesesConDatos.length === 0 ? (
                <p style={{ textAlign: 'center', color: t.textMuted, marginTop: 32 }}>No hay suficientes datos para mostrar evolución.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8f8f8' }}>
                      <th style={{ border: '1px solid #ddd', padding: '8px 12px', textAlign: 'left', fontSize: 11 }}>Alumno</th>
                      {mesesConDatos.map(ym => {
                        const [, m] = ym.split('-')
                        return <th key={ym} style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11 }}>{MESES[parseInt(m)].slice(0,3)}</th>
                      })}
                      <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontSize: 11 }}>Promedio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((a, i) => {
                      const porMes = mesesConDatos.map(ym => {
                        const diasMes = a.dias.filter(d => d.fecha.startsWith(ym) && d.estado !== null)
                        const pres = diasMes.filter(d => d.estado === 'presente' || d.estado === 'tardanza').length
                        return diasMes.length > 0 ? Math.round((pres / diasMes.length) * 100) : null
                      })
                      return (
                        <tr key={a.enrollment_id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ border: '1px solid #eee', padding: '7px 12px' }}>{a.apellido}, {a.nombre}</td>
                          {porMes.map((p, mi) => (
                            <td key={mi} style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', fontWeight: 600, color: p === null ? '#ddd' : p >= 85 ? '#22c55e' : p >= 70 ? '#f59e0b' : '#ef4444' }}>
                              {p !== null ? `${p}%` : '—'}
                            </td>
                          ))}
                          <td style={{ border: '1px solid #eee', padding: '7px', textAlign: 'center', fontWeight: 700, color: a.porcentaje >= 85 ? '#22c55e' : a.porcentaje >= 70 ? '#f59e0b' : '#ef4444' }}>{a.porcentaje}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // 6. BOLETÍN DE ASISTENCIA (individual por alumno)
  // ────────────────────────────────────────────────────────────
  if (reportType === 'boletin') {
    return (
      <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
        <style>{`
          @media print{
            .no-print{display:none!important}
            .print-only{display:block!important}
            body{background:white!important;color:black!important}
            .boletin-card{page-break-after:always;border:1px solid #000!important}
          }
          .print-only{display:none}
        `}</style>
        <Header titulo="Boletín de Asistencia" />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
          <div className="no-print">
            <FiltrosComunes />
            {dataLoaded && (
              <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: t.textMuted }}>Seleccioná los alumnos:</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setSelectedAlumnos(reportData.map(a => a.enrollment_id))} style={{ ...btnS, fontSize: 11 }}>Seleccionar todos</button>
                  <button onClick={() => setSelectedAlumnos([])} style={{ ...btnS, fontSize: 11 }}>Limpiar</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {reportData.map(a => (
                    <label key={a.enrollment_id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={selectedAlumnos.includes(a.enrollment_id)}
                        onChange={e => setSelectedAlumnos(prev => e.target.checked ? [...prev, a.enrollment_id] : prev.filter(id => id !== a.enrollment_id))} />
                      {a.apellido}, {a.nombre} — {a.porcentaje}% asistencia
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          {dataLoaded && reportData.filter(a => selectedAlumnos.includes(a.enrollment_id)).map(a => (
            <div key={a.enrollment_id} className="boletin-card" style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 28, marginBottom: 24, background: t.cardBg }}>
              <div style={{ textAlign: 'center', borderBottom: `2px solid ${t.border}`, paddingBottom: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{schoolInfo.nombre || 'Jardín de Infantes'}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>BOLETÍN DE ASISTENCIA</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>{mesNombre} {anioActual}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>Alumno/a</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.apellido}, {a.nombre}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>Sala / División</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedGrade?.nombre} — Div. {selectedDiv?.nombre}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
                {[['Presentes', a.presentes,'#22c55e'],['Ausentes',a.ausentes,'#ef4444'],['Tardanzas',a.tardanzas,'#f59e0b'],['Justificados',a.justificados,'#3b82f6']].map(([l,v,c]) => (
                  <div key={String(l)} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '12px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#777', marginBottom: 4 }}>{l}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: String(c) }}>{String(v)}</div>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', padding: '14px', borderRadius: 10, background: a.porcentaje >= 85 ? '#f0fdf4' : a.porcentaje >= 70 ? '#fffbf0' : '#fff5f5', border: `1px solid ${a.porcentaje >= 85 ? '#22c55e' : a.porcentaje >= 70 ? '#f59e0b' : '#ef4444'}30`, marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#777', marginBottom: 4 }}>Porcentaje de asistencia</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: a.porcentaje >= 85 ? '#22c55e' : a.porcentaje >= 70 ? '#f59e0b' : '#ef4444' }}>{a.porcentaje}%</div>
                <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                  {a.porcentaje >= 85 ? '✓ Asistencia regular' : a.porcentaje >= 70 ? '⚠ Asistencia irregular' : '⚠ Asistencia crítica'}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 32 }}>
                <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 11, color: t.textMuted }}>Firma Directora</div>
                <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 11, color: t.textMuted }}>Firma Padre/Madre/Tutor</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // MENÚ PRINCIPAL
  // ────────────────────────────────────────────────────────────
  const reportCards = [
    { type: 'planilla-mensual' as ReportType,  icon: '📋', titulo: 'Planilla Mensual', desc: 'Grilla oficial con todos los días hábiles del mes, estados por alumno y totales. Apta para presentar a inspección.', complejidad: 'Oficial DGCyE' },
    { type: 'resumen-mensual' as ReportType,   icon: '📊', titulo: 'Resumen de Inasistencias', desc: 'Tabla mensual con totales por alumno, porcentaje de asistencia y alertas de críticos.', complejidad: 'Gestión interna' },
    { type: 'notificacion' as ReportType,      icon: '📨', titulo: 'Notificación a Familias', desc: 'Carta formal para entregar a los padres de alumnos con inasistencias. Con firma y acuse de recibo.', complejidad: 'Para familias' },
    { type: 'estadistica-anual' as ReportType, icon: '📈', titulo: 'Estadística Anual', desc: 'Totales acumulados del ciclo lectivo completo por alumno. Para cierre de año y presentación a supervisión.', complejidad: 'Cierre anual' },
    { type: 'evolucion-mensual' as ReportType, icon: '📉', titulo: 'Evolución Mensual', desc: 'Comparativa mes a mes del porcentaje de asistencia de cada alumno durante el año.', complejidad: 'Seguimiento' },
    { type: 'boletin' as ReportType,           icon: '📄', titulo: 'Boletín de Asistencia', desc: 'Informe individual por alumno para entregar a la familia. Incluye porcentaje y totales del período.', complejidad: 'Para familias' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: t.headerBg, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.green, boxShadow: `0 0 8px ${t.green}` }} />
          <span style={{ fontSize: 20, fontWeight: 600, color: t.textPrimary, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Informes</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleTheme} style={{ fontSize: 14, background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>{isDark ? '☀️' : '🌙'}</button>
          <button onClick={onBack} style={btnS}>← Volver</button>
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <p style={{ fontSize: 12, color: t.textMuted, margin: '0 0 24px', fontFamily: 'DM Mono' }}>Seleccioná el tipo de informe que querés generar</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {reportCards.map(r => (
            <button key={r.type} onClick={() => { setReportType(r.type); setDataLoaded(false); setSelectedAlumnos([]) }}
              style={{ padding: '20px', borderRadius: 14, border: `1px solid ${t.border}`, background: t.cardBg, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = t.green)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = t.border)}
            >
              <div style={{ fontSize: 28, marginBottom: 10 }}>{r.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary, marginBottom: 6 }}>{r.titulo}</div>
              <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginBottom: 10 }}>{r.desc}</div>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: t.greenBg, color: t.green, fontFamily: 'DM Mono' }}>{r.complejidad}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
