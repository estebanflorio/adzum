import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { darkTheme, lightTheme } from './theme'
import type { Theme } from './theme'

interface ThemeContextType {
  theme: Theme
  isDark: boolean
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: darkTheme,
  isDark: true,
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const theme = isDark ? darkTheme : lightTheme

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
    document.body.style.background = theme.bg
    document.body.style.color = theme.textPrimary
    // Aplicar color de tema al meta tag para que la barra del browser cambie
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme.headerBg)
  }, [isDark, theme])

  function toggleTheme() { setIsDark(d => !d) }

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
