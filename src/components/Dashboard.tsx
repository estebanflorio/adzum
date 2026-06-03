import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useTheme } from '../lib/ThemeContext'
import { getActiveSchoolYear } from '../services/divisionsService'
import { getSchoolStats, getAbsenceAlerts, getDailyReport } from '../services/reportsService'
import { getCurrentUser } from '../services/usersService'
import type { AlertStudent, DailyDivisionReport } from '../services/reportsService'
import type { UserProfile } from '../services/usersService'
import { supabase } from '../lib/supabase'
import AdzumLogo from './AdzumLogo'

interface Props {
  session: Session
  userRole?: string
  onGoToAttendance: () => void
  onGoToHistory: () => void
  onGoToAddStudent?: () => void
  onGoToImportStudents?: () => void
  onGoToReports: () => void
  onGoToSettings: () => void
}

interface Stats {
  total_alumnos: number
  con_asistencia_hoy: number
  presentes_hoy: number
  ausentes_hoy: number
  alertas_warning: number
  alertas_critical: number
}

export default function Dashboard({ session, userRole = 'docente', onGoToAttendance, onGoToHistory, onGoToAddStudent, onGoToImportStudents, onGoToReports, onGoToSettings }: Props) {
  const { theme: t, isDark, toggleTheme } = useTheme()
  const [user, setUser]         = useState<UserProfile | null>(null)
  const [stats, setStats]       = useState<Stats | null>(null)
  const [alerts, setAlerts]     = useState<AlertStudent[]>([])
  const [report, setReport]     = useState<DailyDivisionReport[]>([])
  const [loading, setLoading]   = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const fechaDisplay = new Date(today + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  useEffect(() => {
    async function load() {
      const profile = await getCurrentUser()
      if (!profile) return
      setUser(profile)
      const year = await getActiveSchoolYear(profile.school_id)
      if (!year) return
      const [statsData, alertsData, reportData] = await Promise.all([
        getSchoolStats(year.id, today),
        getAbsenceAlerts(year.id),
        getDailyReport(year.id, today),
      ])
      setStats(statsData)
      setAlerts(alertsData.slice(0, 8))
      setReport(reportData)
      setLoading(false)
    }
    load()
  }, [session])

  const porcentajePresentes = stats && stats.con_asistencia_hoy > 0
    ? Math.round((stats.presentes_hoy / stats.con_asistencia_hoy) * 100) : 0

  if (loading) return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: t.textMuted, fontFamily: 'DM Mono', fontSize: 13 }}>cargando...</p>
    </div>
  )

  const navItems = [
    { label: '📋 Tomar asistencia', fn: onGoToAttendance },
    { label: '📅 Historial', fn: onGoToHistory },
    ...(onGoToAddStudent      ? [{ label: '➕ Agregar alumno', fn: onGoToAddStudent }]      : []),
    ...(onGoToImportStudents  ? [{ label: '📂 Importar CSV',   fn: onGoToImportStudents }]  : []),
    { label: '📊 Informes', fn: onGoToReports },
    { label: '⚙ Configuración', fn: onGoToSettings },
  ]

  const mobileNav = [
    { icon: '📋', label: 'Asistencia', fn: onGoToAttendance },
    { icon: '📅', label: 'Historial', fn: onGoToHistory },
    ...(onGoToAddStudent     ? [{ icon: '➕', label: 'Alumno',   fn: onGoToAddStudent }]     : []),
    ...(onGoToImportStudents ? [{ icon: '📂', label: 'Importar', fn: onGoToImportStudents }] : []),
    { icon: '📊', label: 'Informes', fn: onGoToReports },
    { icon: '⚙️', label: 'Config', fn: onGoToSettings },
  ]

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        * { cursor: default; }
        input, textarea, select { cursor: text; }
        button, a, [role="button"] { cursor: pointer; }
        .dash-stats { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px; margin-bottom: 20px; }
        .dash-panels { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .dash-nav { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 20px; }
        .dash-header-btns { display: none; }
        @media (min-width: 768px) {
          .dash-stats { grid-template-columns: repeat(4,1fr); }
          .dash-panels { grid-template-columns: 1fr 1fr; }
          .dash-nav { display: none; }
          .dash-header-btns { display: flex !important; }
          .dash-menu-wrap { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: t.headerBg, zIndex: 10 }}>
        <AdzumLogo size={24} />

        {/* Desktop */}
        <div className="dash-header-btns" style={{ alignItems: 'center', gap: 8 }}>
          {navItems.map(item => (
            <button key={item.label} onClick={item.fn}
              style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans' }}>
              {item.label}
            </button>
          ))}
          <button onClick={toggleTheme} style={{ fontSize: 15, background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>{isDark ? '☀️' : '🌙'}</button>
          <button onClick={() => supabase.auth.signOut()} style={{ fontSize: 12, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>Salir</button>
        </div>

        {/* Mobile hamburger */}
        <div className="dash-menu-wrap" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={toggleTheme} style={{ fontSize: 15, background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}>{isDark ? '☀️' : '🌙'}</button>
            <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, color: t.textMuted, cursor: 'pointer', padding: '6px 10px', fontSize: 18, lineHeight: 1 }}>☰</button>
          </div>
          {menuOpen && (
            <div style={{ position: 'absolute', top: 44, right: 0, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, padding: 8, zIndex: 20, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {navItems.map(item => (
                <button key={item.label} onClick={() => { item.fn(); setMenuOpen(false) }}
                  style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: 'transparent', color: t.textSecondary, fontSize: 13, cursor: 'pointer', textAlign: 'left', fontFamily: 'Plus Jakarta Sans' }}>
                  {item.label}
                </button>
              ))}
              <div style={{ borderTop: `1px solid ${t.border}`, margin: '4px 0' }} />
              <button onClick={() => supabase.auth.signOut()} style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: 'transparent', color: t.red, fontSize: 13, cursor: 'pointer', textAlign: 'left', fontFamily: 'Plus Jakarta Sans' }}>← Salir</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
            {userRole === 'director' ? 'Panel de la directora' : userRole === 'admin' ? 'Panel de administración' : 'Panel docente'}
          </h1>
          {userRole !== 'director' && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: t.amberBg, color: t.amber, fontFamily: 'DM Mono', border: `1px solid ${t.amber}40` }}>
              {userRole}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: t.textMuted, margin: '0 0 20px', fontFamily: 'DM Mono', textTransform: 'capitalize' }}>{fechaDisplay} — {user?.nombre} {user?.apellido}</p>

        {/* Mobile nav */}
        <div className="dash-nav">
          {mobileNav.map(item => (
            <button key={item.label} onClick={item.fn}
              style={{ padding: '14px 8px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.cardBg, color: t.textSecondary, fontSize: 20, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {item.icon}
              <span style={{ fontSize: 10, color: t.textMuted, fontFamily: 'Plus Jakarta Sans' }}>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="dash-stats">
          {[
            { label: 'Total alumnos', value: stats?.total_alumnos ?? 0, sub: 'inscriptos', accent: false },
            { label: 'Presentes hoy', value: stats?.presentes_hoy ?? 0, sub: `${porcentajePresentes}%`, accent: true },
            { label: 'Ausentes hoy', value: stats?.ausentes_hoy ?? 0, sub: 'hoy', color: t.red },
            { label: 'Con alertas', value: (stats?.alertas_warning ?? 0) + (stats?.alertas_critical ?? 0), sub: `${stats?.alertas_critical ?? 0} críticas`, color: t.amber },
          ].map((s, i) => (
            <div key={s.label} style={{ background: t.cardBg, border: `1px solid ${i === 1 ? t.accentBorder : t.border}`, borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
              {i === 1 && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: t.gradient, borderRadius: '14px 14px 0 0' }} />}
              <p style={{ fontSize: 11, color: t.textMuted, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'DM Mono' }}>{s.label}</p>
              <p style={{ fontSize: 32, fontWeight: 600, margin: '0 0 2px', background: s.accent ? t.gradient : 'none', WebkitBackgroundClip: s.accent ? 'text' : 'unset', WebkitTextFillColor: s.accent ? 'transparent' : (s.color ?? t.textPrimary), backgroundClip: s.accent ? 'text' : 'unset' }}>{s.value}</p>
              <p style={{ fontSize: 11, color: t.textMuted, margin: 0 }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Panels */}
        <div className="dash-panels">
          <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
            <p style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px', fontFamily: 'DM Mono' }}>Asistencia por sala — hoy</p>
            {report.length === 0
              ? <p style={{ fontSize: 13, color: t.textMuted, margin: 0 }}>Sin registros por ahora.</p>
              : report.map(r => (
                <div key={r.division_id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: t.textMuted, minWidth: 44 }}>{r.grado}{r.division}</span>
                  <div style={{ flex: 1, height: 6, background: t.border, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${r.porcentaje_presentes}%`, background: r.porcentaje_presentes >= 85 ? t.gradient : r.porcentaje_presentes >= 70 ? t.amber : t.red, borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: t.textMuted, minWidth: 36, textAlign: 'right' }}>{r.porcentaje_presentes}%</span>
                </div>
              ))
            }
          </div>

          <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 }}>
            <p style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px', fontFamily: 'DM Mono' }}>Alertas de inasistencias</p>
            {alerts.length === 0
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent }} />
                  <p style={{ fontSize: 13, color: t.textMuted, margin: 0 }}>Sin alertas activas.</p>
                </div>
              : alerts.map(a => (
                <div key={a.enrollment_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, marginBottom: 6, background: a.nivel === 'critical' ? t.redBg : t.amberBg, border: `1px solid ${a.nivel === 'critical' ? t.red : t.amber}30` }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: a.nivel === 'critical' ? t.red : t.amber }} />
                  <span style={{ flex: 1, fontSize: 13, color: t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.apellido}, {a.nombre}</span>
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: t.textMuted, flexShrink: 0 }}>{a.grado}{a.division}</span>
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono', padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: a.nivel === 'critical' ? t.redBg : t.amberBg, color: a.nivel === 'critical' ? t.red : t.amber }}>{a.ausencias}f</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
