import { useState } from 'react'
import { ArrowCounterClockwise, CaretRight, DeviceMobile, Key, Moon, SignOut, Sun } from '@phosphor-icons/react'
import { call, DEMO } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useTheme } from '../theme/ThemeProvider.jsx'
import LargeTitle from '../components/LargeTitle.jsx'
import { Avatar, ErrorText, Segmented, Sheet, useToast } from '../components/ui.jsx'
import { ROLE_LABELS } from '../utils.js'

function PasswordSheet({ open, onClose }) {
  const toast = useToast()
  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    if (form.newPassword !== form.confirm) return setError('New passwords do not match.')
    setBusy(true)
    setError('')
    try {
      await call('changePassword', { oldPassword: form.oldPassword, newPassword: form.newPassword })
      setForm({ oldPassword: '', newPassword: '', confirm: '' })
      toast('Password changed')
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Change Password">
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <label className="field"><span>Current password</span><input className="input" type="password" autoComplete="current-password" value={form.oldPassword} onChange={set('oldPassword')} required /></label>
        <label className="field"><span>New password</span><input className="input" type="password" autoComplete="new-password" minLength={6} value={form.newPassword} onChange={set('newPassword')} required /></label>
        <label className="field"><span>Confirm new password</span><input className="input" type="password" autoComplete="new-password" minLength={6} value={form.confirm} onChange={set('confirm')} required /></label>
        <ErrorText>{error}</ErrorText>
        <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Change Password'}</button>
      </form>
    </Sheet>
  )
}

export default function Profile() {
  const { user, logout } = useAuth()
  const { pref, setPref } = useTheme()
  const [pwOpen, setPwOpen] = useState(false)

  async function resetDemoData() {
    if (!window.confirm('Delete all demo data and start fresh?')) return
    const { resetDemo } = await import('../mock/demoBackend.js')
    resetDemo()
    await logout()
    window.location.reload()
  }

  return (
    <>
      <LargeTitle title="Profile" />

      <div className="profile-card glass">
        <Avatar name={user.name} size={64} />
        <div className="grow">
          <h2>{user.name}</h2>
          <p className="muted">{ROLE_LABELS[user.role]} · {user.branch === 'All' ? 'All branches' : user.branch}</p>
          <p className="muted" style={{ fontSize: 14 }}>@{user.username}</p>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Appearance</h2>
        <div className="group" style={{ padding: 12 }}>
          <Segmented
            label="Appearance"
            value={pref}
            onChange={setPref}
            options={[
              { value: 'system', label: <span className="row" style={{ gap: 6, justifyContent: 'center' }}><DeviceMobile size={16} />Auto</span> },
              { value: 'light', label: <span className="row" style={{ gap: 6, justifyContent: 'center' }}><Sun size={16} />Light</span> },
              { value: 'dark', label: <span className="row" style={{ gap: 6, justifyContent: 'center' }}><Moon size={16} />Dark</span> },
            ]}
          />
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Account</h2>
        <div className="group">
          <button className="cell" style={{ '--inset': '58px' }} onClick={() => setPwOpen(true)}>
            <span className="cell-icon" style={{ background: 'var(--accent)' }}><Key size={18} weight="fill" /></span>
            <span className="grow">Change Password</span>
            <CaretRight size={16} weight="bold" className="chev" />
          </button>
          {DEMO && (
            <button className="cell" style={{ '--inset': '58px' }} onClick={resetDemoData}>
              <span className="cell-icon" style={{ background: 'var(--orange)' }}><ArrowCounterClockwise size={18} weight="bold" /></span>
              <span className="grow">Reset Demo Data</span>
            </button>
          )}
        </div>
      </section>

      <section className="section">
        <div className="group">
          <button className="cell danger" style={{ justifyContent: 'center' }} onClick={logout}>
            <SignOut size={20} weight="bold" /> Sign Out
          </button>
        </div>
        {DEMO && <p className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 12 }}>Demo mode. Data is saved only in this browser.</p>}
      </section>

      <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </>
  )
}
