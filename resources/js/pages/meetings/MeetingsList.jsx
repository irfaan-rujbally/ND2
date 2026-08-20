import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarPlus, ChevronRight, Pencil, Plus, Users } from 'lucide-react'
import { search } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { formatDate, formatTimeRange } from '@/lib/utils'

const PER_PAGE = 10

export default function MeetingsList() {
  const [params, setParams] = useSearchParams()

  const page = Number(params.get('page') || 1)
  const searchTerm = params.get('search') || ''
  const date = params.get('date') || ''
  const sort = params.get('sort') || 'date'
  const direction = params.get('direction') || 'desc'

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

    // Mirrors Meeting::scopeFilter, which searched title and date together.
    if (searchTerm) {
      filters.push({
        nested: [
          { field: 'title', operator: 'like', value: `%${searchTerm}%` },
          { field: 'date', operator: 'like', value: `%${searchTerm}%`, type: 'or' },
        ],
      })
    }

    if (date) {
      filters.push({ field: 'date', operator: '=', value: date })
    }

    return {
      filters,
      sorts: [{ field: sort, direction }],
      includes: [{ relation: 'office' }],
      aggregates: [{ relation: 'members', type: 'count' }],
      page,
      limit: PER_PAGE,
    }
  }, [searchTerm, date, sort, direction, page])

  const meetingsQuery = useQuery({
    queryKey: ['meetings', searchPayload],
    queryFn: () => search('meetings', searchPayload),
    placeholderData: (previous) => previous,
  })

  const rows = meetingsQuery.data?.data ?? []
  const hasFilters = Boolean(searchTerm || date)
  const onSort = (field, nextDirection) => setParam({ sort: field, direction: nextDirection })

  return (
    <div>
      <PageHeader title="Meetings" description="Party meetings and their attendance.">
        <Button asChild>
          <Link to="/meetings/create">
            <Plus className="size-4" />
            New Meeting
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={searchTerm}
          onChange={(value) => setParam({ search: value })}
          placeholder="Search by title"
        />
        <Input
          type="date"
          value={date}
          onChange={(event) => setParam({ date: event.target.value })}
          className="w-full sm:w-44"
          aria-label="Filter by date"
        />
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={() => setParam({ search: '', date: '' })}>
            Reset
          </Button>
        ) : null}
      </div>

      {meetingsQuery.error ? (
        <ErrorState error={meetingsQuery.error} onRetry={meetingsQuery.refetch} />
      ) : meetingsQuery.isPending ? (
        <TableSkeleton columns={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="No meetings found"
          description={
            hasFilters
              ? 'Try a different search or reset the filters.'
              : 'Create your first meeting to start recording attendance.'
          }
        >
          <Button asChild size="sm">
            <Link to="/meetings/create">New Meeting</Link>
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
                    <SortableHead field="title" sort={sort} direction={direction} onSort={onSort}>
                      Title
                    </SortableHead>
                  </TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead>
                    <SortableHead field="date" sort={sort} direction={direction} onSort={onSort}>
                      Date
                    </SortableHead>
                  </TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Participants</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((meeting) => (
                  <TableRow key={meeting.id}>
                    <TableCell>
                      <Link
                        to={`/meetings/${meeting.id}/attendance`}
                        className="font-medium text-primary hover:underline"
                      >
                        {meeting.title || 'Untitled meeting'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{meeting.office?.name || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDate(meeting.date)}
                      {/* Times are optional, so the date stands alone where none were recorded. */}
                      {formatTimeRange(meeting.start_time, meeting.end_time) ? (
                        <span className="block text-xs text-muted-foreground">
                          {formatTimeRange(meeting.start_time, meeting.end_time)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{meeting.topic || '-'}</TableCell>
                    <TableCell>
                      <Link to={`/meetings/${meeting.id}/participants`}>
                        <Badge variant="secondary">{meeting.members_count ?? 0}</Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" aria-label="View participants">
                          <Link to={`/meetings/${meeting.id}/participants`}>
                            <Users className="size-4" />
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="icon" aria-label="Edit meeting">
                          <Link to={`/meetings/${meeting.id}/edit`}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="icon" aria-label="Manage attendance">
                          <Link to={`/meetings/${meeting.id}/attendance`}>
                            <ChevronRight className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: a card per meeting */}
          <div className="space-y-3 md:hidden">
            {rows.map((meeting) => (
              <Card key={meeting.id}>
                <CardContent className="p-4 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/meetings/${meeting.id}/attendance`}
                      className="min-w-0 font-semibold text-primary hover:underline"
                    >
                      {meeting.title || 'Untitled meeting'}
                    </Link>
                    <Badge variant="secondary">{meeting.members_count ?? 0}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(meeting.date)}
                    {formatTimeRange(meeting.start_time, meeting.end_time)
                      ? ` · ${formatTimeRange(meeting.start_time, meeting.end_time)}`
                      : ''}
                    {meeting.topic ? ` · ${meeting.topic}` : ''}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <Link to={`/meetings/${meeting.id}/attendance`}>Attendance</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/meetings/${meeting.id}/participants`}>
                        <Users className="size-4" />
                        Participants
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/meetings/${meeting.id}/edit`}>
                        <Pencil className="size-4" />
                        Edit
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Pagination
            page={meetingsQuery.data.current_page}
            lastPage={meetingsQuery.data.last_page}
            total={meetingsQuery.data.total}
            onPageChange={(next) => setParam({ page: next }, { resetPage: false })}
          />
        </>
      )}
    </div>
  )
}
