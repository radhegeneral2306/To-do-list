import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import { canAssign, isTop } from './utils.js'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import MyTasks from './pages/MyTasks.jsx'
import BranchDashboard from './pages/BranchDashboard.jsx'
import AssignTask from './pages/AssignTask.jsx'
import Users from './pages/Users.jsx'
import Account from './pages/Account.jsx'

export default function App() {
  const { user, checking } = useAuth()
  if (checking) return <div className="center-screen">Loading…</div>
  if (!user) return <Login />

  const home = canAssign(user) ? '/dashboard' : '/my-tasks'
  return (
    <Layout>
      <Routes>
        <Route path="/my-tasks" element={<MyTasks />} />
        {canAssign(user) && <Route path="/dashboard" element={<BranchDashboard />} />}
        {canAssign(user) && <Route path="/assign" element={<AssignTask />} />}
        {isTop(user) && <Route path="/users" element={<Users />} />}
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  )
}
