import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyOps, dropDependents, newTaskId, remapId, taskBelongs } from '../src/outbox.js'

const me = 'U1'
const base = [
  { id: 'T1', title: 'A', status: 'Pending', branch: 'Raipur', assignedTo: 'U2', completedAt: '' },
  { id: 'T2', title: 'B', status: 'Pending', branch: 'Durg', assignedTo: me, completedAt: '' },
]
const op = (type, taskId, payload = {}, extra = {}) => ({ opId: type + taskId + Math.random(), type, taskId, payload: { id: taskId, ...payload }, at: '2026-09-24T10:00:00.000Z', ...extra })

test('pending ops are re-applied on top of the server list', () => {
  const ops = [op('updateTask', 'T1', { status: 'Done' }), op('deleteTask', 'T2')]
  const view = applyOps(base, ops, {}, me)
  assert.deepEqual(view.map((t) => [t.id, t.status]), [['T1', 'Done']])
  assert.equal(view[0].completedAt, '2026-09-24T10:00:00.000Z')
  assert.equal(base.length, 2) // server copy untouched
})

test('dropping a failed op keeps the other pending change on the same task', () => {
  const a = op('updateTask', 'T1', { status: 'In Progress' })
  const b = op('updateTask', 'T1', { remarks: 'note' })
  const afterAFails = applyOps(base, [b], {}, me)
  assert.equal(afterAFails[0].status, 'Pending') // A undone
  assert.equal(afterAFails[0].remarks, 'note') // B kept
  assert.equal(applyOps(base, [a, b], {}, me)[0].status, 'In Progress')
})

test('a refresh during a pending delete does not bring the task back', () => {
  const refreshed = [...base, { id: 'T3', title: 'C', status: 'Pending', branch: 'Raipur', assignedTo: 'U2' }]
  const view = applyOps(refreshed, [op('deleteTask', 'T1')], {}, me)
  assert.deepEqual(view.map((t) => t.id), ['T2', 'T3'])
})

test('creates only show in lists they belong to, never twice', () => {
  const task = { id: 'Tnew', title: 'N', status: 'Pending', branch: 'Raipur', assignedTo: 'U2' }
  const c = op('createTask', 'Tnew', {}, { view: task })
  assert.equal(applyOps(base, [c], { branch: 'Raipur' }, me).length, 3)
  assert.equal(applyOps(base, [c], { branch: 'Durg' }, me).length, 2)
  assert.equal(applyOps(base, [c], { mine: true }, me).length, 2)
  assert.equal(applyOps([...base, task], [c], {}, me).length, 3) // server already has it
})

test('a failed create drops its follow-up ops only', () => {
  const c = op('createTask', 'Tnew', {}, { view: { id: 'Tnew' } })
  const ops = [c, op('updateTask', 'Tnew', { status: 'Done' }), op('updateTask', 'T1', { remarks: 'x' })]
  assert.deepEqual(dropDependents(ops, c).map((o) => o.taskId), ['T1'])
  assert.equal(dropDependents(ops, ops[2]).length, 3)
})

test('id remap updates pending ops and their payloads', () => {
  const ops = remapId([op('updateTask', 'Ttmp', { status: 'Done' }), op('deleteTask', 'T1')], 'Ttmp', 'Treal')
  assert.equal(ops[0].taskId, 'Treal')
  assert.equal(ops[0].payload.id, 'Treal')
  assert.equal(ops[1].taskId, 'T1')
})

test('client ids match the server rule and are unique', () => {
  const ids = new Set(Array.from({ length: 500 }, newTaskId))
  assert.equal(ids.size, 500)
  for (const id of ids) assert.match(id, /^T[a-z0-9]{8,32}$/i)
  assert.ok(taskBelongs({ assignedTo: me }, { mine: true }, me))
})
