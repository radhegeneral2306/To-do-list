import { useEffect, useMemo, useState } from 'react'
import { Buildings, CaretRight, MagnifyingGlass, Plus, UserPlus } from '@phosphor-icons/react'
import { call } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import LargeTitle from '../components/LargeTitle.jsx'
import { Avatar, ErrorText, Segmented, Sheet, SkeletonRows, useToast } from '../components/ui.jsx'
import { ROLE_LABELS } from '../utils.js'
import { update, useQuery } from '../data.js'

const patchUser = (u) => update('listUsers', {}, (list) => list.map((x) => (x.id === u.id ? u : x)))

const ROLE_OPTIONS = [
  { value: 'user', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'partner', label: 'Partner' },
  { value: 'admin', label: 'Admin' },
]
const needsBranch = (role) => role === 'manager' || role === 'user'

function BranchSelect({ branches, value, onChange }) {
  return (
    <label className="field">
      <span>Branch</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Choose branch</option>
        {branches.map((b) => <option key={b}>{b}</option>)}
      </select>
    </label>
  )
}

/** Add a new person. */
function AddUserSheet({ open, onClose, branches }) {
  const toast = useToast()
  const EMPTY = { name: '', username: '', password: '', role: 'user', branch: '' }
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => { if (open) { setForm(EMPTY); setError('') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const u = await call('createUser', form)
      update('listUsers', {}, (list) => [...list, u])
      toast(`${form.name} added. Share the login with them.`)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add Person">
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <label className="field">
          <span>Full name</span>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </label>
        <label className="field">
          <span>Username</span>
          <input
            className="input"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e.g. raipur.ramesh"
            value={form.username}
            onChange={(e) => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
            required
          />
        </label>
        <label className="field">
          <span>Password (min 6 characters)</span>
          <input className="input" value={form.password} minLength={6} onChange={(e) => set('password', e.target.value)} required />
        </label>
        <div className="field">
          <span>Role</span>
          <Segmented label="Role" value={form.role} onChange={(v) => set('role', v)} options={ROLE_OPTIONS} />
        </div>
        {needsBranch(form.role) && <BranchSelect branches={branches} value={form.branch} onChange={(v) => set('branch', v)} />}
        <ErrorText>{error}</ErrorText>
        <button className="btn block" disabled={busy}>{busy ? 'Adding…' : 'Add Person'}</button>
      </form>
    </Sheet>
  )
}

/** Edit role/branch, reset password, disable. */
function UserSheet({ person, onClose, branches, meId }) {
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [pw, setPw] = useState('')

  useEffect(() => {
    if (person) setForm({ name: person.name, role: person.role, branch: person.branch === 'All' ? '' : person.branch })
    setPw('')
  }, [person])

  // Close right away; the server's answer arrives as a toast. (Not queued: these are
  // security changes, so "done" is only shown once the server has really done them.)
  function background(fn, okMessage) {
    const who = person.name
    onClose()
    fn()
      .then(() => toast(okMessage))
      .catch((e) => toast(`${who}: ${e.message}`, 'error'))
  }

  const isMe = person?.id === meId

  return (
    <Sheet open={!!person} onClose={onClose} title="Edit Person">
      {person && form && (
        <div className="stack" style={{ gap: 18 }}>
          <div className="row" style={{ gap: 14 }}>
            <Avatar name={person.name} size={56} />
            <div className="grow">
              <div className="sheet-title-lg">{person.name}</div>
              <div className="muted">@{person.username}{person.active ? '' : ' (disabled)'}</div>
            </div>
          </div>

          <form
            className="stack"
            style={{ gap: 14 }}
            onSubmit={(e) => {
              e.preventDefault()
              background(() => call('updateUser', { id: person.id, ...form }).then(patchUser), `${form.name} saved`)
            }}
          >
            <label className="field">
              <span>Full name</span>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <div className="field">
              <span>Role</span>
              <Segmented label="Role" value={form.role} onChange={(v) => setForm({ ...form, role: v })} options={ROLE_OPTIONS} />
            </div>
            {needsBranch(form.role) && <BranchSelect branches={branches} value={form.branch} onChange={(v) => setForm({ ...form, branch: v })} />}
            <button className="btn block">Save Changes</button>
          </form>

          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault()
              background(() => call('resetPassword', { id: person.id, newPassword: pw }), `Password changed for ${person.name}`)
            }}
          >
            <span>New password</span>
            <div className="row">
              <input className="input grow" value={pw} minLength={6} placeholder="Min 6 characters" onChange={(e) => setPw(e.target.value)} required />
              <button className="btn secondary">Set</button>
            </div>
          </form>

          {!isMe && (
            <button
              className={'btn block ' + (person.active ? 'danger' : 'secondary')}
              onClick={() => {
                background(() => call('updateUser', { id: person.id, active: !person.active }).then(patchUser), person.active ? `${person.name} disabled` : `${person.name} enabled`)
              }}
            >
              {person.active ? 'Disable Account' : 'Enable Account'}
            </button>
          )}
        </div>
      )}
    </Sheet>
  )
}

