import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap gap-2">{children}</div> : null}
    </div>
  )
}

/**
 * Search box that only reports upward after the user stops typing, so each
 * keystroke does not fire a request against the API.
 */
export function SearchInput({ value, onChange, placeholder = 'Search…', delay = 350 }) {
  const [draft, setDraft] = useState(value ?? '')
  const latest = useRef(value ?? '')

  // Keep in sync when the parent resets the filter (e.g. the Reset button).
  useEffect(() => {
    if (value !== latest.current) {
      latest.current = value ?? ''
      setDraft(value ?? '')
    }
  }, [value])

  useEffect(() => {
    if (draft === latest.current) return
    const timer = setTimeout(() => {
      latest.current = draft
      onChange(draft)
    }, delay)
    return () => clearTimeout(timer)
  }, [draft, delay, onChange])

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9"
        aria-label={placeholder}
      />
      {draft ? (
        <button
          type="button"
          onClick={() => setDraft('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/**
 * A date field that says what it is when it is empty.
 *
 * `<input type="date">` accepts no placeholder, and the browsers disagree about
 * what an empty one looks like: desktop Chrome prints its own "dd/mm/yyyy",
 * Firefox something similar, and Safari on iOS renders nothing whatsoever. In a
 * filter row with no visible label that last one is just a blank box — there was
 * no way to tell the meetings date filter from a broken input.
 *
 * So the native text is hidden while the field is empty and unfocused, and this
 * draws its own placeholder over it instead. `text-transparent` rather than a
 * vendor pseudo-element because `::-webkit-datetime-edit` does not exist in
 * Firefox, and hiding the text by colour works everywhere.
 *
 * Focus restores the real thing, via `peer`: someone typing a date on a keyboard
 * has to see the digits land, and a half-typed date fires no change event, so
 * leaving it transparent would mean typing into an invisible field.
 */
export function DateInput({ value, onChange, placeholder = 'Any date', className, ...props }) {
  const isEmpty = !value

  return (
    // Full width by default so it drops into a form grid; the caller narrows it
    // where it sits in a filter row.
    <div className={cn('relative w-full', className)}>
      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="date"
        value={value}
        onChange={onChange}
        className={cn('peer pl-9', isEmpty && 'text-transparent focus:text-foreground')}
        aria-label={props['aria-label'] ?? placeholder}
        {...props}
      />
      {isEmpty ? (
        <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-base text-muted-foreground peer-focus:hidden sm:text-sm">
          {placeholder}
        </span>
      ) : null}
    </div>
  )
}

export function Pagination({ page, lastPage, total, onPageChange }) {
  if (!total) return null

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-muted-foreground">
        Page {page} of {lastPage} · {total} record{total === 1 ? '' : 's'}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export function EmptyState({ title, description, children, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  const forbidden = error?.isForbidden

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <AlertCircle className="size-8 text-destructive" />
      <div>
        <p className="font-semibold">{forbidden ? 'Not authorised' : 'Something went wrong'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {forbidden
            ? 'Your account does not have access to this section.'
            : error?.message || 'Please try again.'}
        </p>
      </div>
      {onRetry && !forbidden ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton key={columnIndex} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function Spinner({ className }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} />
}

/** Label + control + inline validation message, used by every form. */
export function Field({ id, label, error, hint, children, required }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  )
}

/** Sortable column header. Clicking cycles asc -> desc on the same field. */
export function SortableHead({ field, sort, direction, onSort, children, className }) {
  const active = sort === field
  return (
    <button
      type="button"
      onClick={() => onSort(field, active && direction === 'asc' ? 'desc' : 'asc')}
      className={cn('inline-flex items-center gap-1 uppercase hover:text-foreground', active && 'text-foreground', className)}
    >
      {children}
      <span aria-hidden="true" className="text-[10px]">
        {active ? (direction === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  )
}
