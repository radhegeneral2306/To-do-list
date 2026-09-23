// Runs backend/Code.gs against the fake Google services and checks the permission rules.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createFakeGoogle, loadBackend } from '../src/mock/fakeGoogle.js'
import { sha256Bytes } from '../src/mock/sha256.js'

const source = readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8')

let api, data

// Call an action and return its data, or throw with the backend's error message.
const call = (action, payload = {}, token) => {
  const res = api.call(action, payload, token)
  if (!res.ok) throw new Error(res.error)
  return res.data
}
const login = (username, password = 'secret1') => call('login', { username, password }).token

let admin, raipurMgr, raipurUser, durgUser, partner
beforeEach(() => {
  data = {}
  api = loadBackend(source, createFakeGoogle(data))
  api.setup()
  admin = login('admin', 'admin123')
  const mk = (username, role, branch) =>
    call('createUser', { username, password: 'secret1', name: username, role, branch }, admin)
  mk('partner1', 'partner')
  mk('raipur.mgr', 'manager', 'Raipur')
  mk('raipur.emp', 'user', 'Raipur')
  mk('durg.emp', 'user', 'Durg')
  partner = login('partner1')
  raipurMgr = login('raipur.mgr')
  raipurUser = login('raipur.emp')
  durgUser = login('durg.emp')
})

const userId = (token, name) => call('listUsers', {}, token).find((u) => u.username === name).id

test('sha256 matches node crypto', () => {
  for (const s of ['', 'abc', 'x'.repeat(200), 'हिंदी']) {
    const hex = sha256Bytes(s).map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('')
    assert.equal(hex, createHash('sha256').update(s).digest('hex'))
  }
})

test('setup creates sheets, branches and admin', () => {
  assert.deepEqual(Object.keys(data).sort(), ['Branches', 'Sessions', 'Tasks', 'Users'])
  assert.deepEqual(call('listBranches', {}, admin), ['Raipur', 'Durg', 'Jagdalpur', 'Rajim', 'Kurud', 'Hardware'])
  // Password is never stored in plain text
  assert.ok(!JSON.stringify(data.Users).includes('admin123'))
})

test('wrong password and missing token are rejected', () => {
  assert.throws(() => login('admin', 'nope'), /Wrong username or password/)
  assert.throws(() => call('listTasks', {}), /Please login/)
  assert.throws(() => call('listTasks', {}, 'fake-token'), /Session expired/)
})

test('manager can assign only inside own branch', () => {
  const emp = userId(admin, 'raipur.emp')
  const durg = userId(admin, 'durg.emp')
  const t = call('createTask', { title: 'Stock check', branch: 'Raipur', assignedTo: emp }, raipurMgr)
  assert.equal(t.status, 'Pending')
  assert.throws(() => call('createTask', { title: 'x', branch: 'Durg', assignedTo: durg }, raipurMgr), /own branch/)
  assert.throws(() => call('createTask', { title: 'x', branch: 'Raipur', assignedTo: durg }, raipurMgr), /not in Raipur/)
})

test('normal user cannot assign or list users', () => {
  const emp = userId(admin, 'raipur.emp')
  assert.throws(() => call('createTask', { title: 'x', branch: 'Raipur', assignedTo: emp }, raipurUser), /Only Admin/)
  assert.throws(() => call('listUsers', {}, raipurUser), /Only Admin/)
  assert.throws(() => call('createUser', { username: 'hack', password: 'secret1', name: 'h', role: 'admin' }, raipurMgr), /Only Admin or Partner/)
})

