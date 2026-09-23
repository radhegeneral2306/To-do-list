import { useEffect, useRef, useState } from 'react'

/**
 * iOS large title. When it scrolls away, a compact glass nav bar takes over
 * (IntersectionObserver, no scroll listeners).
 */
export default function LargeTitle({ title, subtitle, actions }) {
  const ref = useRef(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { rootMargin: '-60px 0px 0px 0px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])

  return (
    <>
      <div className={'navbar' + (scrolled ? ' scrolled' : '')}>
        <span />
        <span className="compact-title">{title}</span>
        <div className="nav-actions">{actions}</div>
      </div>
      <header className="large-title" ref={ref}>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
    </>
  )
}
