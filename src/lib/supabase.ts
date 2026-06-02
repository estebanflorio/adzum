import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── Tipos base (espejo del schema SQL) ───────────────────────

export type AttendanceStatus = 'presente' | 'ausente' | 'tardanza' | 'justificado'
export type EnrollmentStatus = 'activo' | 'egresado' | 'transferido' | 'repitente'
export type UserRole        = 'director' | 'preceptor' | 'docente' | 'admin'

export interface School {
  id: string
  nombre: string
  cue: string | null
  direccion: string | null
  turno: string | null
  created_at: string
}

export interface SchoolYear {
  id: string
  school_id: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  activo: boolean
}

export interface Grade {
  id: string
  school_id: string
  nombre: string
  nivel: string
  orden: number
}

export interface Division {
  id: string
  grade_id: string
  school_year_id: string
  nombre: string
  turno: string | null
}

export interface Student {
  id: string
  school_id: string
  nombre: string
  apellido: string
  dni: string | null
  fecha_nacimiento: string | null
  legajo_nro: string | null
}

export interface Enrollment {
  id: string
  student_id: string
  division_id: string
  school_year_id: string
  fecha_inscripcion: string
  estado: EnrollmentStatus
  student?: Student
}

export interface Attendance {
  id: string
  enrollment_id: string
  registrado_por: string
  fecha: string
  estado: AttendanceStatus
  observacion: string | null
  created_at: string
}
