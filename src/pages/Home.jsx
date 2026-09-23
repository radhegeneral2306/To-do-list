import { useMemo, useState } from 'react'
import { CaretRight, CheckCircle, Clock, Plus, Spinner, UsersThree, WarningCircle } from '@phosphor-icons/react'
import LargeTitle from '../components/LargeTitle.jsx'
import TaskList from '../components/TaskList.jsx'
import { useAssign } from '../components/Layout.jsx'
import { Avatar, EmptyState, ErrorText, Ring, Sheet, SkeletonRows } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { ROLE_LABELS, greeting, isOverdue, isTop, useApi } from '../utils.js'
import { RefreshButton } from './MyTasks.jsx'

const TILES = [
  ['pending', 'Pending', Clock, 'var(--orange)'],
  ['progress', 'In Progress', Spinner, 'var(--accent)'],
  ['overdue', 'Overdue', WarningCircle, 'var(--red)'],
  ['done', 'Done', CheckCircle, 'var(--green)'],
]

function countOf(tasks) {
  const c = { pending: 0, progress: 0, done: 0, overdue: 0, total: tasks.length }
  for (const t of tasks) {
    if (t.status === 'Done') c.done++
    else if (t.status === 'In Progress') c.progress++
    else c.pending++
    if (isOverdue(t)) c.overdue++
  }
  return c
}

export default function Home() {
  const { user } = useAuth()
  const openAssign = useAssign()
  const top = isTop(user)
  const [branch, setBranch] = useState(top ? 'All' : user.branch)
  const [personId, setPersonId] = useState(null)
  const branches = useApi('listBranches', {}, 0)
  const users = useApi('listUsers', {}, 0)
  const { data, setData, error, loading, reload } = useApi('listTasks', { branch })

  const tasks = data || []
  const totals = countOf(tasks)

  // Everyone in the branch (even with no tasks), busiest first.
  const people = useMemo(() => {
    const inBranch = (users.data || []).filter((u) => u.active && u.branch !== 'All' && (branch === 'All' || u.branch === branch))
    const withTasks = new Set(tasks.map((t) => t.assignedTo))
    const extra = (users.data || []).filter((u) => u.branch === 'All' && withTasks.has(u.id))
    return [...inBranch, ...extra]
      .map((u) => ({ ...u, c: countOf(tasks.filter((t) => t.assignedTo === u.id)) }))
      .sort((a, b) => b.c.overdue - a.c.overdue || b.c.total - b.c.done - (a.c.total - a.c.done) || a.name.localeCompare(b.name))
  }, [users.data, tasks, branch])

  const person = people.find((p) => p.id === personId)
  const personTasks = person ? tasks.filter((t) => t.assignedTo === person.id) : null
  const setPersonTasks = (list) => {
    const byId = Object.fromEntries(list.map((t) => [t.id, t]))
    const removed = personTasks.filter((t) => !byId[t.id]).map((t) => t.id)
    setData(tasks.filter((t) => !removed.includes(t.id)).map((t) => byId[t.id] || t))
  }

  const dateLine = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <LargeTitle
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={`${dateLine}${top ? '' : ` · ${user.branch}`}`}
        actions={<RefreshButton loading={loading} onClick={reload} />}
      />

      {top && (
        <div className="chips" role="tablist" aria-label="Branch" style={{ marginBottom: 16 }}>
          {['All', ...(branches.data || [])].map((b) => (
            <button key={b} role="tab" aria-selected={b === branch} className={'chip' + (b === branch ? ' active' : '')} onClick={() => setBranch(b)}>
              {b === 'All' ? 'All Branches' : b}
            </button>
          ))}
        </div>
      )}

      <ErrorText>{error}</ErrorText>

      <div className="two-col">
        <div>
          <div className="bento">
            {TILES.map(([key, label, Icon, color]) => (
              <div key={key} className="tile glass">
                <div className="tile-top">
                  <span className="tile-icon" style={{ background: color }}><Icon size={18} weight="bold" /></span>
                  <span className="tile-num">{data ? totals[key] : '-'}</span>
                </div>
                <span className="tile-label">{label}</span>
              </div>
            ))}
          </div>

          <section className="section">
            <h2 className="section-title">Team</h2>
            {!users.data ? (
              <SkeletonRows rows={3} />
            ) : people.length === 0 ? (
              <div className="group">
                <EmptyState icon={UsersThree} title="No team members" text="Add people to this branch from the Team tab." />
              </div>
            ) : (
              <div className="group">
                {people.map((p) => (
                  <button key={p.id} className="cell" style={{ '--inset': '68px' }} onClick={() => setPersonId(p.id)}>
                    <Avatar name={p.name} size={40} />
                    <div className="grow">
                      <div className="cell-title">{p.name}</div>
                      <div className="cell-sub">
                        {p.c.total === 0 ? 'No tasks' : `${p.c.total - p.c.done} open`}
                        {branch === 'All' ? ` · ${p.branch === 'All' ? ROLE_LABELS[p.role] : p.branch}` : ''}
                      </div>
                    </div>
                    {p.c.overdue > 0 && <span className="badge red">{p.c.overdue} late</span>}
                    {p.c.total > 0 && <Ring value={p.c.done} total={p.c.total} />}
                    <CaretRight size={16} weight="bold" className="chev" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="section">
          <h2 className="section-title">
            {branch === 'All' ? 'All Tasks' : `${branch} Tasks`}
            <button className="btn small secondary" onClick={openAssign}>
              <Plus size={14} weight="bold" /> New
            </button>
          </h2>
          <TaskList tasks={data} setTasks={setData} showAssignee emptyText="No open tasks in this branch." />
        </section>
      </div>

      <Sheet open={!!person} onClose={() => setPersonId(null)} title={person?.name || ''}>
        {personTasks && <TaskList tasks={personTasks} setTasks={setPersonTasks} emptyText={`${person.name.split(' ')[0]} has nothing open.`} />}
      </Sheet>
    </>
  )
}
