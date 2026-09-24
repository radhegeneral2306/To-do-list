import { useEffect, useRef, useState } from 'react'
import { PencilSimple, Trash } from '@phosphor-icons/react'
import { mutateTask } from '../data.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { PRIORITIES, STATUSES, canManageTask, formatDate, isOverdue, relativeDue } from '../utils.js'
import { ErrorText, Segmented, Sheet, useToast } from './ui.jsx'

/** Task details: change status, write remarks, and (for managers) edit or delete. */
export default function TaskSheet({ task, onClose }) {
  const { user } = useAuth()
  const toast = useToast()
  const [remarks, setRemarks] = useState('')
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!task) return
    setRemarks(task.remarks || '')
    setEdit(null)
    setError('')
    setConfirmDelete(false)
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep showing the last task while the sheet slides away.
  const last = useRef(task)
  if (task) last.current = task
  const t = last.current
  const manage = t && canManageTask(user, t)
  const canUpdate = t && (manage || t.assignedTo === user.id)

  // Changes show at once; the Sheet is updated in the background (undone with a message if it fails).
  function save(changes, message) {
    setError('')
    try {
      mutateTask('update', { id: t.id, ...changes }, user, `update "${t.title}"`)
      if (message) toast(message)
      return true
    } catch (e) {
      setError(e.message)
      return false
    }
  }

  function remove() {
    try {
      mutateTask('delete', { id: t.id }, user, `delete "${t.title}"`)
      toast('Task deleted')
      onClose()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <Sheet open={!!task} onClose={onClose} title={edit ? 'Edit Task' : 'Task'}>
      {t && (
        <div className="stack" style={{ gap: 18 }}>
          {edit ? (
            <form
              className="stack"
              style={{ gap: 14 }}
              onSubmit={async (e) => {
                e.preventDefault()
                if (save(edit, 'Task updated')) setEdit(null)
              }}
            >
              <label className="field">
                <span>Title</span>
                <input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required maxLength={200} />
              </label>
              <label className="field">
                <span>Details</span>
                <textarea className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </label>
              <div className="field">
                <span>Priority</span>
                <Segmented label="Priority" value={edit.priority} onChange={(v) => setEdit({ ...edit, priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
              </div>
              <label className="field">
                <span>Due date</span>
                <input className="input" type="date" value={edit.dueDate} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} />
              </label>
              <ErrorText>{error}</ErrorText>
              <button className="btn block">Save Changes</button>
              <button type="button" className="btn block secondary" onClick={() => setEdit(null)}>Cancel</button>
            </form>
          ) : (
            <>
              <div>
                <h3 className="sheet-title-lg">{t.title}</h3>
                {t.description && <p className="muted" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{t.description}</p>}
              </div>

              {canUpdate && (
                <div className="field">
                  <span>Status</span>
                  <Segmented
                    label="Status"
                    value={t.status}
                    onChange={(v) => v !== t.status && save({ status: v }, v === 'Done' ? 'Marked as done' : `Moved to ${v}`)}
                    options={STATUSES.map((s) => ({ value: s, label: s }))}
                  />
                </div>
              )}

              <dl className="detail-grid" style={{ margin: 0 }}>
                <div><dt>Assigned to</dt><dd>{t.assignedToName}</dd></div>
                <div><dt>Branch</dt><dd>{t.branch}</dd></div>
                <div>
                  <dt>Due</dt>
                  <dd className={isOverdue(t) ? 'red' : ''}>{t.dueDate ? relativeDue(t.dueDate) : 'No date'}</dd>
                </div>
                <div><dt>Priority</dt><dd>{t.priority}</dd></div>
                <div><dt>Assigned by</dt><dd>{t.assignedByName}</dd></div>
                <div><dt>{t.completedAt ? 'Completed' : 'Created'}</dt><dd>{formatDate(t.completedAt || t.createdAt)}</dd></div>
              </dl>

              {canUpdate ? (
                <div className="field">
                  <span>Remarks</span>
                  <textarea className="input" placeholder="Add an update for your manager" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                  {remarks !== (t.remarks || '') && (
                    <button className="btn block" onClick={() => save({ remarks }, 'Remarks saved')}>
                      Save Remarks
                    </button>
                  )}
                </div>
              ) : (
                t.remarks && <div className="field"><span>Remarks</span><p>{t.remarks}</p></div>
              )}

              <ErrorText>{error}</ErrorText>

              {manage && (
                <div className="group">
                  <button
                    className="cell accent"
                    onClick={() => setEdit({ title: t.title, description: t.description, priority: t.priority, dueDate: t.dueDate })}
                  >
                    <PencilSimple size={20} /> Edit Task
                  </button>
                  {confirmDelete ? (
                    <button className="cell danger" onClick={remove}>
                      <Trash size={20} weight="fill" /> Tap again to delete
                    </button>
                  ) : (
                    <button className="cell danger" onClick={() => setConfirmDelete(true)}>
                      <Trash size={20} /> Delete Task
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}
