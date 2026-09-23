import { useState } from 'react'
import { call } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { PRIORITIES, STATUSES, canManageTask, formatDate, isOverdue } from '../utils.js'

export default function TaskCard({ task, onChange, onDelete }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [remarks, setRemarks] = useState(null) // null = not editing
  const [edit, setEdit] = useState(null)

  const manage = canManageTask(user, task)
  const canUpdate = manage || task.assignedTo === user.id
  const overdue = isOverdue(task)

  async function save(changes) {
    setBusy(true)
    setError('')
    try {
      const updated = await call('updateTask', { id: task.id, ...changes })
      onChange({ ...task, ...updated })
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete task "${task.title}"?`)) return
    setBusy(true)
    try {
      await call('deleteTask', { id: task.id })
      onDelete(task.id)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const statusClass = task.status === 'Done' ? 'done' : task.status === 'In Progress' ? 'progress' : 'pending'

  return (
    <div className={`card task ${statusClass}${overdue ? ' overdue' : ''}`}>
      <div className="task-head">
        <h3>{task.title}</h3>
        <span className={`prio prio-${task.priority.toLowerCase()}`}>{task.priority}</span>
      </div>

      {edit ? (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await save(edit)) setEdit(null)
          }}
        >
          <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required />
          <textarea
            rows={2}
            placeholder="Details"
            value={edit.description}
            onChange={(e) => setEdit({ ...edit, description: e.target.value })}
          />
          <div className="row">
            <select value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input type="date" value={edit.dueDate} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} />
          </div>
          <div className="row">
            <button className="btn" disabled={busy}>Save</button>
            <button type="button" className="btn-link" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        task.description && <p className="desc">{task.description}</p>
      )}

      <div className="meta">
        <span>👤 {task.assignedToName}</span>
        <span>🏢 {task.branch}</span>
        {task.dueDate && <span className={overdue ? 'red' : ''}>📅 {formatDate(task.dueDate)}{overdue ? ' (Overdue)' : ''}</span>}
        <span className="muted">by {task.assignedByName}</span>
        {task.completedAt && <span className="muted">✔ {formatDate(task.completedAt)}</span>}
      </div>

      {remarks === null ? (
        task.remarks && <p className="remarks">💬 {task.remarks}</p>
      ) : (
        <div className="stack">
          <textarea rows={2} autoFocus value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Write an update…" />
          <div className="row">
            <button className="btn" disabled={busy} onClick={async () => { if (await save({ remarks })) setRemarks(null) }}>Save</button>
            <button className="btn-link" onClick={() => setRemarks(null)}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {canUpdate && (
        <div className="task-actions">
          <select value={task.status} disabled={busy} onChange={(e) => save({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          {remarks === null && <button className="btn-link" onClick={() => setRemarks(task.remarks)}>Remarks</button>}
          {manage && !edit && (
            <button
              className="btn-link"
              onClick={() => setEdit({ title: task.title, description: task.description, priority: task.priority, dueDate: task.dueDate })}
            >
              Edit
            </button>
          )}
          {manage && <button className="btn-link danger" disabled={busy} onClick={remove}>Delete</button>}
        </div>
      )}
    </div>
  )
}
