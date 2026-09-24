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

export async function call(action, payload = {}) {
  const token = getToken()
  let res
  if (DEMO) {
    const demo = await import('./mock/demoBackend.js')
    res = await demo.call(action, payload, token)
  } else {
    let r
    try {
      r = await fetch(API_URL, {
        method: 'POST',
        // text/plain avoids a CORS preflight, which Apps Script can't answer.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload, token }),
      })
    } catch {
      throw new Error('Network problem. Check your internet and try again.')
    }
    if (!r.ok) throw new Error(`Server error (${r.status})`)
    res = await r.json()
  }
  if (!res.ok) {
    if (/Please login|Session expired|Account disabled/.test(res.error) && action !== 'login') onAuthError()
    throw new Error(res.error)
  }
  if (res.version) onVersion(res.version)
  if (res.v) onReadVersion(res.v)
  return res.data
}
