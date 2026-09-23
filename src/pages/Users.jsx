import { useState } from 'react'
import { call } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { ROLE_LABELS, useApi } from '../utils.js'

const EMPTY = { name: '', username: '', password: '', role: 'user', branch: '' }
const needsBranch = (role) => role === 'manager' || role === 'user'

export default function Users() {
  const { user: me } = useAuth()
  const users = useApi('listUsers', {}, 0)
  const branches = useApi('listBranches', {}, 0)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [branchFilter, setBranchFilter] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const branchList = branches.data || []

  async function run(fn, success) {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      await fn()
      if (success) setMsg(success)
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addUser(e) {
    e.preventDefault()
    const ok = await run(() => call('createUser', form), `User "${form.username}" created. Share the username and password with them.`)
    if (ok) {
      setForm(EMPTY)
      users.reload()
    }
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (await run(() => call('updateUser', editing), 'Saved.')) {
      setEditing(null)
      users.reload()
    }
  }

  async function toggleActive(u) {
    if (!confirm(`${u.active ? 'Disable' : 'Enable'} ${u.name}?`)) return
    if (await run(() => call('updateUser', { id: u.id, active: !u.active }))) users.reload()
  }

  async function resetPassword(u) {
    const pw = prompt(`New password for ${u.name} (min 6 characters):`)
    if (pw) await run(() => call('resetPassword', { id: u.id, newPassword: pw }), `Password changed for ${u.name}.`)
  }

  async function addBranch(e) {
    e.preventDefault()
    if (await run(() => call('addBranch', { name: newBranch }), `Branch "${newBranch}" added.`)) {
      setNewBranch('')
      branches.reload()
    }
  }

  const shown = (users.data || []).filter((u) => !branchFilter || u.branch === branchFilter)

  return (
    <>
      <div className="page-head"><h2>Users</h2></div>
      {error && <p className="error">{error}</p>}
      {msg && <p className="success">{msg}</p>}

      <form className="card stack form" onSubmit={addUser}>
        <h3>Add user</h3>
        <div className="row">
          <label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>
            Username
            <input
              value={form.username}
              autoCapitalize="none"
              placeholder="e.g. raipur.ramesh"
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
              required
            />
          </label>
        </div>
        <div className="row">
          <label>Password<input value={form.password} minLength={6} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
          <label>
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {needsBranch(form.role) && (
            <label>
              Branch
              <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} required>
                <option value="">Choose…</option>
                {branchList.map((b) => <option key={b}>{b}</option>)}
              </select>
            </label>
          )}
        </div>
        <button className="btn" disabled={busy}>Add user</button>
      </form>

      <div className="page-head">
        <h3>All users ({shown.length})</h3>
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="">All branches</option>
          <option value="All">Admin / Partners</option>
          {branchList.map((b) => <option key={b}>{b}</option>)}
        </select>
      </div>
      {users.error && <p className="error">{users.error}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Branch</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shown.map((u) =>
              editing?.id === u.id ? (
                <tr key={u.id}>
                  <td colSpan={6}>
                    <form className="row" onSubmit={saveEdit}>
                      <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
                      <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                        {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      {needsBranch(editing.role) && (
                        <select value={editing.branch} onChange={(e) => setEditing({ ...editing, branch: e.target.value })} required>
                          <option value="">Branch…</option>
                          {branchList.map((b) => <option key={b}>{b}</option>)}
                        </select>
                      )}
                      <button className="btn" disabled={busy}>Save</button>
                      <button type="button" className="btn-link" onClick={() => setEditing(null)}>Cancel</button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={u.id} className={u.active ? '' : 'inactive'}>
                  <td>{u.name}{u.id === me.id && ' (you)'}</td>
                  <td>{u.username}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td>{u.branch}</td>
                  <td>{u.active ? 'Active' : 'Disabled'}</td>
                  <td className="actions">
                    <button className="btn-link" onClick={() => setEditing({ id: u.id, name: u.name, role: u.role, branch: u.branch === 'All' ? '' : u.branch })}>Edit</button>
                    <button className="btn-link" onClick={() => resetPassword(u)}>Password</button>
                    {u.id !== me.id && (
                      <button className={'btn-link' + (u.active ? ' danger' : '')} onClick={() => toggleActive(u)}>
                        {u.active ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <form className="card stack form" onSubmit={addBranch}>
        <h3>Branches</h3>
        <p className="muted">{branchList.join(', ')}</p>
        <div className="row">
          <input placeholder="New branch name" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} required />
          <button className="btn" disabled={busy}>Add branch</button>
        </div>
      </form>
    </>
  )
}
