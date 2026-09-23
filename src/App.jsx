import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import { canAssign, isTop } from './utils.js'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import MyTasks from './pages/MyTasks.jsx'
import Home from './pages/Home.jsx'
import AssignTask from './pages/AssignTask.jsx'
import Team from './pages/Team.jsx'
import Profile from './pages/Profile.jsx'

export default function App() {
  const { user, checking } = useAuth()
  if (checking) return <div className="ambient" />
  if (!user) return <Login />

  const home = canAssign(user) ? '/home' : '/tasks'
  return (
    <Layout>
      <Routes>
        <Route path="/tasks" element={<MyTasks />} />
        {canAssign(user) && <Route path="/home" element={<Home />} />}
        {canAssign(user) && <Route path="/assign" element={<AssignTask />} />}
        {isTop(user) && <Route path="/team" element={<Team />} />}
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  )
}
