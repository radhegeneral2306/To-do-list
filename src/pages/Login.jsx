import { useState } from 'react'
import { CheckSquareOffset, Eye, EyeSlash } from '@phosphor-icons/react'
import { useAuth } from '../auth/AuthContext.jsx'
import { DEMO } from '../api.js'
import { ErrorText } from '../components/ui.jsx'

const DEMO_USERS = [
  ['Admin', 'admin', 'admin123'],
  ['Partner', 'partner', 'demo123'],
  ['Raipur Manager', 'raipur.manager', 'demo123'],
  ['Raipur Staff', 'raipur.staff1', 'demo123'],
]

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(u, p) {
    setBusy(true)
    setError('')
    try {
      await login(u, p)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <>
      <div className="ambient" />
      <div className="login-wrap">
        <form
          className="login-card glass"
          onSubmit={(e) => {
            e.preventDefault()
            signIn(username, password)
          }}
        >
          <span className="brand-mark"><CheckSquareOffset size={32} weight="bold" /></span>
          <h1>Company Tasks</h1>
          <p className="lead">Sign in to see today&apos;s work.</p>

          <label className="field">
            <span>Username</span>
            <input
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingRight: 52 }}
                required
              />
              <button
                type="button"
                className="icon-btn"
                style={{ position: 'absolute', right: 5, top: 5, background: 'none', color: 'var(--text-2)' }}
                aria-label={show ? 'Hide password' : 'Show password'}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeSlash size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </label>

          <ErrorText>{error}</ErrorText>
          <button className="btn block" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>

          {DEMO && (
            <div className="demo-box">
              <p>Demo mode. Tap a role to try it:</p>
              <div className="chips">
                {DEMO_USERS.map(([label, u, p]) => (
                  <button type="button" key={u} className="chip" disabled={busy} onClick={() => signIn(u, p)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </>
  )
}
