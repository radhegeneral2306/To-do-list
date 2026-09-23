import TaskList from '../components/TaskList.jsx'
import { useApi } from '../utils.js'

export default function MyTasks() {
  const { data, setData, error, loading, reload } = useApi('listTasks', { mine: true })

  return (
    <>
      <div className="page-head">
        <h2>My Tasks</h2>
        <button className="btn-link" onClick={reload} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {data && <TaskList tasks={data} setTasks={setData} />}
    </>
  )
}
