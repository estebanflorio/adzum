import { supabase } from '../lib/supabase'
import type { Attendance, AttendanceStatus } from '../lib/supabase'

// ─── Tipos de respuesta ────────────────────────────────────────

export interface StudentWithAttendance {
  enrollment_id: string
  student_id: string
  nombre: string
  apellido: string
  dni: string | null
  legajo_nro: string | null
  attendance: Attendance | null
}

export interface SaveAttendancePayload {
  enrollment_id: string
  fecha: string
  estado: AttendanceStatus
  observacion?: string
}

// ─── Obtener alumnos de una división con su asistencia del día ─

export async function getStudentsWithAttendance(
  divisionId: string,
  fecha: string
): Promise<StudentWithAttendance[]> {
  const { data: enrollments, error: enrollErr } = await supabase
    .from('enrollments')
    .select(`
      id,
      student_id,
      students (
        id, nombre, apellido, dni, legajo_nro
      )
    `)
    .eq('division_id', divisionId)
    .eq('estado', 'activo')
    .order('students(apellido)')

  if (enrollErr) throw enrollErr
  if (!enrollments) return []

  const enrollmentIds = enrollments.map((e: any) => e.id)

  const { data: attendances, error: attErr } = await supabase
    .from('attendance')
    .select('*')
    .in('enrollment_id', enrollmentIds)
    .eq('fecha', fecha)

  if (attErr) throw attErr

  const attendanceMap = new Map<string, Attendance>()
  attendances?.forEach((a: Attendance) => {
    attendanceMap.set(a.enrollment_id, a)
  })

  return enrollments.map((e: any) => ({
    enrollment_id: e.id,
    student_id: e.student_id,
    nombre: e.students.nombre,
    apellido: e.students.apellido,
    dni: e.students.dni,
    legajo_nro: e.students.legajo_nro,
    attendance: attendanceMap.get(e.id) ?? null,
  }))
}

// ─── Guardar o actualizar asistencia (upsert) ──────────────────
// Si ya existe registro para ese enrollment+fecha, lo actualiza.
// Si no existe, lo crea. La constraint UNIQUE del schema lo garantiza.

export async function saveAttendance(
  payload: SaveAttendancePayload,
  registradoPor: string
): Promise<Attendance> {
  const { data, error } = await supabase
    .from('attendance')
    .upsert(
      {
        enrollment_id: payload.enrollment_id,
        fecha: payload.fecha,
        estado: payload.estado,
        observacion: payload.observacion ?? null,
        registrado_por: registradoPor,
      },
      { onConflict: 'enrollment_id,fecha' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

// ─── Guardar asistencia de toda una división de una vez ─────────

export async function saveBulkAttendance(
  payloads: SaveAttendancePayload[],
  registradoPor: string
): Promise<void> {
  const rows = payloads.map((p) => ({
    enrollment_id: p.enrollment_id,
    fecha: p.fecha,
    estado: p.estado,
    observacion: p.observacion ?? null,
    registrado_por: registradoPor,
  }))

  const { error } = await supabase
    .from('attendance')
    .upsert(rows, { onConflict: 'enrollment_id,fecha' })

  if (error) throw error
}

// ─── Historial mensual de un alumno ───────────────────────────

export async function getStudentAttendanceMonth(
  enrollmentId: string,
  year: number,
  month: number
): Promise<Attendance[]> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to   = `${year}-${String(month).padStart(2, '0')}-31`

  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .gte('fecha', from)
    .lte('fecha', to)
    .order('fecha')

  if (error) throw error
  return data ?? []
}

// ─── Resumen de asistencia por división (para dashboard) ───────

export async function getAttendanceSummary(
  divisionId: string,
  fecha: string
): Promise<{ presente: number; ausente: number; tardanza: number; justificado: number; total: number }> {
  const { data, error } = await supabase
    .from('attendance')
    .select('estado, enrollments!inner(division_id)')
    .eq('enrollments.division_id', divisionId)
    .eq('fecha', fecha)

  if (error) throw error

  const summary = { presente: 0, ausente: 0, tardanza: 0, justificado: 0, total: 0 }
  data?.forEach((row: any) => {
    summary[row.estado as keyof typeof summary]++
    summary.total++
  })

  return summary
}
