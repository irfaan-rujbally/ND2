import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Eye, Pencil, Plus, QrCode, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { destroy, fetchMembersExport, search, stats as fetchStats } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CONSTITUENCIES } from '@/lib/membership'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  EmptyState,
  ErrorState,
  Pagination,
  PageHeader,
  SearchInput,
  SortableHead,
  Spinner,
  TableSkeleton,
} from '@/components/common'
import { downloadBlob, fullName } from '@/lib/utils'

const PER_PAGE = 10

/*
 * The Attendance column's sort key. Not a database column, so both the list and
 * the export translate it into an ordering by meetings attended.
 */
const ATTENDANCE_SORT = 'attendance'

/** Attendance is derived the same way the old members screen derived it. */
function attendanceRate(meetingsCount, totalMeetings) {
  if (!totalMeetings) return 0
  return Math.round(((meetingsCount || 0) / totalMeetings) * 10000) / 100
}

function AttendanceBadge({ value }) {
  const variant = value >= 66 ? 'success' : value >= 33 ? 'default' : 'destructive'
  return <Badge variant={variant}>{value}%</Badge>
}

/** View / edit / delete, shared by the desktop row and the mobile card. */
function RowActions({ member, onDelete, size = 'icon' }) {
  return (
    <>
      <Button asChild variant="ghost" size={size} aria-label={`View ${fullName(member) || 'member'}`}>
        <Link to={`/members/${member.id}`}>
          <Eye className="size-4" />
          {size === 'sm' ? 'View' : null}
        </Link>
      </Button>
      <Button asChild variant="ghost" size={size} aria-label={`Edit ${fullName(member) || 'member'}`}>
        <Link to={`/members/${member.id}/edit`}>
          <Pencil className="size-4" />
          {size === 'sm' ? 'Edit' : null}
        </Link>
      </Button>
      <Button
        variant="ghost"
        size={size}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Delete ${fullName(member) || 'member'}`}
        onClick={() => onDelete(member)}
      >
        <Trash2 className="size-4" />
        {size === 'sm' ? 'Delete' : null}
      </Button>
    </>
  )
}

export default function MembersList() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()

  /* Holds the member awaiting confirmation, so the dialog can name them. */
  const [pendingDelete, setPendingDelete] = useState(null)

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

    /*
     * Attendance is not a column -- it is the meetings count over a denominator
     * shared by every row -- so ordering by it goes through the resource's
     * orderByMeetingsCount scope. A `sorts` entry naming it would be rejected as
     * an unknown field.
     */
    const ordering = sort === ATTENDANCE_SORT
      ? { scopes: [{ name: 'orderByMeetingsCount', parameters: [direction] }] }
      : { sorts: [{ field: sort, direction }] }

    return {
      filters,
      ...ordering,
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

  const remove = useMutation({
    mutationFn: (member) => destroy('members', [member.id]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Member deleted.')
      setPendingDelete(null)
    },
    onError: (error) => toast.error(error.message),
  })

  /* Exports every row matching the current filters, not just this page. */
  const exportToExcel = useMutation({
    mutationFn: () => fetchMembersExport({ search: searchTerm, constituency, sort, direction }),
    onSuccess: ({ blob, filename }) => {
      downloadBlob(blob, filename)
      toast.success('Export downloaded.')
    },
    onError: (error) => toast.error(error.message),
  })

  const rows = membersQuery.data?.data ?? []
  const hasFilters = Boolean(searchTerm || constituency)
  const onSort = (field, nextDirection) => setParam({ sort: field, direction: nextDirection })

  return (
    <div>
      <PageHeader title="Members" description="Party members registered for this office.">
        <Button
          variant="outline"
          onClick={() => exportToExcel.mutate()}
          disabled={exportToExcel.isPending || rows.length === 0}
        >
          {exportToExcel.isPending ? <Spinner /> : <Download className="size-4" />}
          Export Excel
        </Button>
        {/* Carries the current filters, so you can print one constituency at a time. */}
        <Button asChild variant="outline">
          <Link to={`/members/badges?${params.toString()}`}>
            <QrCode className="size-4" />
            Print badges
          </Link>
        </Button>
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
        <TableSkeleton columns={7} />
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
                  <TableHead>
                    <SortableHead field={ATTENDANCE_SORT} sort={sort} direction={direction} onSort={onSort}>
                      Attendance
                    </SortableHead>
                  </TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <RowActions member={member} onDelete={setPendingDelete} />
                      </div>
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
                <CardContent className="p-4 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/members/${member.id}`}
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
                  <div className="mt-3 flex gap-1 border-t pt-2">
                    <RowActions member={member} onDelete={setPendingDelete} size="sm" />
                  </div>
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

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {fullName(pendingDelete) || 'this member'}?</DialogTitle>
            <DialogDescription>
              The member is archived rather than erased, so their attendance history is preserved and an
              administrator can restore them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate(pendingDelete)}
              disabled={remove.isPending}
            >
              {remove.isPending ? <Spinner /> : <Trash2 className="size-4" />}
              Delete member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
