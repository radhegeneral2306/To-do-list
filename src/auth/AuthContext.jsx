import { createContext, useContext, useEffect, useState } from 'react'
import { call, getToken, setToken, setAuthErrorHandler } from '../api.js'
import { clearScope, fetchMe, setScope } from '../data.js'

const AuthContext = createContext(null)
const USER_KEY = 'taskapp_user'

function savedUser() {
  if (!getToken()) return null
  try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
}

function saveUser(u) {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u))
    else localStorage.removeItem(USER_KEY)
  } catch { /* private mode */ }
}

export function AuthProvider({ children }) {
  // Open straight into the app with the saved user; the server check happens in the background.
  const [user, setUser] = useState(() => {
    const u = savedUser()
    if (u) setScope(u.id)
    return u
  })
  const [checking, setChecking] = useState(() => !!getToken() && !savedUser())

  function signOutLocally() {
    clearScope()
    saveUser(null)
    setToken(null)
    setUser(null)
  }

  useEffect(() => {
    setAuthErrorHandler(signOutLocally)
    if (!getToken()) return
    fetchMe()
      .then((u) => {
        setScope(u.id)
        saveUser(u)
        setUser(u)
      })
      .catch((e) => {
        // Offline: keep using the saved copy. Anything else: the auth handler already signed us out.
        if (!savedUser() && !/Network problem/.test(e.message)) signOutLocally()
      })
      .finally(() => setChecking(false))
  }, [])

  async function login(username, password) {
    const res = await call('login', { username, password })
    setToken(res.token)
    setScope(res.user.id)
    saveUser(res.user)
    setUser(res.user)
  }

  async function logout() {
    try { await call('logout') } catch { /* token may already be dead, or we're offline */ }
    signOutLocally()
  }

  return <AuthContext.Provider value={{ user, checking, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
