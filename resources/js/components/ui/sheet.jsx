import { forwardRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Slide-in panel, used for the mobile navigation drawer. */
const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close

const SheetContent = forwardRef(({ className, children, side = 'left', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-y-0 z-50 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl transition ease-in-out',
        side === 'left'
          ? 'left-0 data-[state=open]:animate-in data-[state=open]:slide-in-from-left'
          : 'right-0 data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
        className,
      )}
      {...props}
    >
      <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
      {children}
      <DialogPrimitive.Close className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring">
        <X className="size-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
SheetContent.displayName = 'SheetContent'

export { Sheet, SheetTrigger, SheetClose, SheetContent }
