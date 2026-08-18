import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, UserPlus } from 'lucide-react'
import { search, stats as fetchStats } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CONSTITUENCIES } from '@/lib/membership'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  EmptyState,
  ErrorState,
  Pagination,
  PageHeader,
  SearchInput,
  SortableHead,
  TableSkeleton,
} from '@/components/common'
import { fullName } from '@/lib/utils'

const PER_PAGE = 10

/** Attendance is derived the same way the old members screen derived it. */
function attendanceRate(meetingsCount, totalMeetings) {
  if (!totalMeetings) return 0
  return Math.round(((meetingsCount || 0) / totalMeetings) * 10000) / 100
}

function AttendanceBadge({ value }) {
  const variant = value >= 66 ? 'success' : value >= 33 ? 'default' : 'destructive'
  return <Badge variant={variant}>{value}%</Badge>
}

export default function MembersList() {
  const [params, setParams] = useSearchParams()

  const page = Number(params.get('page') || 1)
  const searchTerm = params.get('search') || ''
  const constituency = params.get('constituency') || ''
  const sort = params.get('sort') || 'first_name'
  const direction = params.get('direction') || 'asc'

  const setParam = (updates, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params)
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) next.delete(key)
      else next.set(key, String(value))
    })
    if (resetPage) next.delete('page')
    setParams(next, { replace: true })
  }

  const searchPayload = useMemo(() => {
    const filters = []

    // Mirrors Member::scopeFilter: one term, matched against both name columns.
    if (searchTerm) {
      filters.push({
        nested: [
          { field: 'first_name', operator: 'like', value: `%${searchTerm}%` },
          { field: 'last_name', operator: 'like', value: `%${searchTerm}%`, type: 'or' },
        ],
      })
    }

    if (constituency) {
      filters.push({ field: 'constituency', operator: '=', value: Number(constituency) })
    }

    return {
      filters,
      sorts: [{ field: sort, direction }],
      includes: [{ relation: 'office' }],
      aggregates: [{ relation: 'meetings', type: 'count' }],
      page,
      limit: PER_PAGE,
    }
  }, [searchTerm, constituency, sort, direction, page])

  const membersQuery = useQuery({
    queryKey: ['members', searchPayload],
    queryFn: () => search('members', searchPayload),
    placeholderData: (previous) => previous,
  })

  const statsQuery = useQuery({ queryKey: ['stats'], queryFn: fetchStats })
  const totalMeetings = statsQuery.data?.data?.total_meetings ?? 0

  const rows = membersQuery.data?.data ?? []
  const hasFilters = Boolean(searchTerm || constituency)
  const onSort = (field, nextDirection) => setParam({ sort: field, direction: nextDirection })

  return (
    <div>
      <PageHeader title="Members" description="Party members registered for this office.">
        <Button asChild>
          <Link to="/members/create">
            <Plus className="size-4" />
            New Member
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={searchTerm}
          onChange={(value) => setParam({ search: value })}
          placeholder="Search by name"
        />
        <Select
          value={constituency}
          onValueChange={(value) => setParam({ constituency: value })}
        >
          <SelectTrigger className="w-full sm:w-64" aria-label="Filter by constituency">
            <SelectValue placeholder="All constituencies" />
          </SelectTrigger>
          <SelectContent>
            {CONSTITUENCIES.map((c) => (
              <SelectItem key={c.value} value={String(c.value)}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={() => setParam({ search: '', constituency: '' })}>
            Reset
          </Button>
        ) : null}
      </div>

      {membersQuery.error ? (
        <ErrorState error={membersQuery.error} onRetry={membersQuery.refetch} />
      ) : membersQuery.isPending ? (
        <TableSkeleton columns={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No members found"
          description={
            hasFilters
              ? 'Try a different search or reset the filters.'
              : 'Add your first member to get started.'
          }
        >
          <Button asChild size="sm">
            <Link to="/members/create">New Member</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* Desktop: full table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortableHead field="first_name" sort={sort} direction={direction} onSort={onSort}>
                      First name
                    </SortableHead>
                  </TableHead>
                  <TableHead>
                    <SortableHead field="last_name" sort={sort} direction={direction} onSort={onSort}>
                      Last name
                    </SortableHead>
                  </TableHead>
                  <TableHead>
                    <SortableHead field="email" sort={sort} direction={direction} onSort={onSort}>
                      Email
                    </SortableHead>
                  </TableHead>
                  <TableHead>
                    <SortableHead field="phone" sort={sort} direction={direction} onSort={onSort}>
                      Phone
                    </SortableHead>
                  </TableHead>
                  <TableHead>
                    <SortableHead field="constituency" sort={sort} direction={direction} onSort={onSort}>
                      Constituency
                    </SortableHead>
                  </TableHead>
                  <TableHead>Attendance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Link
                        to={`/members/${member.id}/edit`}
                        className="font-medium text-primary hover:underline"
                      >
                        {member.first_name || 'Unnamed'}
                      </Link>
                    </TableCell>
                    <TableCell>{member.last_name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{member.email || '-'}</TableCell>
                    <TableCell className="tabular-nums">{member.phone || '-'}</TableCell>
                    <TableCell className="tabular-nums">{member.constituency ?? '-'}</TableCell>
                    <TableCell>
                      <AttendanceBadge value={attendanceRate(member.meetings_count, totalMeetings)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: a card per member, so nothing scrolls sideways */}
          <div className="space-y-3 md:hidden">
            {rows.map((member) => (
              <Card key={member.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/members/${member.id}/edit`}
                      className="min-w-0 font-semibold text-primary hover:underline"
                    >
                      {fullName(member) || 'Unnamed member'}
                    </Link>
                    <AttendanceBadge value={attendanceRate(member.meetings_count, totalMeetings)} />
                  </div>
                  <dl className="mt-3 space-y-1 text-sm">
                    {member.phone ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Phone</dt>
                        <dd className="tabular-nums">{member.phone}</dd>
                      </div>
                    ) : null}
                    {member.email ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Email</dt>
                        <dd className="truncate">{member.email}</dd>
                      </div>
                    ) : null}
                    {member.constituency != null ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Constituency</dt>
                        <dd className="tabular-nums">{member.constituency}</dd>
                      </div>
                    ) : null}
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>

          <Pagination
            page={membersQuery.data.current_page}
            lastPage={membersQuery.data.last_page}
            total={membersQuery.data.total}
            onPageChange={(next) => setParam({ page: next }, { resetPage: false })}
          />
        </>
      )}
    </div>
  )
}
