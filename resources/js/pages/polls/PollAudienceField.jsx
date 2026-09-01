import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'

import { polls as pollsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorState, SearchInput, Spinner } from '@/components/common'
import { cn } from '@/lib/utils'

export const AUDIENCE_OFFICE = 'office'
export const AUDIENCE_SELECTED = 'selected'

/**
 * Who the poll is put to.
 *
 * The whole office is one radio and no work; a restricted poll opens a picker
 * over every approved member. The list arrives in one response rather than a
 * paged search, which is what lets "Select all" mean all five hundred members
 * and not the rows on screen -- see PollCandidatesController.
 *
 * Filtering is done here in the browser against that one response, so typing in
 * the search box costs nothing and never loses a tick made before the search.
 */
export function PollAudienceField({ audience, onAudienceChange, selectedIds, onSelectedChange, pollId, error }) {
  const [search, setSearch] = useState('')

  const restricted = audience === AUDIENCE_SELECTED

  const candidates = useQuery({
    queryKey: ['poll-candidates', pollId ?? 'new'],
    queryFn: () => pollsApi.candidates(pollId),
    // Only fetched once the office actually asks to choose, so an office-wide
    // poll never pulls the whole register down.
    enabled: restricted,
  })

  const rows = candidates.data?.data ?? []
  const picked = useMemo(() => new Set(selectedIds), [selectedIds])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term === '' ? rows : rows.filter((row) => row.name.toLowerCase().includes(term))
  }, [rows, search])

  const toggle = (id) =>
    onSelectedChange(picked.has(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id])

  // Acts on what the search is showing, which is what the office can see it is
  // acting on. With an empty search that is the whole office.
  const selectVisible = () =>
    onSelectedChange([...new Set([...selectedIds, ...visible.map((row) => row.id)])])

  const clearVisible = () => {
    const dropping = new Set(visible.map((row) => row.id))
    onSelectedChange(selectedIds.filter((id) => !dropping.has(id)))
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Who can vote</h2>

        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { value: AUDIENCE_OFFICE, label: 'Everyone in the office', hint: 'Every approved member.' },
            { value: AUDIENCE_SELECTED, label: 'Selected members', hint: 'Only the members you pick.' },
          ].map((choice) => (
            <label
              key={choice.value}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors',
                audience === choice.value ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
              )}
            >
              <input
                type="radio"
                name="poll-audience"
                checked={audience === choice.value}
                onChange={() => onAudienceChange(choice.value)}
                className="mt-0.5 size-4 shrink-0 border-input accent-primary"
              />
              <span className="min-w-0">
                <span className="block font-medium leading-snug">{choice.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{choice.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {restricted ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <SearchInput value={search} onChange={setSearch} placeholder="Search members…" />
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectVisible}>
                  Select {search ? 'these' : 'all'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearVisible}>
                  Clear
                </Button>
              </div>
            </div>

            {candidates.error ? (
              <ErrorState error={candidates.error} onRetry={candidates.refetch} />
            ) : candidates.isPending ? (
              <div className="grid place-items-center py-8">
                <Spinner className="size-5" />
              </div>
            ) : (
              <>
                <div className="max-h-72 divide-y overflow-y-auto overscroll-contain rounded-md border">
                  {visible.map((row) => (
                    <label
                      key={row.id}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent/50"
                    >
                      <input
                        type="checkbox"
                        checked={picked.has(row.id)}
                        onChange={() => toggle(row.id)}
                        className="size-4 shrink-0 rounded border-input accent-primary"
                      />
                      <span className="min-w-0 truncate">{row.name}</span>
                    </label>
                  ))}
                  {visible.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">No member matches.</p>
                  ) : null}
                </div>

                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="size-3.5" />
                  {selectedIds.length} of {rows.length} member{rows.length === 1 ? '' : 's'} invited
                  {search ? ` · ${visible.length} shown` : ''}
                </p>
              </>
            )}
          </div>
        ) : null}

        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  )
}
