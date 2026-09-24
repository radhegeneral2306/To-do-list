
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

export function addDays(n) {
  const d = new Date(Date.now() + n * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function relativeDue(s) {
  if (!s) return ''
  const diff = Math.round((new Date(s + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < 0) return `${-diff} days ago`
  if (diff < 7) return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' })
  return formatDate(s)
}

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'

export function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
