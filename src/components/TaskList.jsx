import { useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { CheckCircle, MagnifyingGlass, Tray } from '@phosphor-icons/react'
import { call } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { canManageTask, isOverdue, today } from '../utils.js'
import TaskRow from './TaskRow.jsx'
import TaskSheet from './TaskSheet.jsx'
import { EmptyState, Segmented, SkeletonRows, useToast } from './ui.jsx'

const PRIO = { High: 0, Medium: 1, Low: 2 }
const byDue = (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || PRIO[a.priority] - PRIO[b.priority]

/** Splits tasks into Reminders-style sections. */
function groupTasks(list, filter) {
  const t = today()
  if (filter === 'Done') return [['Completed', list.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))]]
  if (filter === 'Overdue') return [['Overdue', list.sort(byDue)]]
  const open = list.filter((x) => x.status !== 'Done')
  const groups = [
    ['Overdue', open.filter(isOverdue)],
    ['Today', open.filter((x) => x.dueDate === t)],
    ['Upcoming', open.filter((x) => x.dueDate > t)],
    ['No Due Date', open.filter((x) => !x.dueDate)],
  ]
  if (filter === 'All') groups.push(['Completed', list.filter((x) => x.status === 'Done')])
  return groups.map(([k, v]) => [k, v.sort(byDue)]).filter(([, v]) => v.length)
}

const FILTERS = [
  ['Open', (x) => x.status !== 'Done'],
  ['Overdue', isOverdue],
  ['Done', (x) => x.status === 'Done'],
  ['All', () => true],
]

/** Task list with filter, search, one-tap done and a detail sheet. `setTasks` keeps the parent in sync. */
export default function TaskList({ tasks, setTasks, showAssignee, emptyText }) {
  const { user } = useAuth()
  const toast = useToast()
  const [filter, setFilter] = useState('Open')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)

  const list = tasks || []
  const opened = list.find((t) => t.id === openId) || null

  const groups = useMemo(() => {
    const text = q.trim().toLowerCase()
    const fn = FILTERS.find(([f]) => f === filter)[1]
    const shown = list
      .filter(fn)
      .filter((t) => !text || `${t.title} ${t.description} ${t.assignedToName} ${t.remarks} ${t.branch}`.toLowerCase().includes(text))
    return groupTasks(shown, filter)
  }, [list, filter, q])

  const replace = (t) => setTasks(list.map((x) => (x.id === t.id ? t : x)))
  const remove = (id) => setTasks(list.filter((x) => x.id !== id))

  // Optimistic: flip it now, undo if the server says no.
  async function toggle(task) {
    const status = task.status === 'Done' ? 'Pending' : 'Done'
    replace({ ...task, status, completedAt: status === 'Done' ? new Date().toISOString() : '' })
    try {
      const updated = await call('updateTask', { id: task.id, status })
      replace({ ...task, ...updated })
      if (status === 'Done') toast('Nice work. Task done.')
    } catch (e) {
      replace(task)
      toast(e.message, 'error')
    }
  }

  if (!tasks) return <SkeletonRows />

  return (
    <div className="stack" style={{ gap: 12 }}>
      <Segmented
        label="Filter tasks"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map(([f, fn]) => ({ value: f, label: f, count: list.filter(fn).length }))}
      />
      {list.length > 6 && (
        <label className="search">
          <MagnifyingGlass size={18} />
          <input type="search" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
        </label>
      )}

      {groups.length === 0 ? (
        q ? (
          <EmptyState icon={MagnifyingGlass} title="No matches" text={`Nothing found for "${q}".`} />
        ) : filter === 'Done' ? (
          <EmptyState icon={Tray} title="Nothing finished yet" text="Completed tasks will show up here." />
        ) : (
          <EmptyState icon={CheckCircle} title="All caught up" text={emptyText || 'No open tasks right now.'} />
        )
      ) : (
        groups.map(([name, items]) => (
          <section key={name}>
            <h3 className={'task-group-title' + (name === 'Overdue' ? ' red' : '')}>
              {name} <small>{items.length}</small>
            </h3>
            <div className="group">
              <AnimatePresence initial={false}>
                {items.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    showAssignee={showAssignee}
                    canToggle={canManageTask(user, t) || t.assignedTo === user.id}
                    onToggle={toggle}
                    onOpen={(x) => setOpenId(x.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </section>
        ))
      )}

      <TaskSheet task={opened} onClose={() => setOpenId(null)} onChange={replace} onDelete={remove} />
    </div>
  )
}
