import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { getCurrentUser } from './services/usersService'
import type { UserProfile } from './services/usersService'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import AttendanceSheet from './components/AttendanceSheet'
import StudentHistory from './components/StudentHistory'
import AddStudent from './components/AddStudent'
import ImportStudents from './components/ImportStudents'
import Reports from './components/Reports'
import Settings from './components/Settings'

type View = 'dashboard' | 'attendance' | 'history' | 'add-student' | 'import-students' | 'reports' | 'settings'

export default function App() {
  const [session, setSession]         = useState<Session | null>(null)
  const [loading, setLoading]         = useState(true)
  const [view, setView]               = useState<View>('dashboard')
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session) {
        const profile = await getCurrentUser()
        setUserProfile(profile)
      }
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) { setView('dashboard'); setUserProfile(null) }
      else { getCurrentUser().then(setUserProfile) }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return null
  if (!session) return <Login />

  const back = () => setView('dashboard')

  if (view === 'attendance')       return <AttendanceSheet session={session} onBack={back} />
  if (view === 'history')          return <StudentHistory onBack={back} />
  if (view === 'add-student')      return <AddStudent onBack={back} />
  if (view === 'import-students')  return <ImportStudents onBack={back} />
  if (view === 'reports')           return <Reports onBack={back} />
  if (view === 'settings')         return <Settings onBack={back} />

  const rol = userProfile?.rol ?? 'docente'
  const isDirectorOrAdmin = ['director', 'admin'].includes(rol)

  return (
    <Dashboard
      session={session}
      userRole={rol}
      onGoToAttendance={() => setView('attendance')}
      onGoToHistory={() => setView('history')}
      onGoToAddStudent={isDirectorOrAdmin ? () => setView('add-student') : undefined}
      onGoToImportStudents={isDirectorOrAdmin ? () => setView('import-students') : undefined}
      onGoToReports={() => setView('reports')}
      onGoToSettings={() => setView('settings')}
    />
  )
}
