import { useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { search } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { MemberBadge } from '@/components/qr-badge'
import { ErrorState, Spinner } from '@/components/common'
import { constituencyLabel } from '@/lib/membership'

const PAGE_SIZE = 100

/**
 * Printable sheet of member badges, honouring the same filters as the members
 * list so you can print one constituency at a time rather than all 500 at once.
 *
 * Rendered outside the app layout: the sidebar and header would otherwise end up
 * on the paper.
 */
export default function BadgeSheet() {
  const [params] = useSearchParams()
  const term = params.get('search') || ''
  const constituency = params.get('constituency') || ''

  const payload = {
    filters: [
      ...(term
        ? [
            {
              nested: [
                { field: 'first_name', operator: 'like', value: `%${term}%` },
                { field: 'last_name', operator: 'like', value: `%${term}%`, type: 'or' },
              ],
            },
          ]
        : []),
      ...(constituency ? [{ field: 'constituency', operator: '=', value: Number(constituency) }] : []),
    ],
    sorts: [
      { field: 'first_name', direction: 'asc' },
      { field: 'last_name', direction: 'asc' },
    ],
  }

  const query = useInfiniteQuery({
    queryKey: ['badge-sheet', term, constituency],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => search('members', { ...payload, page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (last) => (last.current_page < last.last_page ? last.current_page + 1 : undefined),
  })

  // Pull every page before printing: a half-loaded sheet would print half the badges.
  useEffect(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage()
  }, [query.hasNextPage, query.isFetchingNextPage, query.data, query])

  const members = query.data?.pages.flatMap((page) => page.data) ?? []
  const total = query.data?.pages[0]?.total ?? 0
  const complete = !query.hasNextPage && !query.isPending

  const scope = [
    term ? `matching “${term}”` : null,
    constituency ? constituencyLabel(constituency) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (query.error) {
    return (
      <div className="p-6">
        <ErrorState error={query.error} onRetry={query.refetch} />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Screen-only toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-card p-4 print:hidden">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to={`/members?${params.toString()}`}>
              <ArrowLeft className="size-4" />
              Back to members
            </Link>
          </Button>
          <p className="mt-1 text-sm text-muted-foreground">
            {complete ? `${members.length} badge${members.length === 1 ? '' : 's'}` : `Loading ${members.length} of ${total}…`}
            {scope ? ` · ${scope}` : ''}
          </p>
        </div>
        <Button onClick={() => window.print()} disabled={!complete}>
          {complete ? <Printer className="size-4" /> : <Spinner />}
          {complete ? 'Print' : 'Preparing…'}
        </Button>
      </div>

      <div className="p-4 print:p-0">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
          {members.map((member) => (
            <MemberBadge key={member.id} member={member} width={130} />
          ))}
        </div>

        {!complete ? (
          <p className="py-6 text-center text-sm text-muted-foreground print:hidden">
            Loading the rest of the register…
          </p>
        ) : null}
      </div>
    </div>
  )
}
