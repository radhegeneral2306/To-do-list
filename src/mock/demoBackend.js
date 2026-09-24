// DEMO mode: runs the real backend/Code.gs in the browser against a fake sheet kept in localStorage.
import source from '../../backend/Code.gs?raw'
import { createFakeGoogle, loadBackend } from './fakeGoogle.js'

const DB_KEY = 'taskapp_demo_db'

function loadData() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || null } catch { return null }
}

function saveData(data) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(data)) } catch { /* demo data lives only in memory */ }
}

const stored = loadData()
const data = stored || {}
let dirty = false
const backend = loadBackend(source, createFakeGoogle(data, () => { dirty = true }))
if (!stored) seed()

function seed() {
  backend.setup()
  const ok = (res) => { if (!res.ok) throw new Error(res.error); return res.data }
  const admin = ok(backend.call('login', { username: 'admin', password: 'admin123' })).token
  const branches = ok(backend.call('listBranches', {}, admin))
  const mk = (username, name, role, branch) =>
    ok(backend.call('createUser', { username, password: 'demo123', name, role, branch }, admin))

  mk('partner', 'Partner Demo', 'partner')
  const staff = {}
  for (const b of branches) {
    const key = b.toLowerCase()
    mk(`${key}.manager`, `${b} Manager`, 'manager', b)
    staff[b] = [mk(`${key}.staff1`, `${b} Staff 1`, 'user', b), mk(`${key}.staff2`, `${b} Staff 2`, 'user', b)]
  }

  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  const samples = [
    ['Daily stock count', 'Count fast-moving items and update register', 'High', 0],
    ['Call pending payment parties', 'List is in the due register', 'Medium', 2],
    ['Clean display area', '', 'Low', -1],
    ['Send monthly sales report', 'Share PDF with head office', 'High', 5],
  ]
  branches.forEach((b, i) => {
    samples.forEach(([title, description, priority, due], j) => {
      const t = ok(backend.call('createTask', {
        title, description, priority, branch: b, dueDate: day(due + i), assignedTo: staff[b][j % 2].id,
      }, admin))
      if (j === 2) ok(backend.call('updateTask', { id: t.id, status: 'Done', remarks: 'Done in the morning' }, admin))
      if (j === 1) ok(backend.call('updateTask', { id: t.id, status: 'In Progress' }, admin))
    })
  })
  ok(backend.call('logout', {}, admin))
  saveData(data)
}

export async function call(action, payload, token) {
  await new Promise((r) => setTimeout(r, 1200)) // about as slow as a real Apps Script call
  const res = backend.call(action, payload, token)
  if (dirty) { saveData(data); dirty = false }
  return res
}

export function resetDemo() {
  try { localStorage.removeItem(DB_KEY) } catch { /* ignore */ }
}
