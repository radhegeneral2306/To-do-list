// Client data layer: cache-first, background refresh, saved on the device.
//
// - The Google Sheet (cloud) is the source of truth.
// - Every successful fetch is also saved to localStorage, per user, so the app opens instantly
//   and old data can still be read offline. It's wiped on logout.
// - Several requests made at the same moment are merged into one `bootstrap` call,
//   because each Apps Script round trip costs 1-2 seconds.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { call } from './api.js'

const STALE_MS = 30_000
const POLL_MS = 120_000
const PREFIX = 'taskapp_cache:'

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
  listeners.forEach((set) => set.forEach((fn) => fn()))
}

/** Forget everything for this user (logout, disabled, session expired). */
export function clearScope() {
  try { if (scope) localStorage.removeItem(PREFIX + scope) } catch { /* ignore */ }
  scope = null
  entries = {}
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

/** Apply fn to every cached task list (Home, My Tasks, per-branch...). */
export function updateAllTaskLists(fn) {
  for (const key of Object.keys(entries)) {
    if (!key.startsWith('listTasks:')) continue
    const [, payload] = parseKey(key)
    set(key, fn(entries[key].data, payload))
  }
}

// ----------------------------------------------------------- task helpers
/** Update one task everywhere it is shown. */
export function patchTask(task) {
  updateAllTaskLists((list) => list.map((x) => (x.id === task.id ? { ...x, ...task } : x)))
}

export function removeTask(id) {
  updateAllTaskLists((list) => list.filter((x) => x.id !== id))
}

/** Put a newly created task into every cached list it belongs to. */
export function insertTask(task, me) {
  const users = getData('listUsers', {}) || []
  const name = (id) => users.find((u) => u.id === id)?.name || (id === me.id ? me.name : '')
  const full = { assignedToName: name(task.assignedTo), assignedByName: name(task.assignedBy), ...task }
  updateAllTaskLists((list, payload) => {
    const belongs = payload.mine ? task.assignedTo === me.id : !payload.branch || payload.branch === 'All' || payload.branch === task.branch
    return belongs && !list.some((x) => x.id === task.id) ? [...list, full] : list
  })
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
  const p = (BATCHABLE[action] ? enqueue(action, payload) : call(action, payload))
    .then((data) => {
      setOnline(true)
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
    if (document.visibilityState === 'visible') refreshAll()
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') refreshAll()
  }, POLL_MS)
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
  const entry = useSyncExternalStore(subscribe, () => entries[key])
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
    setData: (next) => set(key, typeof next === 'function' ? next(entries[key]?.data) : next),
  }
}
