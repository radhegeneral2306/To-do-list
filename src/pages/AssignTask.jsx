import { useState } from 'react'
import { call } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { PRIORITIES, ROLE_LABELS, isTop, today, useApi } from '../utils.js'

const EMPTY = { title: '', description: '', assignedTo: '', priority: 'Medium', dueDate: '' }

export default function AssignTask() {
  const { user } = useAuth()
  const top = isTop(user)
  const [branch, setBranch] = useState(top ? '' : user.branch)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const branches = useApi('listBranches', {}, 0)
  const users = useApi('listUsers', {}, 0)

  const active = (users.data || []).filter((u) => u.active)
  const branchPeople = active.filter((u) => u.branch === branch)
  const topPeople = active.filter((u) => u.branch === 'All')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const t = await call('createTask', { ...form, branch })
      const who = active.find((u) => u.id === t.assignedTo)
      setMsg(`Task "${t.title}" assigned to ${who?.name || ''}.`)
      setForm({ ...EMPTY, assignedTo: form.assignedTo, priority: form.priority })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head"><h2>Assign Task</h2></div>
      <form className="card stack form" onSubmit={submit}>
        <label>
          Branch
          {top ? (
            <select value={branch} onChange={(e) => { setBranch(e.target.value); setForm({ ...form, assignedTo: '' }) }} required>
              <option value="">Choose branch…</option>
              {(branches.data || []).map((b) => <option key={b}>{b}</option>)}
            </select>
          ) : (
            <input value={branch} disabled />
          )}
        </label>

        <label>
          Assign to
          <select value={form.assignedTo} onChange={set('assignedTo')} required disabled={!branch}>
            <option value="">{branch ? 'Choose person…' : 'Choose branch first'}</option>
            {branchPeople.length > 0 && (
              <optgroup label={`${branch} branch`}>
                {branchPeople.map((u) => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role]})</option>)}
              </optgroup>
            )}
            {topPeople.length > 0 && (
              <optgroup label="Admin / Partners">
                {topPeople.map((u) => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role]})</option>)}
              </optgroup>
            )}
          </select>
        </label>
        {branch && branchPeople.length === 0 && users.data && <p className="muted">No employees in {branch} yet. Add them in Users.</p>}

        <label>
          Task
          <input value={form.title} onChange={set('title')} placeholder="What needs to be done?" required maxLength={200} />
        </label>
        <label>
          Details (optional)
          <textarea rows={3} value={form.description} onChange={set('description')} />
        </label>
        <div className="row">
          <label>
            Priority
            <select value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Due date
            <input type="date" min={today()} value={form.dueDate} onChange={set('dueDate')} />
          </label>
        </div>

        {error && <p className="error">{error}</p>}
        {users.error && <p className="error">{users.error}</p>}
        {msg && <p className="success">{msg}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Assigning…' : 'Assign Task'}</button>
      </form>
    </>
  )
}
