import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, UserPlus, Users } from 'lucide-react'
import { fetchMeetingParticipants, search } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { CONSTITUENCIES } from '@/lib/membership'
import { formatDate, formatTimeRange, fullName } from '@/lib/utils'

const PER_PAGE = 25

/** Constituencies are stored as their number; the list shows the name too. */
function constituencyLabel(value) {
  if (value == null) return '-'
  return CONSTITUENCIES.find((c) => c.value === Number(value))?.label ?? value
}

/**
 * Who attended one meeting: a read-only roll of the members recorded present.
 *
 * Separate from the attendance screen, which is the working tool for the door --
 * a search panel, a scanner, and add/remove buttons. This answers the other
 * question, "who was at this meeting", so it is paginated and searchable, and
 * nothing on it can change the record.
 */
export default function Participants() {
  const { id } = useParams()
  const meetingId = Number(id)

  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page') || 1)
  const term = params.get('q') || ''
  const constituency = params.get('constituency') || ''

  /*
   * Recorded order is the default: this is the roll of the meeting, and who
   * arrived when is what a name-sorted list throws away. Choosing a column
   * heading swaps to that column instead.
   */
  const sort = params.get('sort') || ''
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

  const meetingQuery = useQuery({
    queryKey: ['meeting', id],
    queryFn: () =>
      search('meetings', {
        filters: [{ field: 'id', operator: '=', value: meetingId }],
        includes: [{ relation: 'office' }],
        limit: 10,
      }).then((response) => response.data[0] ?? null),
  })

  /*
   * Sent to the meeting's own participants endpoint rather than to the members
   * search: the latter only ever returns the caller's own office, so a member
   * who travelled here from another office would be missing from the list of
   * people recorded at this meeting. Ordering defaults to arrival order there.
   */
  const filters = useMemo(
    () => ({ q: term, constituency, sort, direction, page, limit: PER_PAGE }),
    [term, constituency, sort, direction, page],
  )

  const participantsQuery = useQuery({
    queryKey: ['meeting-participants', meetingId, filters],
    queryFn: () => fetchMeetingParticipants(meetingId, filters),
    placeholderData: (previous) => previous,
  })

  const meeting = meetingQuery.data
  const rows = participantsQuery.data?.data ?? []
  const total = participantsQuery.data?.meta?.participants
  const hasFilters = Boolean(term || constituency)
  const onSort = (field, nextDirection) => setParam({ sort: field, direction: nextDirection })
  const times = formatTimeRange(meeting?.start_time, meeting?.end_time)

  const subtitle = meeting
    ? [formatDate(meeting.date), times, meeting.office?.name].filter(Boolean).join(' · ')
    : undefined

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/meetings">
          <ArrowLeft className="size-4" />
          Back to meetings
        </Link>
      </Button>

      <PageHeader
        title={meeting?.title ? `Participants · ${meeting.title}` : 'Participants'}
        description={subtitle}
      >
        {/* Recording someone who is missing stays the attendance screen's job. */}
        <Button asChild variant="outline">
          <Link to={`/meetings/${meetingId}/attendance`}>
            <UserPlus className="size-4" />
            Manage attendance
          </Link>
        </Button>
      </PageHeader>

      {meetingQuery.error ? (
        <ErrorState error={meetingQuery.error} onRetry={meetingQuery.refetch} />
      ) : null}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={term}
          onChange={(value) => setParam({ q: value })}
          placeholder="Search participants by name"
        />
        <Select value={constituency} onValueChange={(value) => setParam({ constituency: value })}>
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
          <Button variant="ghost" size="sm" onClick={() => setParam({ q: '', constituency: '' })}>
            Reset
          </Button>
        ) : null}
        {/* Counts everyone present, not the filtered rows below. */}
        {total != null ? (
          <Badge variant="secondary" className="w-fit whitespace-nowrap">
            {total} recorded present
          </Badge>
        ) : null}
      </div>

      {participantsQuery.error ? (
        <ErrorState error={participantsQuery.error} onRetry={participantsQuery.refetch} />
      ) : participantsQuery.isPending ? (
        <TableSkeleton columns={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={hasFilters ? 'No participant matches those filters' : 'Nobody recorded yet'}
          description={
            hasFilters
              ? 'Try a different search or reset the filters.'
              : 'Members appear here as they are checked in, whether at the door or from their own phone.'
          }
        >
          {hasFilters ? (
            <Button variant="outline" size="sm" onClick={() => setParam({ q: '', constituency: '' })}>
              Reset filters
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to={`/meetings/${meetingId}/attendance`}>Record attendance</Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          {/* Desktop: full table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* Rows read "first_name last_name", so Name sorts on first_name --
                      the same choice the attendance panel makes. */}
                  <TableHead>
                    <SortableHead field="first_name" sort={sort} direction={direction} onSort={onSort}>
                      Name
                    </SortableHead>
                  </TableHead>
                  <TableHead>
                    <SortableHead field="phone" sort={sort} direction={direction} onSort={onSort}>
                      Phone
                    </SortableHead>
                  </TableHead>
                  <TableHead>
                    <SortableHead field="email" sort={sort} direction={direction} onSort={onSort}>
                      Email
                    </SortableHead>
                  </TableHead>
                  <TableHead>
                    <SortableHead field="constituency" sort={sort} direction={direction} onSort={onSort}>
                      Constituency
                    </SortableHead>
                  </TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead className="w-16 text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Link
                        to={`/members/${member.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {fullName(member) || 'Unnamed member'}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{member.phone || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{member.email || '-'}</TableCell>
                    <TableCell>{constituencyLabel(member.constituency)}</TableCell>
                    <TableCell>
                      {member.office || '-'}
                      {/* A member of another office who attended is still part of this
                          meeting's record, and worth marking as a visitor. */}
                      {member.is_visitor ? (
                        <Badge variant="outline" className="ml-2 align-middle">
                          Visitor
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        aria-label={`View ${fullName(member) || 'member'}`}
                      >
                        <Link to={`/members/${member.id}`}>
                          <Eye className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: a card per participant, so nothing scrolls sideways */}
          <div className="space-y-3 md:hidden">
            {rows.map((member) => (
              <Card key={member.id}>
                <CardContent className="p-4 sm:p-4">
                  <Link
                    to={`/members/${member.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {fullName(member) || 'Unnamed member'}
                  </Link>
                  {member.is_visitor ? (
                    <Badge variant="outline" className="ml-2 align-middle">
                      Visitor · {member.office || 'no office'}
                    </Badge>
                  ) : null}
                  <dl className="mt-2 space-y-1 text-sm">
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
                        <dd>{constituencyLabel(member.constituency)}</dd>
                      </div>
                    ) : null}
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>

          <Pagination
            page={participantsQuery.data.meta.current_page}
            lastPage={participantsQuery.data.meta.last_page}
            total={participantsQuery.data.meta.total}
            onPageChange={(next) => setParam({ page: next }, { resetPage: false })}
          />
        </>
      )}
    </div>
  )
}
