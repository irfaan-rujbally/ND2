import { cn } from '@/lib/utils'

/**
 * Wraps its children in a border with two lights, one red and one blue, orbiting
 * the edge.
 *
 * Two layers do the work, both driven by the same `.orbit-border` gradient (see
 * app.css):
 *
 *   - a blurred copy sitting slightly larger than the box, which is the glow
 *     spilling onto the background;
 *   - the border itself, 2px of gradient left visible around a solid inner
 *     surface.
 *
 * The inner element must be opaque, or the gradient shows through the middle and
 * the effect reads as a coloured panel rather than a lit edge -- hence
 * `innerClassName` is where the background belongs.
 */
export function OrbitBorder({ children, className, innerClassName }) {
  return (
    <div className={cn('relative', className)}>
      <span
        aria-hidden="true"
        className="orbit-border pointer-events-none absolute -inset-1.5 rounded-[1.125rem] opacity-80 blur-[14px]"
      />

      <div className="orbit-border relative rounded-xl p-[3px] shadow-lg">
        {/* rounded-xl is 0.75rem; less the 3px ring so the corners stay concentric. */}
        <div className={cn('overflow-hidden rounded-[calc(0.75rem-3px)]', innerClassName)}>
          {children}
        </div>
      </div>
    </div>
  )
}
