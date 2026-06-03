import { supabase } from '../lib/supabase'
import type { UserRole } from '../lib/supabase'

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

export async function getCurrentUser(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (error) return null
  return data
}

export async function getSchoolUsers(schoolId: string): Promise<UserProfile[]> {
  const { data, error } = await supabase.from('users').select('*').eq('school_id', schoolId).order('apellido')
  if (error) throw error
  return data ?? []
}

export async function createUser(_schoolId: string, payload: CreateUserPayload): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No hay sesión activa')
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    }
  )
  const result = await res.json()
  if (!res.ok) throw new Error(result.error ?? 'Error al crear usuario')
}

export async function updateUserRole(userId: string, rol: UserRole): Promise<void> {
  const { error } = await supabase.from('users').update({ rol }).eq('id', userId)
  if (error) throw error
}

export async function toggleUserActive(userId: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('users').update({ activo }).eq('id', userId)
  if (error) throw error
}

export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
