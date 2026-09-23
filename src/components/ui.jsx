// Small shared building blocks: Sheet, Segmented, Avatar, Ring, Skeleton, EmptyState, Toast.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react'
import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react'
import { initials } from '../utils.js'

const SPRING = { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }

/**
 * Bottom sheet on phones, centred card on tablets/desktop.
 * Slides up with a spring (spatial continuity) and can be dragged down to close.
 */
export function Sheet({ open, onClose, title, children }) {
  const reduce = useReducedMotion()
  const drag = useDragControls()
  const desktop = useRef(false)

  useEffect(() => {
    if (!open) return
    desktop.current = window.matchMedia('(min-width: 768px)').matches
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const hidden = reduce ? { opacity: 0 } : desktop.current ? { opacity: 0, y: 24, scale: 0.97 } : { y: '100%' }
  const shown = reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <div className="sheet-layer" key="layer">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className="sheet glass"
              initial={hidden}
              animate={shown}
              exit={hidden}
              transition={reduce ? { duration: 0 } : SPRING}
              drag={desktop.current || reduce ? false : 'y'}
              dragControls={drag}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 110 || info.velocity.y > 600) onClose()
              }}
            >
              <div className="sheet-head" onPointerDown={(e) => drag.start(e)}>
                <div className="sheet-grabber" />
                <div className="sheet-titlebar">
                  <h2>{title}</h2>
                  <button className="icon-btn" aria-label="Close" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
                    <X size={16} weight="bold" />
                  </button>
                </div>
              </div>
              <div className="sheet-body">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** iOS segmented control. The white pill slides to the chosen option (state change feedback). */
export function Segmented({ options, value, onChange, label }) {
  const id = useId()
  const reduce = useReducedMotion()
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} onClick={() => onChange(o.value)}>
            {on && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={reduce ? { duration: 0 } : SPRING} />}
            {o.label}
            {o.count !== undefined && <span className="seg-count">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Avatar({ name, size = 40 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

/** Small completion ring (done / total). */
export function Ring({ value, total, size = 30 }) {
  const r = (size - 5) / 2
  const c = 2 * Math.PI * r
  const pct = total ? value / total : 0
  return (
    <svg className="ring" width={size} height={size} aria-label={`${Math.round(pct * 100)}% done`}>
      <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="4" />
      <circle
        className="value"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
      />
    </svg>
  )
}

export function SkeletonRows({ rows = 4 }) {
  return (
    <div className="group" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="task-row" key={i}>
          <div className="skeleton" style={{ width: 24, height: 24, borderRadius: '50%', margin: '1px 4px' }} />
          <div className="grow stack" style={{ gap: 8 }}>
            <div className="skeleton" style={{ height: 16, width: `${70 - i * 9}%` }} />
            <div className="skeleton" style={{ height: 12, width: '40%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon size={30} weight="duotone" /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function ErrorText({ children }) {
  if (!children) return null
  return (
    <p className="error-text" role="alert">
      <WarningCircle size={20} weight="fill" style={{ flex: '0 0 auto' }} />
      <span>{children}</span>
    </p>
  )
}

// ------------------------------------------------------------------ toasts
const ToastContext = createContext(() => {})

/** Glass pill that drops in from the top, like a Dynamic Island notice. */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const reduce = useReducedMotion()
  const timer = useRef()

  const show = useCallback((text, kind = 'success') => {
    clearTimeout(timer.current)
    setToast({ text, kind, id: Date.now() })
    timer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              className="toast glass"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.95 }}
              transition={reduce ? { duration: 0 } : SPRING}
              onClick={() => setToast(null)}
            >
              <span className="toast-icon" style={{ background: toast.kind === 'error' ? 'var(--red)' : 'var(--green)' }}>
                {toast.kind === 'error' ? <WarningCircle size={18} weight="bold" /> : <CheckCircle size={18} weight="bold" />}
              </span>
              {toast.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
