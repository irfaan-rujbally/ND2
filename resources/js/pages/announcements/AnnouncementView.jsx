import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, MailX, Pencil, Send, Users } from 'lucide-react'
import { toast } from 'sonner'
import { announcementImageUrl, fetchAnnouncementRecipients, runAction, search } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  Spinner,
} from '@/components/common'
import { AGE_RANGES, CONSTITUENCIES, constituencyLabel } from '@/lib/membership'
import { formatDate, fullName } from '@/lib/utils'

const EMAIL_FILTERS = [
  { value: 'with', label: 'With an email address' },
  { value: 'without', label: 'Without an email address' },
]

/**
 * A member can be picked only if there is somewhere to send to and they have not
 * already had this announcement.
 *
 * Already-sent members stay in the list but cannot be re-selected: the send
 * action skips them anyway, so offering the checkbox would promise something it
 * would not do. A previous *failure* is different — no mail arrived, so those
 * rows stay selectable and a second send retries them.
 */
function isSelectable(row) {
  return Boolean(row.email) && !row.sent_at
}

function RowStatus({ row }) {
  if (row.sent_at) {
    // nowrap: "Sent 21 Aug 2026" was breaking across three lines and pushing the
    // row twice as tall as its neighbours.
    return <Badge variant="success" className="whitespace-nowrap">Sent {formatDate(row.sent_at)}</Badge>
  }

  if (row.error) {
    // The transport's own message, which is the only thing that explains a
    // bounce. Truncated on screen, complete in the tooltip.
    return (
      <span title={row.error} className="inline-flex items-center gap-1">
        <Badge variant="destructive">Failed</Badge>
      </span>
    )
  }

  if (!row.email) {
    return <span className="whitespace-nowrap text-xs text-muted-foreground">No email address</span>
  }

  return <span className="text-muted-foreground">—</span>
}

/**
 * The header checkbox.
 *
 * Native rather than the Radix component, because "some but not all" needs the
 * indeterminate property, and that can only be set imperatively.
 */
function SelectAllCheckbox({ checked, indeterminate, disabled, onChange, label }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={label}
      className="size-4 rounded border-input accent-primary disabled:opacity-50"
    />
  )
}

