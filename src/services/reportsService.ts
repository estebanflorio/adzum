import { supabase } from '../lib/supabase'

export interface DailyDivisionReport {
  division_id: string
  grado: string
  division: string
  total: number
  presentes: number
  ausentes: number
  tardanzas: number
  justificados: number
  porcentaje_presentes: number
}

export interface AlertStudent {
  student_id: string
  enrollment_id: string
  nombre: string
  apellido: string
  grado: string
  division: string
  ausencias: number
  nivel: 'warning' | 'critical'
}

export async function getDailyReport(
  schoolYearId: string,
  fecha: string
): Promise<DailyDivisionReport[]> {
  const { data, error } = await supabase
    .from('v_daily_report')
    .select('*')
    .eq('school_year_id', schoolYearId)
    .eq('fecha', fecha)

  if (error) throw error

  const map = new Map<string, DailyDivisionReport>()

  data?.forEach((row: any) => {
    if (!map.has(row.division_id)) {
      map.set(row.division_id, {
        division_id: row.division_id,
        grado: row.grado,
        division: row.division,
        total: 0,
        presentes: 0,
        ausentes: 0,
        tardanzas: 0,
        justificados: 0,
        porcentaje_presentes: 0,
      })
    }
    const entry = map.get(row.division_id)!
    const qty = Number(row.cantidad)
    entry.total += qty
    if (row.estado === 'presente')    entry.presentes += qty
    if (row.estado === 'ausente')     entry.ausentes += qty
    if (row.estado === 'tardanza')    entry.tardanzas += qty
    if (row.estado === 'justificado') entry.justificados += qty
  })

  map.forEach(entry => {
    entry.porcentaje_presentes = entry.total > 0
      ? Math.round((entry.presentes / entry.total) * 100)
      : 0
  })

  return Array.from(map.values()).sort((a, b) =>
    a.grado.localeCompare(b.grado) || a.division.localeCompare(b.division)
  )
}

export async function getAbsenceAlerts(
  schoolYearId: string,
  warningThreshold = 5,
  criticalThreshold = 10
): Promise<AlertStudent[]> {
  const { data, error } = await supabase
    .from('v_absence_alerts')
    .select('*')
    .eq('school_year_id', schoolYearId)
    .gte('ausencias', warningThreshold)
    .order('ausencias', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row: any) => ({
    student_id:    row.student_id,
    enrollment_id: row.enrollment_id,
    nombre:        row.nombre,
    apellido:      row.apellido,
    grado:         row.grado,
    division:      row.division,
    ausencias:     Number(row.ausencias),
    nivel:         Number(row.ausencias) >= criticalThreshold ? 'critical' : 'warning',
  }))
}

export async function getSchoolStats(
  schoolYearId: string,
  fecha: string
): Promise<{
  total_alumnos: number
  con_asistencia_hoy: number
  presentes_hoy: number
  ausentes_hoy: number
  alertas_warning: number
  alertas_critical: number
}> {
  const [enrollRes, reportData, alertsData] = await Promise.all([
    supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('school_year_id', schoolYearId)
      .eq('estado', 'activo'),
    getDailyReport(schoolYearId, fecha),
    getAbsenceAlerts(schoolYearId),
  ])

  const presentes = reportData.reduce((acc, r) => acc + r.presentes, 0)
  const ausentes  = reportData.reduce((acc, r) => acc + r.ausentes, 0)
  const total_hoy = reportData.reduce((acc, r) => acc + r.total, 0)

  return {
    total_alumnos:      enrollRes.count ?? 0,
    con_asistencia_hoy: total_hoy,
    presentes_hoy:      presentes,
    ausentes_hoy:       ausentes,
    alertas_warning:    alertsData.filter(a => a.nivel === 'warning').length,
    alertas_critical:   alertsData.filter(a => a.nivel === 'critical').length,
  }
}

export async function getStudentMonthlyHistory(
  enrollmentId: string,
  year: number,
  month: number
): Promise<{ fecha: string; estado: string }[]> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('attendance')
    .select('fecha, estado')
    .eq('enrollment_id', enrollmentId)
    .gte('fecha', from)
    .lte('fecha', to)
    .order('fecha')

  if (error) throw error
  return data ?? []
}