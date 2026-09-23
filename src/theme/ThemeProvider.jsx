import { createContext, useContext, useEffect, useState } from 'react'

const KEY = 'taskapp_theme'
const ThemeContext = createContext(null)
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readPref() {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}

/** pref: 'system' | 'light' | 'dark'. Applies data-theme on <html>. */
export function ThemeProvider({ children }) {
  const [pref, setPrefState] = useState(readPref)
  const [systemDark, setSystemDark] = useState(() => media().matches)

  useEffect(() => {
    const m = media()
    const onChange = (e) => setSystemDark(e.matches)
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }, [])

  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0B0B0F' : '#F2F2F7')
  }, [resolved])

  function setPref(p) {
    setPrefState(p)
    try { localStorage.setItem(KEY, p) } catch { /* private mode: lasts for this visit only */ }
  }

  return <ThemeContext.Provider value={{ pref, setPref, resolved }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
