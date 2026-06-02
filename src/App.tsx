import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import AttendanceSheet from './components/AttendanceSheet'
import StudentHistory from './components/StudentHistory'
import AddStudent from './components/AddStudent'
import ImportStudents from './components/ImportStudents'
import Settings from './components/Settings'

type View = 'dashboard' | 'attendance' | 'history' | 'add-student' | 'import-students' | 'settings'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView]       = useState<View>('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) setView('dashboard')
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
  if (view === 'settings')         return <Settings onBack={back} />

  return (
    <Dashboard
      session={session}
      onGoToAttendance={() => setView('attendance')}
      onGoToHistory={() => setView('history')}
      onGoToAddStudent={() => setView('add-student')}
      onGoToImportStudents={() => setView('import-students')}
      onGoToSettings={() => setView('settings')}
    />
  )
}
