import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

interface Props { onBack: () => void }

interface Student {
  enrollment_id: string
  student_id: string
  nombre: string
  apellido: string
  dni: string | null
  sala: string
  division: string
}

interface AttendanceRecord {
  fecha: string
  estado: 'presente' | 'ausente' | 'tardanza' | 'justificado'
}

interface StudentStats {
  total_dias: number
  presentes: number
  ausentes: number
  tardanzas: number
  justificados: number
  porcentaje_asistencia: number
}

const ESTADO_CONFIG = {
  presente:    { label: 'P', color: '#22c55e', bg: '#052e16' },
  ausente:     { label: 'A', color: '#ef4444', bg: '#2d0a0a' },
  tardanza:    { label: 'T', color: '#f59e0b', bg: '#2d1a00' },
  justificado: { label: 'J', color: '#3b82f6', bg: '#0c1a2e' },
}

export default function StudentHistory({ onBack }: Props) {
  const { theme: t, isDark, toggleTheme } = useTheme()

  // Lista
  const [students, setStudents]     = useState<Student[]>([])
  const [filtered, setFiltered]     = useState<Student[]>([])
  const [search, setSearch]         = useState('')
  const [salas, setSalas]           = useState<string[]>([])
  const [salaFilter, setSalaFilter] = useState<string>('todas')
  const [loadingList, setLoadingList] = useState(true)

  // Detalle
  const [selected, setSelected]     = useState<Student | null>(null)
  const [records, setRecords]       = useState<AttendanceRecord[]>([])
  const [stats, setStats]           = useState<StudentStats | null>(null)
  const [monthFilter, setMonthFilter] = useState<string>('todos')
  const [loadingDetail, setLoadingDetail] = useState(false)

  // ── Cargar lista de alumnos ──
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('school_id').eq('id', user.id).single()
      if (!profile) return

      // Ciclo lectivo activo
      const { data: sy } = await supabase.from('school_years').select('id').eq('school_id', profile.school_id).eq('activo', true).single()
      if (!sy) { setLoadingList(false); return }

      // Alumnos inscriptos con sala
      const { data } = await supabase
        .from('enrollments')
        .select(`
          id,
          students ( id, nombre, apellido, dni ),
          divisions ( nombre, grades ( nombre ) )
        `)
        .eq('school_year_id', sy.id)
        .eq('activo', true)
        .order('students(apellido)', { ascending: true })

      if (!data) { setLoadingList(false); return }

      const list: Student[] = data.map((e: any) => ({
        enrollment_id: e.id,
        student_id:    e.students.id,
        nombre:        e.students.nombre,
        apellido:      e.students.apellido,
        dni:           e.students.dni,
        sala:          e.divisions.grades.nombre,
        division:      e.divisions.nombre,
      }))

      list.sort((a, b) => a.apellido.localeCompare(b.apellido))
      setStudents(list)
      setFiltered(list)

      const salasUnicas = [...new Set(list.map(s => s.sala))].sort()
      setSalas(salasUnicas)
      setLoadingList(false)
    }
    load()
  }, [])

  // ── Filtros de lista ──
  useEffect(() => {
    let result = students
    if (salaFilter !== 'todas') result = result.filter(s => s.sala === salaFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(s =>
        s.nombre.toLowerCase().includes(q) ||
        s.apellido.toLowerCase().includes(q) ||
        (s.dni ?? '').includes(q)
      )
    }
    setFiltered(result)
  }, [search, salaFilter, students])

  // ── Cargar detalle de alumno ──
  async function loadDetail(student: Student) {
    setSelected(student)
    setLoadingDetail(true)
    setMonthFilter('todos')

    const { data } = await supabase
      .from('attendance')
      .select('fecha, estado')
      .eq('enrollment_id', student.enrollment_id)
      .order('fecha', { ascending: false })

    const recs: AttendanceRecord[] = (data ?? []).map((r: any) => ({
      fecha: r.fecha,
      estado: r.estado,
    }))
    setRecords(recs)

    // Calcular stats
    const total = recs.length
    const presentes    = recs.filter(r => r.estado === 'presente').length
    const ausentes     = recs.filter(r => r.estado === 'ausente').length
    const tardanzas    = recs.filter(r => r.estado === 'tardanza').length
    const justificados = recs.filter(r => r.estado === 'justificado').length
    const porcentaje   = total > 0 ? Math.round(((presentes + tardanzas) / total) * 100) : 0

    setStats({ total_dias: total, presentes, ausentes, tardanzas, justificados, porcentaje_asistencia: porcentaje })
    setLoadingDetail(false)
  }

  // ── Registros filtrados por mes ──
  const recordsFiltered = monthFilter === 'todos'
    ? records
    : records.filter(r => r.fecha.startsWith(monthFilter))

  const meses = [...new Set(records.map(r => r.fecha.slice(0, 7)))].sort().reverse()

  const formatFecha = (f: string) => {
    const d = new Date(f + 'T12:00:00')
    return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })
  }

  const formatMes = (ym: string) => {
    const [y, m] = ym.split('-')
    const nombres = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    return `${nombres[parseInt(m)]} ${y}`
  }

  const inp: React.CSSProperties = {
    padding: '9px 12px', fontSize: 13, borderRadius: 8,
    border: `1px solid ${t.inputBorder}`, background: t.inputBg,
    color: t.textPrimary, outline: 'none', fontFamily: 'DM Sans',
    boxSizing: 'border-box' as const,
  }

  // ─────────────────────────────
  //  VISTA DETALLE
  // ─────────────────────────────
  if (selected) return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: t.headerBg, zIndex: 10 }}>
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{selected.apellido}, {selected.nombre}</p>
          <p style={{ margin: 0, fontSize: 11, color: t.textMuted, fontFamily: 'DM Mono' }}>Sala {selected.sala} · Div. {selected.division}{selected.dni ? ` · DNI ${selected.dni}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleTheme} style={{ fontSize: 14, background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>{isDark ? '☀️' : '🌙'}</button>
          <button onClick={() => setSelected(null)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 6, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}>← Lista</button>
          <button onClick={onBack} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 6, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}>Panel</button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px' }}>
        {loadingDetail ? (
          <p style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>Cargando historial...</p>
        ) : (
          <>
            {/* Stats */}
            {stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 20 }}>
                {[
                  { label: 'Días reg.', value: stats.total_dias, color: t.textPrimary },
                  { label: 'Presentes', value: stats.presentes, color: '#22c55e' },
                  { label: 'Ausentes', value: stats.ausentes, color: '#ef4444' },
                  { label: 'Tardanzas', value: stats.tardanzas, color: '#f59e0b' },
                  { label: 'Asistencia', value: `${stats.porcentaje_asistencia}%`, color: stats.porcentaje_asistencia >= 85 ? '#22c55e' : stats.porcentaje_asistencia >= 70 ? '#f59e0b' : '#ef4444' },
                ].map(s => (
                  <div key={s.label} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono' }}>{s.label}</p>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 500, color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Barra de porcentaje */}
            {stats && (
              <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: t.textMuted, fontFamily: 'DM Mono', textTransform: 'uppercase' }}>Porcentaje de asistencia</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: stats.porcentaje_asistencia >= 85 ? '#22c55e' : stats.porcentaje_asistencia >= 70 ? '#f59e0b' : '#ef4444' }}>{stats.porcentaje_asistencia}%</span>
                </div>
                <div style={{ height: 8, background: t.border, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${stats.porcentaje_asistencia}%`, background: stats.porcentaje_asistencia >= 85 ? '#22c55e' : stats.porcentaje_asistencia >= 70 ? '#f59e0b' : '#ef4444', borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
                {stats.porcentaje_asistencia < 85 && (
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: stats.porcentaje_asistencia < 70 ? '#ef4444' : '#f59e0b' }}>
                    {stats.porcentaje_asistencia < 70 ? '⚠ Asistencia crítica — menor al 70%' : '⚠ Asistencia por debajo del 85%'}
                  </p>
                )}
              </div>
            )}

            {/* Filtro por mes */}
            {meses.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {['todos', ...meses].map(m => (
                  <button key={m} onClick={() => setMonthFilter(m)}
                    style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: `1px solid ${monthFilter === m ? t.green : t.border}`, background: monthFilter === m ? t.greenBg : 'transparent', color: monthFilter === m ? t.green : t.textMuted }}>
                    {m === 'todos' ? 'Todos' : formatMes(m)}
                  </button>
                ))}
              </div>
            )}

            {/* Registros */}
            <p style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', fontFamily: 'DM Mono' }}>
              Registros {monthFilter !== 'todos' ? `— ${formatMes(monthFilter)}` : ''} ({recordsFiltered.length})
            </p>

            {recordsFiltered.length === 0 ? (
              <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, padding: 32, textAlign: 'center' }}>
                <p style={{ color: t.textMuted, fontSize: 13, margin: 0 }}>Sin registros para este período.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {recordsFiltered.map(r => {
                  const cfg = ESTADO_CONFIG[r.estado]
                  return (
                    <div key={r.fecha} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderRadius: 8, background: t.cardBg, border: `1px solid ${t.border}` }}>
                      <span style={{ fontSize: 12, color: t.textMuted, fontFamily: 'DM Mono', minWidth: 120, textTransform: 'capitalize' }}>{formatFecha(r.fecha)}</span>
                      <div style={{ flex: 1, height: 1, background: t.border }} />
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: cfg.bg, color: cfg.color, fontFamily: 'DM Mono', border: `1px solid ${cfg.color}30` }}>
                        {cfg.label} — {r.estado.charAt(0).toUpperCase() + r.estado.slice(1)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )

  // ─────────────────────────────
  //  VISTA LISTA
  // ─────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: t.headerBg, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.green, boxShadow: `0 0 8px ${t.green}` }} />
          <span style={{ fontSize: 20, color: t.textMuted, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, letterSpacing: '0.02em' }}>Historial de alumnos</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleTheme} style={{ fontSize: 14, background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>{isDark ? '☀️' : '🌙'}</button>
          <button onClick={onBack} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 6, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}>← Volver</button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px' }}>

        {/* Búsqueda y filtro */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, apellido o DNI..."
            style={{ ...inp, flex: '1 1 200px' }}
          />
          <select value={salaFilter} onChange={e => setSalaFilter(e.target.value)}
            style={{ ...inp, minWidth: 130 }}>
            <option value="todas">Todas las salas</option>
            {salas.map(s => <option key={s} value={s}>Sala {s}</option>)}
          </select>
        </div>

        <p style={{ fontSize: 11, color: t.textMuted, fontFamily: 'DM Mono', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {filtered.length} alumno{filtered.length !== 1 ? 's' : ''}
        </p>

        {loadingList ? (
          <p style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>Cargando alumnos...</p>
        ) : filtered.length === 0 ? (
          <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <p style={{ color: t.textMuted, fontSize: 13, margin: 0 }}>No se encontraron alumnos.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {filtered.map(s => (
              <button key={s.enrollment_id} onClick={() => loadDetail(s)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, background: t.cardBg, border: `1px solid ${t.border}`, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = t.green)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = t.border)}
              >
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: t.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: t.green, flexShrink: 0 }}>
                  {s.apellido[0]}{s.nombre[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, color: t.textPrimary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.apellido}, {s.nombre}</p>
                  {s.dni && <p style={{ margin: '2px 0 0', fontSize: 11, color: t.textMuted, fontFamily: 'DM Mono' }}>DNI {s.dni}</p>}
                </div>
                <span style={{ fontSize: 11, color: t.textMuted, fontFamily: 'DM Mono', flexShrink: 0 }}>Sala {s.sala} · {s.division}</span>
                <span style={{ color: t.textMuted, fontSize: 16, flexShrink: 0 }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
