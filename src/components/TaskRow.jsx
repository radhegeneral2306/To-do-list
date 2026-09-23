import { motion, useReducedMotion } from 'motion/react'
import { Check, Flag, CalendarBlank, User, ChatText } from '@phosphor-icons/react'
import { isOverdue, relativeDue } from '../utils.js'

/** One task, Apple Reminders style. The circle marks it done in one tap. */
export default function TaskRow({ task, canToggle, showAssignee, onToggle, onOpen }) {
  const reduce = useReducedMotion()
  const overdue = isOverdue(task)
  const done = task.status === 'Done'
  const progress = task.status === 'In Progress'

  return (
    <motion.div
      layout={reduce ? false : 'position'}
      initial={false}
      exit={reduce ? undefined : { opacity: 0, x: 40 }}
      transition={{ duration: 0.25 }}
      className={'task-row' + (done ? ' is-done' : '')}
    >
      <button
        className={'check' + (done ? ' done' : progress ? ' progress' : '')}
        disabled={!canToggle}
        onClick={() => onToggle(task)}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      >
        <span className="circle">
          {done && (
            <motion.span initial={reduce ? false : { scale: 0.3 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}>
              <Check size={14} weight="bold" />
            </motion.span>
          )}
        </span>
      </button>

      <button className="task-body" onClick={() => onOpen(task)}>
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          {progress && <span className="accent">In progress</span>}
          {task.dueDate && (
            <span className={overdue ? 'red' : ''}>
              <CalendarBlank size={14} weight={overdue ? 'bold' : 'regular'} />
              {relativeDue(task.dueDate)}
            </span>
          )}
          {showAssignee && (
            <span>
              <User size={14} />
              {task.assignedToName}
            </span>
          )}
          {task.priority !== 'Low' && (
            <span className={`prio-flag ${task.priority.toLowerCase()}`} aria-label={`${task.priority} priority`}>
              <Flag size={14} weight="fill" />
            </span>
          )}
        </div>
        {task.remarks && (
          <div className="task-note">
            <ChatText size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            {task.remarks}
          </div>
        )}
      </button>
    </motion.div>
  )
}
