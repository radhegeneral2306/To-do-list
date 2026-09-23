import { ArrowClockwise } from '@phosphor-icons/react'
import LargeTitle from '../components/LargeTitle.jsx'
import TaskList from '../components/TaskList.jsx'
import { ErrorText } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { isOverdue, useApi } from '../utils.js'

export function RefreshButton({ loading, onClick }) {
  return (
    <button className="icon-btn glass" onClick={onClick} disabled={loading} aria-label="Refresh">
      <ArrowClockwise size={20} weight="bold" className={loading ? 'spin' : ''} />
    </button>
  )
}

export default function MyTasks() {
  const { user } = useAuth()
  const { data, setData, error, loading, reload } = useApi('listTasks', { mine: true })

  const open = (data || []).filter((t) => t.status !== 'Done').length
  const overdue = (data || []).filter(isOverdue).length
  const subtitle = !data ? ' ' : open === 0 ? 'Nothing pending. Great job.' : `${open} open${overdue ? `, ${overdue} overdue` : ''}`

  return (
    <>
      <LargeTitle title="My Tasks" subtitle={subtitle} actions={<RefreshButton loading={loading} onClick={reload} />} />
      <ErrorText>{error}</ErrorText>
      <TaskList tasks={data} setTasks={setData} emptyText={`You're all caught up, ${user.name.split(' ')[0]}.`} />
    </>
  )
}
