import { supabase } from '../lib/supabase'
import type { UserRole } from '../lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  school_id: string
  nombre: string
  apellido: string
  email: string
  rol: UserRole
  activo: boolean
  created_at: string
}

export interface CreateUserPayload {
  email: string
  password: string
  nombre: string
  apellido: string
  rol: UserRole
}

// ─── Obtener perfil del usuario actual ───────────────────────

export async function getCurrentUser(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) return null
  return data
}

// ─── Obtener todos los usuarios de la escuela ────────────────

export async function getSchoolUsers(schoolId: string): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('school_id', schoolId)
    .order('apellido')

  if (error) throw error
  return data ?? []
}

// ─── Crear usuario nuevo (solo director) ─────────────────────
// Crea el usuario en Supabase Auth y luego el perfil en la tabla users

export async function createUser(
  schoolId: string,
  payload: CreateUserPayload
): Promise<void> {
  // 1. Crear en Supabase Auth mediante invitación
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
  })

  if (authError) throw authError

  // 2. Crear perfil en tabla users
  const { error: profileError } = await supabase
    .from('users')
    .insert({
      id:        authData.user.id,
      school_id: schoolId,
      nombre:    payload.nombre,
      apellido:  payload.apellido,
      email:     payload.email,
      rol:       payload.rol,
    })

  if (profileError) throw profileError
}

// ─── Actualizar rol de usuario ────────────────────────────────

export async function updateUserRole(
  userId: string,
  rol: UserRole
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ rol })
    .eq('id', userId)

  if (error) throw error
}

// ─── Activar / desactivar usuario ────────────────────────────

export async function toggleUserActive(
  userId: string,
  activo: boolean
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ activo })
    .eq('id', userId)

  if (error) throw error
}

// ─── Cambiar contraseña (usuario actual) ─────────────────────

export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

// ─── Cerrar sesión ────────────────────────────────────────────

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