function AddBranchSheet({ open, onClose }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setName(''); setError('') } }, [open])

  return (
    <Sheet open={open} onClose={onClose} title="Add Branch">
      <form
        className="stack"
        style={{ gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            const list = await call('addBranch', { name })
            update('listBranches', {}, () => list)
            toast(`${name} branch added`)
            onClose()
          } catch (err) {
            setError(err.message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="field">
          <span>Branch name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <ErrorText>{error}</ErrorText>
        <button className="btn block" disabled={busy}>Add Branch</button>
      </form>
    </Sheet>
  )
}

export default function Team() {
  const { user } = useAuth()
  const users = useQuery('listUsers')
  const branches = useQuery('listBranches')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [addingBranch, setAddingBranch] = useState(false)
  const [editId, setEditId] = useState(null)

  const branchList = branches.data || []
  const all = users.data || []
  const editing = all.find((u) => u.id === editId) || null

  const groups = useMemo(() => {
    const text = q.trim().toLowerCase()
    const list = all.filter((u) => !text || `${u.name} ${u.username} ${u.branch}`.toLowerCase().includes(text))
    return [['Admins & Partners', 'All'], ...branchList.map((b) => [b, b])]
      .map(([label, key]) => [label, list.filter((u) => u.branch === key).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name))])
      .filter(([, l]) => l.length)
  }, [all, branchList, q])

  return (
    <>
      <LargeTitle
        title="Team"
        subtitle={users.data ? `${all.filter((u) => u.active).length} active people` : ' '}
        actions={
          <button className="icon-btn glass" aria-label="Add person" onClick={() => setAdding(true)}>
            <UserPlus size={20} weight="bold" />
          </button>
        }
      />

      <label className="search" style={{ marginBottom: 8 }}>
        <MagnifyingGlass size={18} />
        <input type="search" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      </label>
      <ErrorText>{users.error}</ErrorText>

      {!users.data ? (
        <div className="section"><SkeletonRows rows={5} /></div>
      ) : (
        groups.map(([label, list]) => (
          <section className="section" key={label} style={{ marginTop: 22 }}>
            <h2 className="section-title">{label}<span>{list.length}</span></h2>
            <div className="group">
              {list.map((u) => (
                <button key={u.id} className="cell" style={{ '--inset': '68px', opacity: u.active ? 1 : 0.55 }} onClick={() => setEditId(u.id)}>
                  <Avatar name={u.name} size={40} />
                  <div className="grow">
                    <div className="cell-title">{u.name}{u.id === user.id ? ' (you)' : ''}</div>
                    <div className="cell-sub">{ROLE_LABELS[u.role]} · @{u.username}</div>
                  </div>
                  {!u.active && <span className="badge gray">Disabled</span>}
                  <CaretRight size={16} weight="bold" className="chev" />
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      <section className="section">
        <h2 className="section-title">Branches</h2>
        <div className="group">
          {branchList.map((b) => (
            <div key={b} className="cell" style={{ '--inset': '58px' }}>
              <span className="cell-icon" style={{ background: 'var(--accent)' }}><Buildings size={18} weight="fill" /></span>
              <span className="grow">{b}</span>
              <span className="muted" style={{ fontSize: 15 }}>{all.filter((u) => u.branch === b && u.active).length}</span>
            </div>
          ))}
          <button className="cell accent" style={{ '--inset': '58px' }} onClick={() => setAddingBranch(true)}>
            <span className="cell-icon" style={{ background: 'var(--fill)', color: 'var(--accent)' }}><Plus size={18} weight="bold" /></span>
            Add Branch
          </button>
        </div>
      </section>

      <AddUserSheet open={adding} onClose={() => setAdding(false)} branches={branchList} />
      <UserSheet person={editing} onClose={() => setEditId(null)} branches={branchList} meId={user.id} />
      <AddBranchSheet open={addingBranch} onClose={() => setAddingBranch(false)} />
    </>
  )
}
