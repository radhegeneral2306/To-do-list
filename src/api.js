// Every call to the backend goes through `call(action, payload)`.
// If VITE_API_URL is not set, the app runs in DEMO mode (real backend code, fake sheet in the browser).

const API_URL = import.meta.env.VITE_API_URL
export const DEMO = !API_URL

const TOKEN_KEY = 'taskapp_token'

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* private mode: token lives only for this page load */ }
}

let onAuthError = () => {}
export function setAuthErrorHandler(fn) { onAuthError = fn }

// Writes come back with { before, v }: the data version before and after this change.
// Reads come back with v: the version the returned data reflects.
let onVersion = () => {}
let onReadVersion = () => {}
export function setVersionHandler(fn, onRead) { onVersion = fn; onReadVersion = onRead }

const TIMEOUT_MS = 45_000
// Safe to send twice, so a hiccup is retried automatically once.
const RETRY_ONCE = { me: 1, ping: 1, bootstrap: 1, listTasks: 1, listUsers: 1, listBranches: 1, updateUser: 1, resetPassword: 1 }
// Google's temporary errors (for a backend deployed before it started sending `retry`).
const GOOGLE_HICCUP = /lock|timed? ?out|service (invoked|spreadsheets|error)|too many times|exceeded maximum|temporar|internal error|try again later|unavailable/i

/** An error the app may simply retry (network drop, timeout, Google hiccup). */
export const isTransient = (e) => !!(e && e.transient)

function transient(message) {
  const e = new Error(message)
  e.transient = true
  return e
}

export async function call(action, payload = {}) {
  try {
    return await callOnce(action, payload)
  } catch (e) {
    if (!isTransient(e) || !RETRY_ONCE[action]) throw e
    await new Promise((r) => setTimeout(r, 1500))
    return callOnce(action, payload)
  }
}

async function callOnce(action, payload) {
  const token = getToken()
  let res
  if (DEMO) {
    const demo = await import('./mock/demoBackend.js')
    res = await demo.call(action, payload, token)
  } else {
    let r
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = ctrl && setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      r = await fetch(API_URL, {
        method: 'POST',
        // text/plain avoids a CORS preflight, which Apps Script can't answer.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload, token }),
        signal: ctrl?.signal,
      })
      if (!r.ok) throw transient(`Server error (${r.status})`)
      const text = await r.text()
      try {
        res = JSON.parse(text)
      } catch {
        // Google sometimes answers with an HTML error page ("unable to open the file at this time").
        throw transient('Server busy. Trying again.')
      }
    } catch (e) {
      if (e.transient) throw e
      if (e.name === 'AbortError') throw transient('Server took too long. Trying again.')
      throw transient('Network problem. Check your internet and try again.')
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  if (!res.ok) {
    if (/Please login|Session expired|Account disabled/.test(res.error) && action !== 'login') onAuthError(res.error)
    const e = new Error(res.error)
    if (res.retry || (res.retry === undefined && GOOGLE_HICCUP.test(res.error))) e.transient = true
    throw e
  }
  if (res.version) onVersion(res.version)
  if (res.v) onReadVersion(res.v)
  return res.data
}
