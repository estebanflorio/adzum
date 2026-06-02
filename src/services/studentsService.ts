import { supabase } from '../lib/supabase'
import type { Student, Enrollment } from '../lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────

export interface CreateStudentPayload {
  nombre: string
  apellido: string
  dni?: string
  fecha_nacimiento?: string
  legajo_nro?: string
}

export interface EnrollStudentPayload {
  student_id: string
  division_id: string
  school_year_id: string
}

export interface StudentWithEnrollment extends Student {
  enrollment?: Enrollment
}

// ─── Obtener todos los alumnos de una escuela ─────────────────

export async function getStudents(schoolId: string): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('school_id', schoolId)
    .order('apellido')

  if (error) throw error
  return data ?? []
}

// ─── Obtener alumnos con su inscripción activa ────────────────

export async function getStudentsWithEnrollment(
  schoolId: string,
  schoolYearId: string
): Promise<StudentWithEnrollment[]> {
  const { data, error } = await supabase
    .from('students')
    .select(`
      *,
      enrollment:enrollments (
        id, division_id, school_year_id, estado
      )
    `)
    .eq('school_id', schoolId)
    .eq('enrollments.school_year_id', schoolYearId)
    .order('apellido')

  if (error) throw error
  return data ?? []
}

// ─── Crear alumno ─────────────────────────────────────────────

export async function createStudent(
  schoolId: string,
  payload: CreateStudentPayload
): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .insert({
      school_id: schoolId,
      ...payload,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ─── Actualizar alumno ────────────────────────────────────────

export async function updateStudent(
  studentId: string,
  payload: Partial<CreateStudentPayload>
): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .update(payload)
    .eq('id', studentId)
    .select()
    .single()

  if (error) throw error
  return data
}

// ─── Eliminar alumno (solo si no tiene historial) ─────────────

export async function deleteStudent(studentId: string): Promise<void> {
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', studentId)

  if (error) throw error
}

// ─── Inscribir alumno a una división ─────────────────────────

export async function enrollStudent(
  payload: EnrollStudentPayload
): Promise<Enrollment> {
  const { data, error } = await supabase
    .from('enrollments')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}

// ─── Cambiar estado de inscripción ────────────────────────────
// Útil para marcar egresado, transferido, repitente

export async function updateEnrollmentStatus(
  enrollmentId: string,
  estado: 'activo' | 'egresado' | 'transferido' | 'repitente'
): Promise<void> {
  const { error } = await supabase
    .from('enrollments')
    .update({ estado })
    .eq('id', enrollmentId)

  if (error) throw error
}

// ─── Transferir alumno a otra división ───────────────────────

export async function transferStudent(
  currentEnrollmentId: string,
  newDivisionId: string,
  schoolYearId: string,
  studentId: string
): Promise<void> {
  // Marcar inscripción actual como transferido
  await updateEnrollmentStatus(currentEnrollmentId, 'transferido')

  // Crear nueva inscripción
  const { error } = await supabase
    .from('enrollments')
    .insert({
      student_id: studentId,
      division_id: newDivisionId,
      school_year_id: schoolYearId,
      estado: 'activo',
    })

  if (error) throw error
}

// ─── Buscar alumnos por nombre o DNI ─────────────────────────

export async function searchStudents(
  schoolId: string,
  query: string
): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('school_id', schoolId)
    .or(`apellido.ilike.%${query}%,nombre.ilike.%${query}%,dni.ilike.%${query}%`)
    .order('apellido')
    .limit(20)

  if (error) throw error
  return data ?? []
}
