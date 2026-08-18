import { useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * A scroll container that asks for more rows as it nears the bottom.
 *
 * Used by the attendance panels, which each own their own scrollbar so the page
 * itself stays fixed to the viewport height.
 */
export function ScrollList({ className, onReachEnd, threshold = 200, children }) {
  const ref = useRef(null)
  const busy = useRef(false)

  const handleScroll = useCallback(() => {
    const el = ref.current
    if (!el || !onReachEnd) return

    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight

    if (remaining < threshold) {
      // Guard against firing repeatedly during a single fling.
      if (busy.current) return
      busy.current = true
      Promise.resolve(onReachEnd()).finally(() => {
        busy.current = false
      })
    }
  }, [onReachEnd, threshold])

  return (
    <div ref={ref} onScroll={handleScroll} className={cn('overflow-y-auto overscroll-contain', className)}>
      {children}
    </div>
  )
}
