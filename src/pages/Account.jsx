import { useState } from 'react'
import { call, DEMO } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { ROLE_LABELS } from '../utils.js'

export default function Account() {
  const { user, logout } = useAuth()
  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirm: '' })
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setMsg('')
    setError('')
    if (form.newPassword !== form.confirm) return setError('New passwords do not match')
    setBusy(true)
    try {
      await call('changePassword', { oldPassword: form.oldPassword, newPassword: form.newPassword })
      setForm({ oldPassword: '', newPassword: '', confirm: '' })
      setMsg('Password changed.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function resetDemoData() {
    if (!confirm('Delete all demo data and start fresh?')) return
    const { resetDemo } = await import('../mock/demoBackend.js')
    resetDemo()
    await logout()
    location.reload()
  }

  return (
    <>
      <div className="page-head"><h2>Account</h2></div>
      <div className="card">
        <p><b>{user.name}</b> ({user.username})</p>
        <p className="muted">{ROLE_LABELS[user.role]} · {user.branch === 'All' ? 'All branches' : user.branch}</p>
      </div>
      <form className="card stack form" onSubmit={submit}>
        <h3>Change password</h3>
        <label>Current password<input type="password" value={form.oldPassword} onChange={(e) => setForm({ ...form, oldPassword: e.target.value })} required /></label>
        <label>New password<input type="password" minLength={6} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required /></label>
        <label>Confirm new password<input type="password" minLength={6} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required /></label>
        {error && <p className="error">{error}</p>}
        {msg && <p className="success">{msg}</p>}
        <button className="btn" disabled={busy}>Change password</button>
      </form>
      {DEMO && <button className="btn-link danger" onClick={resetDemoData}>Reset demo data</button>}
    </>
  )
}
