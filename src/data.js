// Client data layer: cache-first, background refresh, saved on the device.
//
// - The Google Sheet (cloud) is the source of truth.
// - Every successful fetch is also saved to localStorage, per user, so the app opens instantly
//   and old data can still be read offline. It's wiped on logout.
// - Several requests made at the same moment are merged into one `bootstrap` call,
//   because each Apps Script round trip costs 1-2 seconds.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { call } from './api.js'
import { applyOps, dropDependents, newOpId, newTaskId, remapId, taskBelongs } from './outbox.js'

const STALE_MS = 30_000
const POLL_MS = 120_000
const PREFIX = 'taskapp_cache:'
const OUTBOX = 'taskapp_outbox:'
const BATCH = 20
const BACKOFF = [2000, 5000, 15000]

let scope = null // user id whose data is loaded
let entries = {} // key -> { data, at }
const listeners = new Map() // key -> Set<fn>
const inflight = new Map() // key -> Promise
let saveTimer = null

// ------------------------------------------------------------ online state
let online = typeof navigator === 'undefined' ? true : navigator.onLine
const onlineListeners = new Set()
function setOnline(v) {
  if (v === online) return
  online = v
  onlineListeners.forEach((fn) => fn())
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { setOnline(true); refreshAll() })
  window.addEventListener('offline', () => setOnline(false))
}
export function useOnline() {
  return useSyncExternalStore(
    (fn) => { onlineListeners.add(fn); return () => onlineListeners.delete(fn) },
    () => online,
  )
}

// ---------------------------------------------------------- persistence
/** Load this user's saved copy. Call on login / app start. */
export function setScope(userId) {
  if (scope === userId) return
  scope = userId
  entries = {}
  try { entries = JSON.parse(localStorage.getItem(PREFIX + userId)) || {} } catch { entries = {} }
  outbox = loadOutbox()
  outboxChanged()
  listeners.forEach((set) => set.forEach((fn) => fn()))
  kick()
}

/** Forget everything for this user (logout, disabled, session expired). */
export function clearScope() {
  try {
    if (scope) {
      localStorage.removeItem(PREFIX + scope)
      localStorage.removeItem(OUTBOX + scope)
    }
  } catch { /* ignore */ }
  scope = null
  entries = {}
  outbox = []
  outboxChanged()
  inflight.clear()
}

function persist() {
  if (!scope) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(PREFIX + scope, JSON.stringify(entries)) } catch { /* full or blocked: cloud still works */ }
  }, 300)
}

// ---------------------------------------------------------------- store
const keyOf = (action, payload = {}) => `${action}:${JSON.stringify(payload)}`
const parseKey = (key) => {
  const i = key.indexOf(':')
  return [key.slice(0, i), JSON.parse(key.slice(i + 1))]
}

function set(key, data) {
  const prev = entries[key]
  // Server sent exactly what we already show: just mark it fresh, no re-render.
  if (prev && JSON.stringify(prev.data) === JSON.stringify(data)) {
    prev.at = Date.now()
    persist()
    return
  }
  entries[key] = { data, at: Date.now() }
  persist()
  listeners.get(key)?.forEach((fn) => fn())
}

export function getData(action, payload) {
  return entries[keyOf(action, payload)]?.data
}

/** Change cached data in place (optimistic updates). fn(data) returns the new data. */
export function update(action, payload, fn) {
  const key = keyOf(action, payload)
  if (!entries[key]) return
  set(key, fn(entries[key].data))
}

/** Load the current user's session through the batcher (so it can share a request). */
export function fetchMe() {
  return fetchKey(keyOf('me', {}))
}

// --------------------------------------------------------------- fetching
const BATCHABLE = { me: true, listBranches: true, listUsers: true, listTasks: true }
let queue = []
let bootstrapWorks = true