test('visibility: admin/partner all, manager branch, user own', () => {
  const emp = userId(admin, 'raipur.emp')
  const durg = userId(admin, 'durg.emp')
  call('createTask', { title: 'R1', branch: 'Raipur', assignedTo: emp }, admin)
  call('createTask', { title: 'D1', branch: 'Durg', assignedTo: durg }, partner)

  assert.equal(call('listTasks', {}, admin).length, 2)
  assert.equal(call('listTasks', {}, partner).length, 2)
  assert.deepEqual(call('listTasks', { branch: 'Durg' }, admin).map((t) => t.title), ['D1'])
  assert.deepEqual(call('listTasks', {}, raipurMgr).map((t) => t.title), ['R1'])
  assert.deepEqual(call('listTasks', {}, raipurUser).map((t) => t.title), ['R1'])
  assert.deepEqual(call('listTasks', {}, durgUser).map((t) => t.title), ['D1'])
  // A user asking for another branch still gets only their own tasks
  assert.deepEqual(call('listTasks', { branch: 'Raipur' }, durgUser).map((t) => t.title), ['D1'])
})

test('user can change status/remarks of own task only, nothing else', () => {
  const emp = userId(admin, 'raipur.emp')
  const t = call('createTask', { title: 'R1', branch: 'Raipur', assignedTo: emp, priority: 'High' }, admin)
  const u = call('updateTask', { id: t.id, status: 'Done', remarks: 'ok', title: 'hacked', priority: 'Low' }, raipurUser)
  assert.equal(u.status, 'Done')
  assert.equal(u.remarks, 'ok')
  assert.ok(u.completedAt)
  assert.equal(u.title, 'R1')
  assert.equal(u.priority, 'High')
  assert.throws(() => call('updateTask', { id: t.id, status: 'Pending' }, durgUser), /cannot edit/)
  assert.throws(() => call('deleteTask', { id: t.id }, raipurUser), /cannot delete/)
})

test('manager cannot touch other branch tasks', () => {
  const durg = userId(admin, 'durg.emp')
  const t = call('createTask', { title: 'D1', branch: 'Durg', assignedTo: durg }, admin)
  assert.throws(() => call('updateTask', { id: t.id, status: 'Done' }, raipurMgr), /cannot edit/)
  assert.throws(() => call('deleteTask', { id: t.id }, raipurMgr), /cannot delete/)
  call('deleteTask', { id: t.id }, admin)
  assert.equal(call('listTasks', {}, admin).length, 0)
})

test('disabled user is logged out and cannot log in', () => {
  const emp = userId(admin, 'raipur.emp')
  call('updateUser', { id: emp, active: false }, admin)
  assert.throws(() => call('listTasks', {}, raipurUser), /Account disabled/)
  assert.throws(() => login('raipur.emp'), /Wrong username or password/)
})

test('admin cannot lock themselves out', () => {
  const me = call('me', {}, admin)
  assert.throws(() => call('updateUser', { id: me.id, active: false }, admin), /own account/)
  assert.throws(() => call('updateUser', { id: me.id, role: 'user', branch: 'Raipur' }, admin), /own admin/)
})

test('password change keeps current session, reset logs user out', () => {
  call('changePassword', { oldPassword: 'secret1', newPassword: 'newpass1' }, raipurUser)
  call('me', {}, raipurUser)
  login('raipur.emp', 'newpass1')
  call('resetPassword', { id: userId(admin, 'raipur.emp'), newPassword: 'reset123' }, admin)
  assert.throws(() => call('me', {}, raipurUser), /Session expired/)
  login('raipur.emp', 'reset123')
})

test('text that looks like a formula or date is stored as plain text', () => {
  const emp = userId(admin, 'raipur.emp')
  const t = call('createTask', { title: '=HYPERLINK("x")', branch: 'Raipur', assignedTo: emp, dueDate: '2026-10-01' }, admin)
  const row = data.Tasks.find((r) => r[0] === t.id)
  // fake sheet strips the leading apostrophe exactly like Google Sheets does
  assert.equal(row[1], '=HYPERLINK("x")')
  assert.equal(call('listTasks', {}, admin)[0].dueDate, '2026-10-01')
  assert.throws(() => call('createTask', { title: 'x', branch: 'Raipur', assignedTo: emp, dueDate: '1/10/26' }, admin), /YYYY-MM-DD/)
})

test('logout kills the token', () => {
  call('logout', {}, durgUser)
  assert.throws(() => call('me', {}, durgUser), /Session expired/)
})
