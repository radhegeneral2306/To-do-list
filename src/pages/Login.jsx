import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { DEMO } from '../api.js'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(username, password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <form className="card login" onSubmit={submit}>
        <h1>✅ Company Task List</h1>
        <label>
          Username
          <input autoFocus autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Logging in…' : 'Login'}</button>
        {DEMO && (
          <div className="hint">
            <b>Demo logins</b> (password <code>demo123</code>):<br />
            <code>partner</code>, <code>raipur.manager</code>, <code>raipur.staff1</code>, <code>durg.staff1</code> …<br />
            Admin: <code>admin</code> / <code>admin123</code>
          </div>
        )}
      </form>
    </div>
  )
}