function fetchKey(key) {
  if (inflight.has(key)) return inflight.get(key)
  const [action, payload] = parseKey(key)
  const startedAt = Date.now()
  const p = (BATCHABLE[action] ? enqueue(action, payload) : call(action, payload))
    .then((data) => {
      setOnline(true)
      // A task list read before our last change reached the Sheet is already out of date:
      // keep what we have and read again.
      if (action === 'listTasks' && startedAt < lastWriteAt) {
        setTimeout(() => listeners.get(key)?.size && fetchKey(key).catch(() => {}), 300)
        return entries[key]?.data ?? data
      }
      if (scope) set(key, data)
      return data
    })
    .catch((e) => {
      if (/Network problem/.test(e.message)) setOnline(false)
      throw e
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

function enqueue(action, payload) {
  return new Promise((resolve, reject) => {
    queue.push({ action, payload, resolve, reject })
    if (queue.length === 1) setTimeout(flush, 0)
  })
}

async function flush() {
  const q = queue
  queue = []
  const tasksReq = q.find((r) => r.action === 'listTasks')
  const merged = q.filter((r) => r.action !== 'listTasks' || r === tasksReq)
  const rest = q.filter((r) => !merged.includes(r))

  if (bootstrapWorks && merged.length >= 2) {
    try {
      const res = await call('bootstrap', {
        branches: merged.some((r) => r.action === 'listBranches'),
        users: merged.some((r) => r.action === 'listUsers'),
        tasks: tasksReq ? tasksReq.payload : null,
      })
      for (const r of merged) {
        const v = { me: res.me, listBranches: res.branches, listUsers: res.users, listTasks: res.tasks }[r.action]
        if (v === null || v === undefined) single(r) // e.g. employee asking for users: let the real call report it
        else r.resolve(v)
      }
    } catch (e) {
      if (/Unknown action/.test(e.message)) {
        bootstrapWorks = false // old backend still deployed: fall back to one call each
        merged.forEach(single)
      } else {
        merged.forEach((r) => r.reject(e))
      }
    }
  } else {
    merged.forEach(single)
  }
  rest.forEach(single)
}

function single(r) {
  call(r.action, r.payload).then(r.resolve, r.reject)
}

/** Refetch everything that is on screen. force=true ignores the 30 s freshness window. */
export function refreshAll(force = false) {
  for (const key of listeners.keys()) {
    if (!listeners.get(key).size) continue
    const e = entries[key]
    if (force || !e || Date.now() - e.at > STALE_MS) fetchKey(key).catch(() => {})
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { refreshAll(); kick() }
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') refreshAll()
  }, POLL_MS)
  // While offline, check every 15 s whether the connection is back.
  setInterval(() => {
    if (!online && document.visibilityState === 'visible') { refreshAll(true); kick() }
  }, 15_000)
}

// ================================================================= OUTBOX
// Task changes show on screen at once and are sent to the Sheet in the background.
// Screen = server copy + pending ops (see outbox.js). Ops are saved per user, so they
// survive closing the app, and are sent in order by one worker (one tab at a time).

let outbox = []
let outboxVersion = 0
const pendingListeners = new Set()
let notifier = () => {}
let lastWriteAt = 0
let workerRunning = false
let applyOpsWorks = true
const idMap = new Map() // temp id -> real id (only with an old backend)

/** Where sync results are reported (the toast). */
export function setNotifier(fn) { notifier = fn }

function loadOutbox() {
  if (!scope) return []
  try { return JSON.parse(localStorage.getItem(OUTBOX + scope)) || [] } catch { return [] }
}

function saveOutbox(list) {
  outbox = list
  if (scope) {
    try { localStorage.setItem(OUTBOX + scope, JSON.stringify(list)) } catch { /* storage full: still kept in memory */ }
  }
  outboxChanged()
}

function outboxChanged() {
  outboxVersion++
  for (const [key, set] of listeners) if (key.startsWith('listTasks:')) set.forEach((fn) => fn())
  pendingListeners.forEach((fn) => fn())
}

if (typeof window !== 'undefined') {
  // Another tab changed the outbox.
  window.addEventListener('storage', (e) => {
    if (scope && e.key === OUTBOX + scope) { outbox = loadOutbox(); outboxChanged(); kick() }
  })
  window.addEventListener('online', () => kick())
}

/** Number of changes not yet saved to the Sheet. */
export function usePending() {
  return useSyncExternalStore(
    (fn) => { pendingListeners.add(fn); return () => pendingListeners.delete(fn) },
    () => outbox.length,
  )
}

/** Follow a temp id to the real one (old backend only). */
export const resolveId = (id) => idMap.get(id) || id

/**
 * Make a task change right now on screen and queue it for the Sheet.
 * kind: 'create' | 'update' | 'delete'. Throws if offline (online-only by design).
 * Returns the task id.
 */
export function mutateTask(kind, data, me, label) {
  if (!online) throw new Error('No internet. Change not saved.')
  if (!scope) throw new Error('Please login again.')
  const at = new Date().toISOString()
  let op
  if (kind === 'create') {
    const id = newTaskId()
    const users = entries[keyOf('listUsers', {})]?.data || []
    const name = (uid) => users.find((u) => u.id === uid)?.name || (uid === me.id ? me.name : '')
    const payload = {
      id,
      title: data.title,
      description: data.description || '',
      branch: data.branch,
      assignedTo: data.assignedTo,
      priority: data.priority,
      dueDate: data.dueDate || '',
    }
    const view = {
      ...payload,
      assignedBy: me.id,
      status: 'Pending',
      remarks: '',
      createdAt: at,
      updatedAt: at,
      completedAt: '',
      assignedToName: name(data.assignedTo),
      assignedByName: me.name,
    }
    op = { type: 'createTask', taskId: id, payload, view }
  } else if (kind === 'update') {
    op = { type: 'updateTask', taskId: data.id, payload: data }
  } else {
    op = { type: 'deleteTask', taskId: data.id, payload: { id: data.id } }
  }
  op = { ...op, opId: newOpId(), at, label }
  saveOutbox([...loadOutboxOrMemory(), op])
  kick()
  return op.taskId
}

// Prefer storage (another tab may have added ops), fall back to memory.
function loadOutboxOrMemory() {
  const stored = loadOutbox()
  return stored.length || !outbox.length ? stored : outbox
}

/** Wait until everything is saved (or the timeout). Returns how many changes are still pending. */
export async function flushOutbox(timeoutMs = 30_000) {
  kick()
  const end = Date.now() + timeoutMs
  while (outbox.length && Date.now() < end) await sleep(200)
  return outbox.length
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const isTransient = (e) => /Network problem|Server error/.test(e.message)

function kick() {
  if (workerRunning || !scope || !outbox.length) return
  workerRunning = true
  const run = () => drain().catch(() => {}).finally(() => {
    workerRunning = false
    if (outbox.length && online) setTimeout(kick, 0) // something was added meanwhile
  })
  // Only one tab sends at a time. (Without Web Locks, a rare double send is harmless: ops are idempotent.)
  if (typeof navigator !== 'undefined' && navigator.locks) navigator.locks.request('taskapp-outbox', run)
  else run()
}

async function drain() {
  const mine = scope
  let attempt = 0
  while (scope === mine) {
    const batch = loadOutboxOrMemory().slice(0, BATCH)
    if (!batch.length) return
    let results
    try {
      results = await send(batch)
    } catch (e) {
      if (!isTransient(e)) return // e.g. session expired: the app signs out
      setOnline(false)
      if (attempt >= BACKOFF.length) return // resume when back online / app reopened
      await sleep(BACKOFF[attempt++])
      continue
    }
    if (scope !== mine) return
    attempt = 0
    setOnline(true)
    lastWriteAt = Date.now()
    handleResults(batch.slice(0, results.length), results)
  }
}

/** All ops in one applyOps call; one by one if the deployed backend is older. */
async function send(batch) {
  if (applyOpsWorks) {
    try {
      return await call('applyOps', { ops: batch.map((o) => ({ type: o.type, payload: o.payload })) })
    } catch (e) {
      if (!/Unknown action/.test(e.message)) throw e
      applyOpsWorks = false
    }
  }
  const results = []
  for (const o of batch) {
    try {
      results.push({ ok: true, data: await call(o.type, o.payload) })
    } catch (e) {
      if (isTransient(e)) {
        if (results.length) return results // send the rest later
        throw e
      }
      // Old backend: deleting an already-deleted task is fine.
      if (o.type === 'deleteTask' && /not found/i.test(e.message)) results.push({ ok: true, data: true })
      else results.push({ ok: false, error: e.message })
    }
  }
  return results
}

function handleResults(ops, results) {
  let rest = loadOutboxOrMemory()
  const done = new Set(ops.map((o) => o.opId))
  rest = rest.filter((o) => !done.has(o.opId))
  ops.forEach((op, i) => {
    const r = results[i]
    if (r.ok) {
      const realId = op.type === 'createTask' && r.data && r.data.id ? r.data.id : op.taskId
      if (realId !== op.taskId) {
        idMap.set(op.taskId, realId)
        rest = remapId(rest, op.taskId, realId)
      }
      commitToServerCopy(op, r.data, realId)
    } else {
      rest = dropDependents(rest, op)
      notifier(`Couldn't ${op.label || 'save a change'}: ${r.error}`, 'error')
    }
  })
  saveOutbox(rest)
}

/** A confirmed change becomes part of the server copy of every cached task list. */
function commitToServerCopy(op, data, realId) {
  const me = scope
  for (const key of Object.keys(entries)) {
    if (!key.startsWith('listTasks:')) continue
    const [, payload] = parseKey(key)
    const list = entries[key].data
    let next = list
    if (op.type === 'createTask') {
      const task = { ...op.view, ...(data || {}), id: realId }
      if (taskBelongs(task, payload, me) && !list.some((t) => t.id === realId)) next = [...list, task]
    } else if (op.type === 'updateTask') {
      next = list.map((t) => (t.id === realId ? { ...t, ...(data || {}) } : t))
    } else {
      next = list.filter((t) => t.id !== realId)
    }
    if (next !== list) set(key, next)
  }
}

// Cached "server copy + pending ops" per list, so React gets a stable object.
const views = new Map()
function viewOf(key) {
  const entry = entries[key]
  if (!entry || !key.startsWith('listTasks:') || !outbox.length) return entry
  const v = views.get(key)
  if (v && v.entry === entry && v.version === outboxVersion) return v.view
  const [, payload] = parseKey(key)
  const view = { ...entry, data: applyOps(entry.data, outbox, payload, scope) }
  views.set(key, { entry, version: outboxVersion, view })
  return view
}

// ------------------------------------------------------------------- hook
/**
 * Cache-first data hook. Shows saved data immediately and refreshes in the background.
 * `loading` is true only when there is nothing to show yet.
 */
export function useQuery(action, payload = {}) {
  const key = keyOf(action, payload)
  const subscribe = useCallback((fn) => {
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key).add(fn)
    return () => listeners.get(key).delete(fn)
  }, [key])
  const entry = useSyncExternalStore(subscribe, () => viewOf(key))
  const [error, setError] = useState('')
  const [fetching, setFetching] = useState(false)

  const reload = useCallback(async (force = true) => {
    const e = entries[key]
    if (!force && e && Date.now() - e.at < STALE_MS) return
    setFetching(true)
    try {
      await fetchKey(key)
      setError('')
    } catch (err) {
      // With saved data on screen, a failed background refresh is not worth an error box.
      if (!entries[key]) setError(err.message)
    } finally {
      setFetching(false)
    }
  }, [key])

  useEffect(() => { reload(false) }, [reload])

  const data = entry?.data
  return {
    data,
    error,
    loading: data === undefined && !error,
    fetching,
    reload,
  }
}
