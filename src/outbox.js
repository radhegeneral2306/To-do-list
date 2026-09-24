// Pure helpers for the outbox (pending task changes). No browser APIs here, so they can be unit-tested.
//
// An op looks like:
//   { opId, type: 'createTask' | 'updateTask' | 'deleteTask', taskId, payload, view?, at, label }
// - payload: exactly what is sent to the server
// - view:    for createTask, the full task to show on screen until the server confirms

/** Does this task belong in a cached list fetched with `payload`? (mirrors listTasks_ on the server) */
export function taskBelongs(task, payload, meId) {
  if (payload.mine) return task.assignedTo === meId
  return !payload.branch || payload.branch === 'All' || payload.branch === task.branch
}

/**
 * What the screen shows: the server's list with every pending op re-applied in order.
 * Rebuilding from the server copy each time means dropping one failed op never undoes the others.
 */
export function applyOps(list, ops, payload, meId) {
  if (!ops.length) return list
  let out = list
  for (const op of ops) {
    if (op.type === 'createTask') {
      if (taskBelongs(op.view, payload, meId) && !out.some((t) => t.id === op.taskId)) out = [...out, op.view]
    } else if (op.type === 'updateTask') {
      out = out.map((t) => (t.id === op.taskId ? patchTask(t, op.payload, op.at) : t))
    } else if (op.type === 'deleteTask') {
      out = out.filter((t) => t.id !== op.taskId)
    }
  }
  return out
}

/** Same rules as updateTask_ on the server for the fields the screen shows. */
function patchTask(task, changes, at) {
  const { id, ...rest } = changes
  const next = { ...task, ...rest, updatedAt: at }
  if (rest.status === 'Done' && task.status !== 'Done') next.completedAt = at
  if (rest.status && rest.status !== 'Done') next.completedAt = ''
  return next
}

/** After a create fails, every later op on that task is pointless: drop them too. */
export function dropDependents(ops, failedOp) {
  if (failedOp.type !== 'createTask') return ops
  return ops.filter((o) => o.taskId !== failedOp.taskId)
}

/** An old backend may give a new task its own id: point pending ops at the real one. */
export function remapId(ops, from, to) {
  return ops.map((o) => (o.taskId === from ? { ...o, taskId: to, payload: { ...o.payload, id: to } } : o))
}

/** Client-made task id, matching the server's /^T[a-z0-9]{8,32}$/i rule. */
export function newTaskId() {
  let r = ''
  for (let i = 0; i < 6; i++) r += Math.floor(Math.random() * 36).toString(36)
  return 'T' + Date.now().toString(36) + r
}

export const newOpId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
