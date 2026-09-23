import { useCallback, useEffect, useState } from 'react'
import { call } from './api.js'

export const ROLE_LABELS = { admin: 'Admin', partner: 'Partner', manager: 'Branch Manager', user: 'Employee' }
export const STATUSES = ['Pending', 'In Progress', 'Done']
export const PRIORITIES = ['Low', 'Medium', 'High']

export const isTop = (u) => u && (u.role === 'admin' || u.role === 'partner')
export const canAssign = (u) => isTop(u) || u?.role === 'manager'
export const canManageTask = (u, t) => isTop(u) || (u?.role === 'manager' && u.branch === t.branch)

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const isOverdue = (t) => t.status !== 'Done' && !!t.dueDate && t.dueDate < today()

export function formatDate(s) {
  if (!s) return ''
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s)
  return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Loads data from an action, reloads when `payload` changes, and every `refreshMs`. */
export function useApi(action, payload = {}, refreshMs = 60000) {
  const key = JSON.stringify(payload)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await call(action, JSON.parse(key)))
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [action, key])

  useEffect(() => {
    reload()
    if (!refreshMs) return
    const id = setInterval(reload, refreshMs)
    return () => clearInterval(id)
  }, [reload, refreshMs])

  return { data, setData, error, loading, reload }
}
