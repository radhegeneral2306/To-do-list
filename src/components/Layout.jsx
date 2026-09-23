import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { DEMO } from '../api.js'
import { ROLE_LABELS, canAssign, isTop } from '../utils.js'

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const tabs = [
    canAssign(user) && ['/dashboard', 'Branch Dashboard'],
    canAssign(user) && ['/assign', 'Assign Task'],
    ['/my-tasks', 'My Tasks'],
    isTop(user) && ['/users', 'Users'],
    ['/account', 'Account'],
  ].filter(Boolean)

  return (
    <>
      {DEMO && <div className="demo-banner">DEMO MODE: data is saved only in this browser. Connect Google Sheet to go live.</div>}
      <header className="topbar">
        <div className="brand">✅ Task List</div>
        <div className="who">
          <span className="who-name">{user.name}</span>
          <span className="badge">{ROLE_LABELS[user.role]}{user.branch !== 'All' ? ` · ${user.branch}` : ''}</span>
          <button className="btn-link" onClick={logout}>Logout</button>
        </div>
      </header>
      <nav className="tabs">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="page">{children}</main>
    </>
  )
}
