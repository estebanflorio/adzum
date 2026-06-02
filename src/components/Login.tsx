import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import AdzumLogo from './AdzumLogo'

export default function Login() {
  const { theme: t, isDark, toggleTheme } = useTheme()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Email o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <button onClick={toggleTheme} style={{ position: 'fixed', top: 16, right: 16, fontSize: 16, background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
        {isDark ? '☀️' : '🌙'}
      </button>

      <div style={{ background: t.cardBg, borderRadius: 20, border: `1px solid ${t.border}`, padding: 36, width: '100%', maxWidth: 380 }}>
        <div style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <AdzumLogo size={36} showTagline />
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: t.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'DM Mono' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="director@escuela.com" required
              style={{ width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPrimary, outline: 'none', boxSizing: 'border-box', fontFamily: 'Plus Jakarta Sans' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: t.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'DM Mono' }}>Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
              style={{ width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPrimary, outline: 'none', boxSizing: 'border-box', fontFamily: 'Plus Jakarta Sans' }} />
          </div>

          {error && <p style={{ fontSize: 12, color: t.red, background: t.redBg, padding: '10px 12px', borderRadius: 8, margin: 0 }}>{error}</p>}

          <button type="submit" disabled={loading}
            style={{ padding: '12px', background: t.gradient, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: 'Plus Jakarta Sans', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
