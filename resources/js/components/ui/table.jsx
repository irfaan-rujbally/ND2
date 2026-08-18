import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * The wrapper owns the horizontal scroll so a wide table never makes the whole
 * page scroll sideways on a phone.
 */
const Table = forwardRef(({ className, ...props }, ref) => (
  <div className="scroll-x w-full rounded-lg border">
    <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
))
Table.displayName = 'Table'

const TableHeader = forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('bg-muted/60 [&_tr]:border-b', className)} {...props} />
))
TableHeader.displayName = 'TableHeader'

const TableBody = forwardRef(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
))
TableBody.displayName = 'TableBody'

const TableRow = forwardRef(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/40', className)} {...props} />
))
TableRow.displayName = 'TableRow'

const TableHead = forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn('h-11 whitespace-nowrap px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}
    {...props}
  />
))
TableHead.displayName = 'TableHead'

const TableCell = forwardRef(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('px-4 py-3 align-middle', className)} {...props} />
))
TableCell.displayName = 'TableCell'

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