export default function AnnouncementView() {
  const { id } = useParams()
  const queryClient = useQueryClient()

  /*
   * Selection is held as a Set of member ids and deliberately survives a change
   * of filter, so several passes can be combined -- filter to 18-30, select all,
   * then filter to a constituency and add those. The count in the toolbar and in
   * the confirmation dialog is what keeps that honest.
   */
  const [selected, setSelected] = useState(() => new Set())
  const [confirmSend, setConfirmSend] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [ageGroup, setAgeGroup] = useState('')
  const [constituency, setConstituency] = useState('')
  const [emailFilter, setEmailFilter] = useState('')

  const announcementQuery = useQuery({
    queryKey: ['announcement', id],
    queryFn: () =>
      search('announcements', {
        filters: [{ field: 'id', operator: '=', value: Number(id) }],
        includes: [{ relation: 'author' }],
        limit: 10,
      }).then((response) => response.data[0] ?? null),
  })

  const recipientsQuery = useQuery({
    queryKey: ['announcement-recipients', id],
    queryFn: () => fetchAnnouncementRecipients(id),
  })

  const rows = recipientsQuery.data?.data ?? []
  const meta = recipientsQuery.data?.meta

  /* Filtering runs here rather than on the server: the whole register arrives in
   * one response precisely so that changing a filter costs nothing. */
  const visible = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return rows.filter((row) => {
      if (term) {
        const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.toLowerCase()
        const email = (row.email ?? '').toLowerCase()
        if (!name.includes(term) && !email.includes(term)) return false
      }

      if (ageGroup && row.age !== ageGroup) return false
      if (constituency && String(row.constituency ?? '') !== constituency) return false
      if (emailFilter === 'with' && !row.email) return false
      if (emailFilter === 'without' && row.email) return false

      return true
    })
  }, [rows, searchTerm, ageGroup, constituency, emailFilter])

  const selectableVisible = useMemo(() => visible.filter(isSelectable), [visible])

  const allVisibleSelected =
    selectableVisible.length > 0 && selectableVisible.every((row) => selected.has(row.id))
  const someVisibleSelected =
    !allVisibleSelected && selectableVisible.some((row) => selected.has(row.id))

  const toggleAllVisible = (checked) => {
    setSelected((current) => {
      const next = new Set(current)
      selectableVisible.forEach((row) => (checked ? next.add(row.id) : next.delete(row.id)))
      return next
    })
  }

  const toggleOne = (row, checked) => {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(row.id)
      else next.delete(row.id)
      return next
    })
  }

  const send = useMutation({
    mutationFn: () =>
      runAction('announcements', 'send-announcement-to-members', {
        filters: [{ field: 'id', operator: '=', value: Number(id) }],
        fields: { member_ids: Array.from(selected) },
      }),
    onSuccess: () => {
      const count = selected.size
      queryClient.invalidateQueries({ queryKey: ['announcement-recipients', id] })
      queryClient.invalidateQueries({ queryKey: ['announcement', id] })
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      setSelected(new Set())
      setConfirmSend(false)
      toast.success(`Announcement sent to ${count} member${count === 1 ? '' : 's'}.`)
    },
    onError: (error) => {
      setConfirmSend(false)
      toast.error(error.message)
    },
  })

  const hasFilters = Boolean(searchTerm || ageGroup || constituency || emailFilter)
  const resetFilters = () => {
    setSearchTerm('')
    setAgeGroup('')
    setConstituency('')
    setEmailFilter('')
  }

  if (announcementQuery.error) {
    return <ErrorState error={announcementQuery.error} onRetry={announcementQuery.refetch} />
  }

  if (announcementQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const announcement = announcementQuery.data

  if (!announcement) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Announcement not found"
        description="It may have been deleted, or it belongs to another office."
      >
        <Button asChild size="sm">
          <Link to="/announcements">Back to announcements</Link>
        </Button>
      </EmptyState>
    )
  }

  const imageUrl = announcementImageUrl(announcement)

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/announcements">
          <ArrowLeft className="size-4" />
          Back to announcements
        </Link>
      </Button>

      <PageHeader title={announcement.title}>
        <Button asChild variant="outline">
          <Link to={`/announcements/${id}/edit`}>
            <Pencil className="size-4" />
            Edit
          </Link>
        </Button>
      </PageHeader>

      {/* ---------------------------------------------------------- the notice */}

      <Card className="mb-6">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="max-h-80 w-full rounded-t-xl bg-muted/40 object-contain"
          />
        ) : null}
        <CardContent className="space-y-4 p-4 sm:p-6">
          {announcement.description ? (
            // whitespace-pre-line to match the email, where the only formatting
            // carried over from the textarea is the line breaks.
            <p className="whitespace-pre-line text-sm leading-relaxed">{announcement.description}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">No description.</p>
          )}

          <dl className="grid gap-2 border-t pt-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd>{formatDate(announcement.created_at) || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Author</dt>
              <dd>{fullName(announcement.author) || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Emailed to</dt>
              <dd>
                {announcement.sent_count ?? 0} member
                {(announcement.sent_count ?? 0) === 1 ? '' : 's'}
                {announcement.pending_count ? ` (${announcement.pending_count} queued)` : ''}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ the recipients */}

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-base">Send by email</CardTitle>
          <p className="text-sm text-muted-foreground">
            {meta
              ? `${meta.with_email} of ${meta.total} members have an email address. ` +
                `${meta.sent} already received this announcement` +
                (meta.failed ? `, ${meta.failed} failed.` : '.')
              : 'Choose who should receive this announcement.'}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search by name or email" />

            <Select value={ageGroup} onValueChange={setAgeGroup}>
              <SelectTrigger aria-label="Filter by age group">
                <SelectValue placeholder="All age groups" />
              </SelectTrigger>
              <SelectContent>
                {AGE_RANGES.map((range) => (
                  <SelectItem key={range} value={range}>
                    {range}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={constituency} onValueChange={setConstituency}>
              <SelectTrigger aria-label="Filter by constituency">
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

            <Select value={emailFilter} onValueChange={setEmailFilter}>
              <SelectTrigger aria-label="Filter by email address">
                <SelectValue placeholder="With or without email" />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selection toolbar */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <SelectAllCheckbox
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                disabled={selectableVisible.length === 0}
                onChange={toggleAllVisible}
                label="Select all listed members"
              />
              Select all {selectableVisible.length > 0 ? `(${selectableVisible.length})` : ''}
            </label>

            <span className="text-sm text-muted-foreground">
              {selected.size} selected
              {hasFilters ? ' in total, across all filters' : ''}
            </span>

            {selected.size > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            ) : null}

            {hasFilters ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Reset filters
              </Button>
            ) : null}

            <Button
              className="ml-auto"
              onClick={() => setConfirmSend(true)}
              disabled={selected.size === 0 || send.isPending}
            >
              {send.isPending ? <Spinner /> : <Send className="size-4" />}
              Send to {selected.size || 0}
            </Button>
          </div>

          {/* The list */}
          {recipientsQuery.error ? (
            <ErrorState error={recipientsQuery.error} onRetry={recipientsQuery.refetch} />
          ) : recipientsQuery.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-11" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members in this office"
              description="Add members before sending an announcement."
            >
              <Button asChild size="sm">
                <Link to="/members/create">New Member</Link>
              </Button>
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={MailX}
              title="No members match these filters"
              description="Try a different age group or constituency, or reset the filters."
            />
          ) : (
            /* A fixed-height scroller rather than pagination: picking recipients
               means comparing rows, and paging would reset the reader's place on
               every filter change. */
            <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                    <TableHead className="hidden lg:table-cell">Age</TableHead>
                    <TableHead className="hidden lg:table-cell">Constituency</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => {
                    const selectable = isSelectable(row)
                    const checked = selected.has(row.id)

                    return (
                      <TableRow key={row.id} className={checked ? 'bg-primary/5' : undefined}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!selectable}
                            onChange={(event) => toggleOne(row, event.target.checked)}
                            aria-label={`Select ${fullName(row) || 'member'}`}
                            className="size-4 rounded border-input accent-primary disabled:opacity-40"
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {fullName(row) || 'Unnamed member'}
                          {/* On a narrow screen the email column is hidden, so
                              the address moves under the name rather than away. */}
                          <span className="block truncate text-xs font-normal text-muted-foreground sm:hidden">
                            {row.email || 'No email address'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden max-w-56 truncate text-muted-foreground sm:table-cell">
                          {row.email || '-'}
                        </TableCell>
                        {/* nowrap: an age range is a single token, and "41-50"
                            was breaking after the hyphen into two lines. */}
                        <TableCell className="hidden whitespace-nowrap lg:table-cell">
                          {row.age || '-'}
                        </TableCell>
                        <TableCell
                          className="hidden max-w-56 truncate lg:table-cell"
                          title={constituencyLabel(row.constituency) ?? undefined}
                        >
                          {constituencyLabel(row.constituency) || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <RowStatus row={row} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmSend} onOpenChange={setConfirmSend}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Email “{announcement.title}” to {selected.size} member
              {selected.size === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>
              This cannot be undone. Members who have already received this announcement are skipped, so
              nobody is emailed twice. Mail is sent from app@nouveauxdemocrates.com, which accepts no
              replies.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSend(false)}>
              Cancel
            </Button>
            <Button onClick={() => send.mutate()} disabled={send.isPending}>
              {send.isPending ? <Spinner /> : <Send className="size-4" />}
              Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
