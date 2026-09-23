import { createContext, useContext, useEffect, useState } from 'react'
import { call, getToken, setToken, setAuthErrorHandler } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(!!getToken())

  useEffect(() => {
    setAuthErrorHandler(() => { setToken(null); setUser(null) })
    if (!getToken()) return
    call('me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setChecking(false))
  }, [])

  async function login(username, password) {
    const res = await call('login', { username, password })
    setToken(res.token)
    setUser(res.user)
  }

  async function logout() {
    try { await call('logout') } catch { /* token may already be dead */ }
    setToken(null)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, checking, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
