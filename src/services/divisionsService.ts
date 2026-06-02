import { supabase } from '../lib/supabase'
import type { Grade, Division, SchoolYear } from '../lib/supabase'

// ─── Ciclo lectivo activo de la escuela ────────────────────────

export async function getActiveSchoolYear(schoolId: string): Promise<SchoolYear | null> {
  const { data, error } = await supabase
    .from('school_years')
    .select('*')
    .eq('school_id', schoolId)
    .eq('activo', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null  // no hay ciclo activo
    throw error
  }
  return data
}

// ─── Grados de una escuela ordenados ──────────────────────────

export async function getGrades(schoolId: string): Promise<Grade[]> {
  const { data, error } = await supabase
    .from('grades')
    .select('*')
    .eq('school_id', schoolId)
    .order('orden')

  if (error) throw error
  return data ?? []
}

// ─── Divisiones de un grado para el ciclo activo ──────────────

export async function getDivisions(
  gradeId: string,
  schoolYearId: string
): Promise<Division[]> {
  const { data, error } = await supabase
    .from('divisions')
    .select('*')
    .eq('grade_id', gradeId)
    .eq('school_year_id', schoolYearId)
    .order('nombre')

  if (error) throw error
  return data ?? []
}

// ─── Todas las divisiones del ciclo (para dashboard) ──────────

export async function getAllDivisionsForYear(
  schoolYearId: string
): Promise<(Division & { grade: Grade })[]> {
  const { data, error } = await supabase
    .from('divisions')
    .select(`
      *,
      grade:grades (*)
    `)
    .eq('school_year_id', schoolYearId)
    .order('grades(orden)', { ascending: true })

  if (error) throw error
  return data ?? []
}
