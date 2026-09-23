import { useMemo, useState } from 'react'
import TaskCard from './TaskCard.jsx'
import { isOverdue } from '../utils.js'

const FILTERS = ['Open', 'Pending', 'In Progress', 'Overdue', 'Done', 'All']

const matches = (t, f) =>
  f === 'All' ||
  (f === 'Open' && t.status !== 'Done') ||
  (f === 'Overdue' && isOverdue(t)) ||
  t.status === f

const PRIO_ORDER = { High: 0, Medium: 1, Low: 2 }

/** Task list with status filter + search. `setTasks` keeps the parent's list in sync after edits. */
export default function TaskList({ tasks, setTasks }) {
  const [filter, setFilter] = useState('Open')
  const [q, setQ] = useState('')

  const shown = useMemo(() => {
    const text = q.trim().toLowerCase()
    return tasks
      .filter((t) => matches(t, filter))
      .filter((t) => !text || `${t.title} ${t.description} ${t.assignedToName} ${t.remarks}`.toLowerCase().includes(text))
      .sort((a, b) =>
        (a.status === 'Done') - (b.status === 'Done') ||
        (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
        PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority])
  }, [tasks, filter, q])

  const replace = (t) => setTasks(tasks.map((x) => (x.id === t.id ? t : x)))
  const remove = (id) => setTasks(tasks.filter((x) => x.id !== id))

  return (
    <>
      <div className="filters">
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f} className={'chip' + (f === filter ? ' active' : '')} onClick={() => setFilter(f)}>
              {f} ({tasks.filter((t) => matches(t, f)).length})
            </button>
          ))}
        </div>
        <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {shown.length === 0 ? (
        <p className="empty">No tasks here 🎉</p>
      ) : (
        <div className="grid">
          {shown.map((t) => <TaskCard key={t.id} task={t} onChange={replace} onDelete={remove} />)}
        </div>
      )}
    </>
  )
}
