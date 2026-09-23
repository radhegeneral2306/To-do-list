import LargeTitle from '../components/LargeTitle.jsx'
import AssignForm from '../components/AssignForm.jsx'

/** Full-page version of the New Task sheet (for direct links on desktop). */
export default function AssignTask() {
  return (
    <>
      <LargeTitle title="New Task" />
      <div className="glass" style={{ borderRadius: 'var(--r-md)', padding: 20, maxWidth: 620 }}>
        <AssignForm />
      </div>
    </>
  )
}
