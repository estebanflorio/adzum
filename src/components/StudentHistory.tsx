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
  activo: boolean
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

type ConfirmAction = 'baja' | 'eliminar' | null

const ESTADO_CONFIG = {
  presente:    { label: 'P', color: '#22c55e', bg: '#052e16' },
  ausente:     { label: 'A', color: '#ef4444', bg: '#2d0a0a' },
  tardanza:    { label: 'T', color: '#f59e0b', bg: '#2d1a00' },
  justificado: { label: 'J', color: '#3b82f6', bg: '#0c1a2e' },
}

export default function StudentHistory({ onBack }: Props) {
  const { theme: t, isDark, toggleTheme } = useTheme()

  // Lista
  const [students, setStudents]         = useState<Student[]>([])
  const [filtered, setFiltered]         = useState<Student[]>([])
  const [search, setSearch]             = useState('')
  const [salas, setSalas]               = useState<string[]>([])
  const [salaFilter, setSalaFilter]     = useState<string>('todas')
  const [showInactivos, setShowInactivos] = useState(false)
  const [loadingList, setLoadingList]   = useState(true)

  // Detalle
  const [selected, setSelected]         = useState<Student | null>(null)
  const [records, setRecords]           = useState<AttendanceRecord[]>([])
  const [stats, setStats]               = useState<StudentStats | null>(null)
  const [monthFilter, setMonthFilter]   = useState<string>('todos')
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Confirmación
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMsg, setActionMsg]         = useState<string | null>(null)

  // ── Cargar lista ──
  async function loadList() {
    setLoadingList(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('school_id').eq('id', user.id).single()
    if (!profile) return
    const { data: sy } = await supabase.from('school_years').select('id').eq('school_id', profile.school_id).eq('activo', true).single()
    if (!sy) { setLoadingList(false); return }

    const query = supabase
      .from('enrollments')
      .select('id, activo, students ( id, nombre, apellido, dni ), divisions ( nombre, grades ( nombre ) )')
      .eq('school_year_id', sy.id)
      .order('students(apellido)', { ascending: true })

    const { data } = await query
    if (!data) { setLoadingList(false); return }

    const list: Student[] = data.map((e: any) => ({
      enrollment_id: e.id,
      student_id:    e.students.id,
      nombre:        e.students.nombre,
      apellido:      e.students.apellido,
      dni:           e.students.dni,
      sala:          e.divisions.grades.nombre,
      division:      e.divisions.nombre,
      activo:        e.activo,
    }))
    list.sort((a, b) => a.apellido.localeCompare(b.apellido))
    setStudents(list)
    setSalas([...new Set(list.map(s => s.sala))].sort())
    setLoadingList(false)
  }

  useEffect(() => { loadList() }, [])

  // ── Filtros ──
  useEffect(() => {
    let result = students.filter(s => showInactivos ? true : s.activo)
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
  }, [search, salaFilter, students, showInactivos])

  // ── Cargar detalle ──
  async function loadDetail(student: Student) {
    setSelected(student)
    setLoadingDetail(true)
    setMonthFilter('todos')
    setConfirmAction(null)
    setActionMsg(null)

    const { data } = await supabase
      .from('attendance')
      .select('fecha, estado')
      .eq('enrollment_id', student.enrollment_id)
      .order('fecha', { ascending: false })

    const recs: AttendanceRecord[] = (data ?? []).map((r: any) => ({ fecha: r.fecha, estado: r.estado }))
    setRecords(recs)

    const total = recs.length
    const presentes    = recs.filter(r => r.estado === 'presente').length
    const ausentes     = recs.filter(r => r.estado === 'ausente').length
    const tardanzas    = recs.filter(r => r.estado === 'tardanza').length
    const justificados = recs.filter(r => r.estado === 'justificado').length
    const porcentaje   = total > 0 ? Math.round(((presentes + tardanzas) / total) * 100) : 0
    setStats({ total_dias: total, presentes, ausentes, tardanzas, justificados, porcentaje_asistencia: porcentaje })
    setLoadingDetail(false)
  }

  // ── Dar de baja (enrollment activo = false) ──
  async function handleBaja() {
    if (!selected) return
    setActionLoading(true)
    const { error } = await supabase
      .from('enrollments')
      .update({ activo: false })
      .eq('id', selected.enrollment_id)
    if (error) {
      setActionMsg('Error al dar de baja: ' + error.message)
    } else {
      setActionMsg(null)
      setConfirmAction(null)
      await loadList()
      setSelected(null)
    }
    setActionLoading(false)
  }

  // ── Eliminar definitivamente ──
  async function handleEliminar() {
    if (!selected) return
    setActionLoading(true)
    // 1. Borrar asistencias
    await supabase.from('attendance').delete().eq('enrollment_id', selected.enrollment_id)
    // 2. Borrar inscripción
    await supabase.from('enrollments').delete().eq('id', selected.enrollment_id)
    // 3. Borrar alumno (si no tiene otras inscripciones)
    const { data: otrasInscripciones } = await supabase
      .from('enrollments')
      .select('id')
      .eq('student_id', selected.student_id)
    if (!otrasInscripciones || otrasInscripciones.length === 0) {
      await supabase.from('students').delete().eq('id', selected.student_id)
    }
    setConfirmAction(null)
    setActionMsg(null)
    await loadList()
    setSelected(null)
    setActionLoading(false)
  }

  // ── Reactivar ──
  async function handleReactivar() {
    if (!selected) return
    setActionLoading(true)
    const { error } = await supabase
      .from('enrollments')
      .update({ activo: true })
      .eq('id', selected.enrollment_id)
    if (!error) {
      await loadList()
      setSelected(null)
    }
    setActionLoading(false)
  }

  const recordsFiltered = monthFilter === 'todos' ? records : records.filter(r => r.fecha.startsWith(monthFilter))
  const meses = [...new Set(records.map(r => r.fecha.slice(0, 7)))].sort().reverse()

  const formatFecha = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })
  const formatMes = (ym: string) => {
    const [y, m] = ym.split('-')
    const nombres = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    return `${nombres[parseInt(m)]} ${y}`
  }

  const inp: React.CSSProperties = {
    padding: '9px 12px', fontSize: 13, borderRadius: 8,
    border: `1px solid ${t.inputBorder}`, background: t.inputBg,
    color: t.textPrimary, outline: 'none', fontFamily: 'DM Sans', boxSizing: 'border-box' as const,
  }
  const btnS: React.CSSProperties = { padding: '7px 14px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans' }

  // ── Modal de confirmación ──
  const Modal = () => {
    if (!confirmAction || !selected) return null
    const esBaja = confirmAction === 'baja'
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: t.cardBg, border: `1px solid ${esBaja ? t.amber : t.red}40`, borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>{esBaja ? '⚠️' : '🗑️'}</div>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: t.textPrimary }}>
            {esBaja ? 'Dar de baja' : 'Eliminar definitivamente'}
          </h3>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: t.textSecondary }}>
            <strong>{selected.apellido}, {selected.nombre}</strong>
          </p>
          <p style={{ margin: '0 0 20px', fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>
            {esBaja
              ? 'El alumno dejará de aparecer en las listas y asistencia, pero su historial quedará guardado. Podés reactivarlo en cualquier momento.'
              : 'Se borrarán permanentemente el alumno, su inscripción y todos sus registros de asistencia. Esta acción no se puede deshacer.'}
          </p>
          {actionMsg && <p style={{ fontSize: 12, color: t.red, marginBottom: 12 }}>{actionMsg}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmAction(null)} style={btnS} disabled={actionLoading}>Cancelar</button>
            <button
              onClick={esBaja ? handleBaja : handleEliminar}
              disabled={actionLoading}
              style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: esBaja ? t.amber : t.red, color: '#fff', fontSize: 12, fontWeight: 500, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1, fontFamily: 'DM Sans' }}>
              {actionLoading ? 'Procesando...' : esBaja ? 'Dar de baja' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────
  //  VISTA DETALLE
  // ─────────────────────────────
  if (selected) return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <Modal />

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: t.headerBg, zIndex: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{selected.apellido}, {selected.nombre}</p>
            {!selected.activo && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: t.amberBg, color: t.amber, border: `1px solid ${t.amber}40`, fontFamily: 'DM Mono' }}>BAJA</span>}
          </div>
          <p style={{ margin: 0, fontSize: 11, color: t.textMuted, fontFamily: 'DM Mono' }}>Sala {selected.sala} · Div. {selected.division}{selected.dni ? ` · DNI ${selected.dni}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={toggleTheme} style={{ fontSize: 14, background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>{isDark ? '☀️' : '🌙'}</button>
          {selected.activo ? (
            <>
              <button onClick={() => setConfirmAction('baja')} style={{ ...btnS, color: t.amber, borderColor: t.amber + '60' }}>⚠ Dar de baja</button>
              <button onClick={() => setConfirmAction('eliminar')} style={{ ...btnS, color: t.red, borderColor: t.red + '60' }}>🗑 Eliminar</button>
            </>
          ) : (
            <button onClick={handleReactivar} disabled={actionLoading} style={{ ...btnS, color: t.green, borderColor: t.green + '60' }}>↩ Reactivar</button>
          )}
          <button onClick={() => setSelected(null)} style={btnS}>← Lista</button>
          <button onClick={onBack} style={btnS}>Panel</button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px' }}>
        {loadingDetail ? (
          <p style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>Cargando historial...</p>
        ) : (
          <>
            {!selected.activo && (
              <div style={{ background: t.amberBg, border: `1px solid ${t.amber}40`, borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: t.amber }}>
                Este alumno está dado de baja. Su historial se conserva pero no aparece en las listas activas.
              </div>
            )}

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

            {/* Barra */}
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

            {/* Filtro mes */}
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
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: t.headerBg, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.green, boxShadow: `0 0 8px ${t.green}` }} />
          <span style={{ fontSize: 20, color: t.textMuted, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600 }}>Historial de alumnos</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleTheme} style={{ fontSize: 14, background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>{isDark ? '☀️' : '🌙'}</button>
          <button onClick={onBack} style={btnS}>← Volver</button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px' }}>

        {/* Búsqueda y filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, apellido o DNI..."
            style={{ ...inp, flex: '1 1 200px' }} />
          <select value={salaFilter} onChange={e => setSalaFilter(e.target.value)} style={{ ...inp, minWidth: 130 }}>
            <option value="todas">Todas las salas</option>
            {salas.map(s => <option key={s} value={s}>Sala {s}</option>)}
          </select>
        </div>

        {/* Toggle inactivos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button onClick={() => setShowInactivos(v => !v)}
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${showInactivos ? t.amber : t.border}`, background: showInactivos ? t.amberBg : 'transparent', color: showInactivos ? t.amber : t.textMuted }}>
            {showInactivos ? '✓ Mostrando dados de baja' : 'Mostrar dados de baja'}
          </button>
          <span style={{ fontSize: 11, color: t.textMuted, fontFamily: 'DM Mono' }}>{filtered.length} alumno{filtered.length !== 1 ? 's' : ''}</span>
        </div>

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
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, background: t.cardBg, border: `1px solid ${s.activo ? t.border : t.amber + '40'}`, cursor: 'pointer', textAlign: 'left', opacity: s.activo ? 1 : 0.65 }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = s.activo ? t.green : t.amber)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = s.activo ? t.border : t.amber + '40')}
              >
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: s.activo ? t.greenBg : t.amberBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: s.activo ? t.green : t.amber, flexShrink: 0 }}>
                  {s.apellido[0]}{s.nombre[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ margin: 0, fontSize: 13, color: t.textPrimary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.apellido}, {s.nombre}</p>
                    {!s.activo && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: t.amberBg, color: t.amber, flexShrink: 0 }}>BAJA</span>}
                  </div>
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
