import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Input = forwardRef(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      // 16px text on mobile stops iOS Safari zooming the viewport on focus.
      'flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm transition-colors',
      'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:text-sm',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
