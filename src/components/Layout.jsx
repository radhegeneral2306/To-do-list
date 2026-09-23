import { createContext, useContext, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { CheckSquareOffset, House, ListChecks, Plus, UserCircle, UsersThree } from '@phosphor-icons/react'
import { useAuth } from '../auth/AuthContext.jsx'
import { DEMO } from '../api.js'
import { canAssign, isTop } from '../utils.js'
import AssignForm from './AssignForm.jsx'
import { Sheet } from './ui.jsx'

const AssignContext = createContext(() => {})
/** Opens the "New Task" sheet from anywhere. */
export const useAssign = () => useContext(AssignContext)

export default function Layout({ children }) {
  const { user } = useAuth()
  const reduce = useReducedMotion()
  const [assignOpen, setAssignOpen] = useState(false)

  const tabs = [
    canAssign(user) && ['/home', 'Home', House],
    ['/tasks', 'Tasks', ListChecks],
    canAssign(user) && 'plus',
    isTop(user) && ['/team', 'Team', UsersThree],
    ['/profile', 'Profile', UserCircle],
  ].filter(Boolean)

  return (
    <AssignContext.Provider value={() => setAssignOpen(true)}>
      <div className="ambient" />
      <div className="shell">
        <nav className="tabbar glass" aria-label="Main" data-count={tabs.length}>
          <div className="sidebar-brand">
            <span className="brand-mark"><CheckSquareOffset size={20} weight="bold" /></span>
            Company Tasks
          </div>
          {canAssign(user) && (
            <button className="btn sidebar-new" onClick={() => setAssignOpen(true)}>
              <Plus size={18} weight="bold" /> New Task
            </button>
          )}
          {tabs.map((t) =>
            t === 'plus' ? (
              <button key="plus" className="tab-plus" aria-label="New task" onClick={() => setAssignOpen(true)}>
                <Plus size={24} weight="bold" />
              </button>
            ) : (
              <NavLink key={t[0]} to={t[0]} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
                {({ isActive }) => {
                  const Icon = t[2]
                  return (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="tab-pill"
                          className="tab-pill"
                          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                        />
                      )}
                      <Icon size={24} weight={isActive ? 'fill' : 'regular'} />
                      <span>{t[1]}</span>
                    </>
                  )
                }}
              </NavLink>
            ),
          )}
          {DEMO && <p className="sidebar-foot">Demo mode. Data stays in this browser.</p>}
        </nav>

        <main className="main">{children}</main>
      </div>

      <Sheet open={assignOpen} onClose={() => setAssignOpen(false)} title="New Task">
        <AssignForm onDone={() => setAssignOpen(false)} />
      </Sheet>
    </AssignContext.Provider>
  )
}
