import { useMemo, useState } from 'react'
import TaskList from '../components/TaskList.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { isOverdue, isTop, useApi } from '../utils.js'

export default function BranchDashboard() {
  const { user } = useAuth()
  const top = isTop(user)
  const [branch, setBranch] = useState(top ? 'All' : user.branch)
  const [person, setPerson] = useState('')
  const branches = useApi('listBranches', {}, 0)
  const { data, setData, error, loading, reload } = useApi('listTasks', { branch })

  const tasks = data || []

  // One row per employee: how many tasks in each state.
  const summary = useMemo(() => {
    const rows = {}
    for (const t of tasks) {
      const r = (rows[t.assignedTo] ||= { id: t.assignedTo, name: t.assignedToName, branch: t.branch, pending: 0, progress: 0, done: 0, overdue: 0 })
      if (t.status === 'Done') r.done++
      else if (t.status === 'In Progress') r.progress++
      else r.pending++
      if (isOverdue(t)) r.overdue++
    }
    return Object.values(rows).sort((a, b) => b.overdue - a.overdue || b.pending - a.pending || a.name.localeCompare(b.name))
  }, [tasks])

  const totals = summary.reduce(
    (s, r) => ({ pending: s.pending + r.pending, progress: s.progress + r.progress, done: s.done + r.done, overdue: s.overdue + r.overdue }),
    { pending: 0, progress: 0, done: 0, overdue: 0 },
  )

  const personTasks = person ? tasks.filter((t) => t.assignedTo === person) : tasks
  const setPersonTasks = (list) => {
    const byId = Object.fromEntries(list.map((t) => [t.id, t]))
    const removed = personTasks.filter((t) => !byId[t.id]).map((t) => t.id)
    setData(tasks.filter((t) => !removed.includes(t.id)).map((t) => byId[t.id] || t))
  }

  function pickBranch(b) {
    setBranch(b)
    setPerson('')
  }

  return (
    <>
      <div className="page-head">
        <h2>Branch Dashboard</h2>
        <button className="btn-link" onClick={reload} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button>
      </div>

      {top ? (
        <div className="chips">
          {['All', ...(branches.data || [])].map((b) => (
            <button key={b} className={'chip' + (b === branch ? ' active' : '')} onClick={() => pickBranch(b)}>{b}</button>
          ))}
        </div>
      ) : (
        <p className="muted">Branch: <b>{user.branch}</b></p>
      )}

      <div className="stats">
        <div className="stat"><b>{totals.pending}</b>Pending</div>
        <div className="stat"><b>{totals.progress}</b>In Progress</div>
        <div className="stat red"><b>{totals.overdue}</b>Overdue</div>
        <div className="stat green"><b>{totals.done}</b>Done</div>
      </div>

      {error && <p className="error">{error}</p>}

      {summary.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th>{branch === 'All' && <th>Branch</th>}<th>Pending</th><th>In Progress</th><th>Overdue</th><th>Done</th></tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.id} className={'clickable' + (r.id === person ? ' selected' : '')} onClick={() => setPerson(r.id === person ? '' : r.id)}>
                  <td>{r.name}</td>
                  {branch === 'All' && <td>{r.branch}</td>}
                  <td>{r.pending}</td>
                  <td>{r.progress}</td>
                  <td className={r.overdue ? 'red' : ''}>{r.overdue}</td>
                  <td>{r.done}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="section">
        {person ? `Tasks of ${summary.find((r) => r.id === person)?.name || ''}` : 'All tasks'}
        {person && <button className="btn-link" onClick={() => setPerson('')}>Show all</button>}
      </h3>
      {data && <TaskList tasks={personTasks} setTasks={setPersonTasks} />}
    </>
  )
}
