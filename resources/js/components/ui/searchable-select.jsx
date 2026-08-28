import { useMemo, useState } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SearchableSelect({ id, value, onValueChange, options, placeholder = 'Select an option', searchPlaceholder = 'Search…', emptyText = 'No options found.', disabled = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((option) => String(option.value) === String(value))
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return term ? options.filter((option) => option.label.toLocaleLowerCase().includes(term)) : options
  }, [options, query])

  const choose = (optionValue) => {
    onValueChange(String(optionValue))
    setQuery('')
    setOpen(false)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery('') }}>
      <PopoverPrimitive.Trigger asChild>
        <button id={id} type="button" role="combobox" aria-expanded={open} disabled={disabled} className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align="start" sideOffset={4} className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="flex items-center border-b px-2">
            <Search className="size-4 shrink-0 opacity-50" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && filtered[0]) { event.preventDefault(); choose(filtered[0].value) } }} placeholder={searchPlaceholder} className="h-10 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <div role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p> : filtered.map((option) => (
              <button key={option.value} type="button" role="option" aria-selected={String(option.value) === String(value)} onClick={() => choose(option.value)} className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none">
                <Check className={cn('mt-0.5 size-4 shrink-0', String(option.value) === String(value) ? 'opacity-100' : 'opacity-0')} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
