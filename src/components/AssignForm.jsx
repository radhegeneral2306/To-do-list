import { useState } from 'react'
import { CheckCircle, Circle } from '@phosphor-icons/react'
import { call } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { PRIORITIES, ROLE_LABELS, addDays, isTop } from '../utils.js'
import { insertTask, useQuery } from '../data.js'
import { Avatar, ErrorText, Segmented, SkeletonRows, useToast } from './ui.jsx'

const DUE_CHIPS = [
  ['None', () => ''],
  ['Today', () => addDays(0)],
  ['Tomorrow', () => addDays(1)],
  ['Next Week', () => addDays(7)],
]
const EMPTY = { title: '', description: '', assignedTo: '', priority: 'Medium', dueDate: '' }

/** Branch → person → what + when. Used inside the (+) sheet and on the /assign page. */
export default function AssignForm({ onDone }) {
  const { user } = useAuth()
  const toast = useToast()
  const top = isTop(user)
  const [branch, setBranch] = useState(top ? '' : user.branch)
  const [form, setForm] = useState(EMPTY)
  const [pickDate, setPickDate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const branches = useQuery('listBranches')
  const users = useQuery('listUsers')

  const active = (users.data || []).filter((u) => u.active)
  const people = [...active.filter((u) => u.branch === branch), ...active.filter((u) => u.branch === 'All')]
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const dueChip = DUE_CHIPS.find(([, fn]) => fn() === form.dueDate)?.[0]

  async function submit(e) {
    e.preventDefault()
    if (!form.assignedTo) return setError('Choose who should do this task.')
    setBusy(true)
    setError('')
    try {
      const t = await call('createTask', { ...form, branch })
      const who = active.find((u) => u.id === t.assignedTo)
      toast(`Assigned to ${who?.name || 'team member'}`)
      insertTask(t, user)
      setForm({ ...EMPTY, priority: form.priority })
      setPickDate(false)
      onDone?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={submit}>
      <div className="field">
        <span>Branch</span>
        {top ? (
          <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
            {(branches.data || []).map((b) => (
              <button
                type="button"
                key={b}
                className={'chip' + (b === branch ? ' active' : '')}
                onClick={() => { setBranch(b); set('assignedTo', '') }}
              >
                {b}
              </button>
            ))}
          </div>
        ) : (
          <div className="input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>{branch}</div>
        )}
      </div>

      {branch && (
        <div className="field">
          <span>Assign to</span>
          {!users.data ? (
            <SkeletonRows rows={3} />
          ) : people.length === 0 ? (
            <p className="notice">No one in {branch} yet. Add people from the Team tab.</p>
          ) : (
            <div className="group" role="radiogroup" aria-label="Assign to">
              {people.map((u) => {
                const on = form.assignedTo === u.id
                return (
                  <button type="button" role="radio" aria-checked={on} key={u.id} className="cell" style={{ '--inset': '68px' }} onClick={() => set('assignedTo', u.id)}>
                    <Avatar name={u.name} size={40} />
                    <div className="grow">
                      <div className="cell-title">{u.name}</div>
                      <div className="cell-sub">{ROLE_LABELS[u.role]}</div>
                    </div>
                    {on ? <CheckCircle size={26} weight="fill" color="var(--accent)" /> : <Circle size={26} color="var(--text-3)" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <label className="field">
        <span>Task</span>
        <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="What needs to be done?" required maxLength={200} />
      </label>
      <label className="field">
        <span>Details (optional)</span>
        <textarea className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Anything they should know" />
      </label>

      <div className="field">
        <span>Priority</span>
        <Segmented label="Priority" value={form.priority} onChange={(v) => set('priority', v)} options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
      </div>

      <div className="field">
        <span>Due</span>
        <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
          {DUE_CHIPS.map(([label, fn]) => (
            <button type="button" key={label} className={'chip' + (!pickDate && dueChip === label ? ' active' : '')} onClick={() => { setPickDate(false); set('dueDate', fn()) }}>
              {label}
            </button>
          ))}
          <button type="button" className={'chip' + (pickDate || (form.dueDate && !dueChip) ? ' active' : '')} onClick={() => setPickDate(true)}>
            Pick Date
          </button>
        </div>
        {(pickDate || (form.dueDate && !dueChip)) && (
          <input className="input" type="date" min={addDays(0)} value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} aria-label="Due date" />
        )}
      </div>

      <ErrorText>{error || users.error}</ErrorText>
      <button className="btn block" disabled={busy || !branch}>{busy ? 'Assigning…' : 'Assign Task'}</button>
    </form>
  )
}
