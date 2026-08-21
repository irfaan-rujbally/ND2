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
export function OrbitBorder({ children, className, innerClassName, variant = 'hero' }) {
  /*
   * Two sizes of the same idea.
   *
   * `hero` is the original: a 3px ring, a wide travelling glow and a drop shadow.
   * It was built for one element on a page -- the logo plate on the sign-in
   * screens -- and it earns the attention there.
   *
   * `inline` is for something that repeats. Same red and blue, half the ring, a
   * glow tight enough not to bleed into the next card, and no animation: a dozen
   * orbiting gradients down a thread is a lot of movement to read past, and each
   * one is a conic gradient plus a blur layer for the compositor.
   */
  const inline = variant === 'inline'

  return (
    <div className={cn('relative', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'orbit-border pointer-events-none absolute',
          inline
            ? 'orbit-still -inset-0.5 rounded-[0.875rem] opacity-50 blur-[5px]'
            : '-inset-1.5 rounded-[1.125rem] opacity-80 blur-[14px]',
        )}
      />

      <div
        className={cn(
          'orbit-border relative rounded-xl',
          inline ? 'orbit-still p-[2px]' : 'p-[3px] shadow-lg',
        )}
      >
        {/* rounded-xl is 0.75rem; less the ring so the corners stay concentric. */}
        <div
          className={cn(
            'overflow-hidden',
            inline ? 'rounded-[calc(0.75rem-2px)]' : 'rounded-[calc(0.75rem-3px)]',
            innerClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
