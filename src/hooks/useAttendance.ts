import { useState, useEffect, useCallback } from 'react'
import {
  getStudentsWithAttendance,
  saveBulkAttendance,
  type StudentWithAttendance,
  type SaveAttendancePayload,
} from '../services/attendanceService'
import { supabase } from '../lib/supabase'
import type { AttendanceStatus } from '../lib/supabase'

interface UseAttendanceOptions {
  divisionId: string
  fecha: string        // formato 'YYYY-MM-DD'
}

interface AttendanceState {
  [enrollmentId: string]: AttendanceStatus
}

export function useAttendance({ divisionId, fecha }: UseAttendanceOptions) {
  const [students, setStudents]       = useState<StudentWithAttendance[]>([])
  const [attendance, setAttendance]   = useState<AttendanceState>({})
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [isDirty, setIsDirty]         = useState(false)
  const [lastSaved, setLastSaved]     = useState<Date | null>(null)

  // ─── Carga inicial ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!divisionId || !fecha) return
    setLoading(true)
    setError(null)
    try {
      const data = await getStudentsWithAttendance(divisionId, fecha)
      setStudents(data)

      // Inicializar mapa: si ya tiene registro se usa, si no → 'presente' por defecto
      const initialState: AttendanceState = {}
      data.forEach((s) => {
        initialState[s.enrollment_id] = s.attendance?.estado ?? 'presente'
      })
      setAttendance(initialState)
      setIsDirty(false)
    } catch (e: any) {
      setError(e.message ?? 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [divisionId, fecha])

  useEffect(() => { loadData() }, [loadData])

  // ─── Actualizar estado individual ───────────────────────────
  const setStudentAttendance = useCallback(
    (enrollmentId: string, estado: AttendanceStatus) => {
      setAttendance((prev) => ({ ...prev, [enrollmentId]: estado }))
      setIsDirty(true)
    },
    []
  )

  // ─── Guardar todo de una vez ────────────────────────────────
  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const payloads: SaveAttendancePayload[] = Object.entries(attendance).map(
        ([enrollment_id, estado]) => ({ enrollment_id, fecha, estado })
      )

      await saveBulkAttendance(payloads, user.id)
      setIsDirty(false)
      setLastSaved(new Date())
    } catch (e: any) {
      setError(e.message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }, [attendance, fecha])

  // ─── Estadísticas rápidas (calculadas en cliente) ──────────
  const stats = {
    total:       students.length,
    presente:    Object.values(attendance).filter((v) => v === 'presente').length,
    ausente:     Object.values(attendance).filter((v) => v === 'ausente').length,
    tardanza:    Object.values(attendance).filter((v) => v === 'tardanza').length,
    justificado: Object.values(attendance).filter((v) => v === 'justificado').length,
  }

  return {
    students,
    attendance,
    stats,
    loading,
    saving,
    error,
    isDirty,
    lastSaved,
    setStudentAttendance,
    save,
    reload: loadData,
  }
}
