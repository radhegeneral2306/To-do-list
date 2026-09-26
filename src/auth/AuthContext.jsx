import { createContext, useContext, useEffect, useState } from 'react'
import { call, getToken, setToken, setAuthErrorHandler } from '../api.js'
import { clearScope, fetchMe, forgetOtherUsers, pendingFor, setScope } from '../data.js'

const AuthContext = createContext(null)
const USER_KEY = 'taskapp_user'
const EXPIRED_KEY = 'taskapp_expired' // who was logged out by an expired session (to finish saving)

/** { name, pending } if the last user's session expired with unsaved changes, else null. */
export function expiredNotice() {
  try {
    const x = JSON.parse(localStorage.getItem(EXPIRED_KEY))
    const pending = x ? pendingFor(x.id) : 0
    return pending ? { name: x.name, username: x.username, pending } : null
  } catch {
    return null
  }
}

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

  // Session expired: keep unsaved changes on the phone; they are sent after the same person logs in.
  function onAuthError(message) {
    const u = savedUser()
    const expired = /Session expired|Please login/.test(message || '')
    if (expired && u) {
      try { localStorage.setItem(EXPIRED_KEY, JSON.stringify({ id: u.id, name: u.name, username: u.username })) } catch { /* ignore */ }
    }
    clearScope({ keepOutbox: expired })
    saveUser(null)
    setToken(null)
    setUser(null)
  }

  useEffect(() => {
    setAuthErrorHandler(onAuthError)
    if (!getToken()) return
    fetchMe()
      .then((u) => {
        setScope(u.id)
        saveUser(u)
        setUser(u)
      })
      .catch((e) => {
        // Offline: keep using the saved copy. Anything else: the auth handler already signed us out.
        if (!savedUser() && !e.transient) signOutLocally()
      })
      .finally(() => setChecking(false))
  }, [])

  async function login(username, password) {
    const res = await call('login', { username, password })
    setToken(res.token)
    forgetOtherUsers(res.user.id) // someone else's leftovers never mix with this person's data
    try { localStorage.removeItem(EXPIRED_KEY) } catch { /* ignore */ }
    setScope(res.user.id) // this user's unsaved changes (if any) start sending now
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
