import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Pencil, Plus, ScanLine, UserMinus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { runAction, search } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState, Field, PageHeader, SearchInput, Spinner } from '@/components/common'
import { MeetingCheckInCode } from '@/components/meeting-checkin-code'
import { ScrollList } from '@/components/scroll-list'
import { QrScannerDialog } from '@/components/qr-scanner'
import { formatDate, formatTimeRange, fullName, humanizeValidationMessage } from '@/lib/utils'

const PAGE_SIZE = 100

/**
 * Rows read "first_name last_name", so both panels sort on the same two columns
 * in that order. Sorting on last_name alone left the list looking unsorted and
 * pushed every member without a surname to the top.
 */
const NAME_SORT = [
  { field: 'first_name', direction: 'asc' },
  { field: 'last_name', direction: 'asc' },
]

const NEW_MEMBER = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
  constituency: '',
}

/** Turns a Lomkit paginator into an infinite query over every matching row. */
function usePagedMembers(queryKey, payload, options) {
  return useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => search('members', { ...payload, page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage) =>
      lastPage.current_page < lastPage.last_page ? lastPage.current_page + 1 : undefined,
    ...options,
  })
}

/*
 * How often the screen asks whether anyone new has arrived.
 *
 * Members can now check themselves in from their own phone (/check-in), so this
 * screen cannot assume it caused every change. There is no broadcasting in this
 * app -- BROADCAST_CONNECTION is `log` and there is no websocket server -- so it
 * polls. React Query pauses interval refetches while the tab is in the
 * background, so an abandoned screen stops asking on its own.
 */
const LIVE_POLL_MS = 5000

/* Returning to the tab should show the truth immediately, not on the next tick.
   The app-wide default has focus refetching off, so it is re-enabled here. */
const LIVE = { refetchOnWindowFocus: true, staleTime: 0 }

function MemberLine({ children }) {
  return <li className="flex items-center justify-between gap-3 px-1 py-2.5">{children}</li>
}

function LineSkeletons({ count = 8 }) {
  return (
    <div className="space-y-2 p-1">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-12" />
      ))}
    </div>
  )
}

export default function Attendance() {
  const { id } = useParams()
  const meetingId = Number(id)
  const queryClient = useQueryClient()

  const [params, setParams] = useSearchParams()
  const term = params.get('q') || ''

  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanLog, setScanLog] = useState([])
  /* The verdict on the badge just read; the scanner holds until it arrives. */
  const [scanResult, setScanResult] = useState(null)
  const [newMemberOpen, setNewMemberOpen] = useState(false)
  const [newMember, setNewMember] = useState(NEW_MEMBER)
  const [newMemberErrors, setNewMemberErrors] = useState({})

  const setTerm = (value) => {
    const next = new URLSearchParams(params)
    if (value) next.set('q', value)
    else next.delete('q')
    setParams(next, { replace: true })
  }

  const meetingQuery = useQuery({
    queryKey: ['meeting', id],
    queryFn: () =>
      search('meetings', {
        filters: [{ field: 'id', operator: '=', value: meetingId }],
        includes: [{ relation: 'office' }],
        aggregates: [{ relation: 'members', type: 'count' }],
        limit: 10,
      }).then((response) => response.data[0] ?? null),

    /*
     * Only this query is on a timer. It is a single row carrying the participant
     * count, so it is the cheap way to notice a change; the two lists below are
     * infinite queries, and polling those would re-request every page the
     * operator has scrolled through, every tick.
     */
    refetchInterval: LIVE_POLL_MS,
    refetchIntervalInBackground: false,
    ...LIVE,
  })

  /*
   * Most recently recorded first, so whoever was just scanned in lands at the
   * top of the panel where it can be confirmed at a glance. The ordering lives
   * in a scope because it sorts on the pivot's timestamps, which are not fields
   * of the member resource; `sorts` is left out so the resource's default name
   * ordering does not win (the scope reorders).
   */
  const participantsPayload = useMemo(
    () => ({
      filters: [{ field: 'meetings.id', operator: '=', value: meetingId }],
      scopes: [{ name: 'orderByAttendanceAddedAt', parameters: [meetingId] }],
    }),
    [meetingId],
  )

  const participantsQuery = usePagedMembers(['attendance', meetingId], participantsPayload, LIVE)

  /*
   * Every member of the office is offered, not just the first page: the panel
   * pulls the next page as it scrolls. The aggregate counts *this* meeting among
   * each member's meetings, so a row knows whether it is already registered
   * without holding every participant id in memory.
   */
  const candidatesPayload = useMemo(() => {
    const filters = []
    if (term) {
      filters.push({
        nested: [
          { field: 'first_name', operator: 'like', value: `%${term}%` },
          { field: 'last_name', operator: 'like', value: `%${term}%`, type: 'or' },
        ],
      })
    }

    return {
      filters,
      sorts: NAME_SORT,
      aggregates: [
        {
          relation: 'meetings',
          type: 'count',
          filters: [{ field: 'id', operator: '=', value: meetingId }],
        },
      ],
    }
  }, [term, meetingId])

  const candidatesQuery = usePagedMembers(
    ['attendance-candidates', meetingId, term],
    candidatesPayload,
    LIVE,
  )

  /*
   * The poll above watches the participant count; this turns a change in it into
   * a reload of the lists. So a member checking themselves in on their phone
   * shows up on the door screen within one poll, without the lists being
   * refetched on every tick when nothing has happened.
   *
   * The first reading only seeds the ref -- there is nothing to reload on the
   * initial load, and invalidating there would refetch the lists the moment they
   * arrived.
   *
   * Known gap: one arrival plus one removal between two polls leaves the count
   * unchanged and the lists briefly stale. Rare, self-corrects on the next real
   * change, and cheaper than polling three paginated queries forever.
   */
  const knownCountRef = useRef(null)
  const liveCount = meetingQuery.data?.members_count ?? null

  useEffect(() => {
    if (liveCount === null) return

    if (knownCountRef.current === null) {
      knownCountRef.current = liveCount

      return
    }

    if (knownCountRef.current !== liveCount) {
      knownCountRef.current = liveCount
      queryClient.invalidateQueries({ queryKey: ['attendance', meetingId] })
      queryClient.invalidateQueries({ queryKey: ['attendance-candidates', meetingId] })
    }
  }, [liveCount, meetingId, queryClient])

  const refreshAttendance = () => {
    queryClient.invalidateQueries({ queryKey: ['attendance', meetingId] })
    queryClient.invalidateQueries({ queryKey: ['attendance-candidates', meetingId] })
    queryClient.invalidateQueries({ queryKey: ['meeting', id] })
    queryClient.invalidateQueries({ queryKey: ['meetings'] })
    queryClient.invalidateQueries({ queryKey: ['members'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
  }

  const attach = useMutation({
    mutationFn: (fields) =>
      runAction('meetings', 'attach-member-to-meeting', {
        filters: [{ field: 'id', operator: '=', value: meetingId }],
        fields,
      }),
    onSuccess: () => {
      refreshAttendance()
      toast.success('Attendance recorded.')
    },
    onError: (error) => {
      if (error.isValidation) setNewMemberErrors(error.errors ?? {})
      else toast.error(error.message)
    },
  })

  const detach = useMutation({
    mutationFn: (memberId) =>
      runAction('meetings', 'detach-member-from-meeting', {
        filters: [{ field: 'id', operator: '=', value: meetingId }],
        fields: { member_id: memberId },
      }),
    onSuccess: () => {
      refreshAttendance()
      toast.success('Attendance removed.')
    },
    onError: (error) => toast.error(error.message),
  })

  /** Records one outcome, both in the running log and as the panel's verdict. */
  const reportScan = (entry) => {
    const outcome = { at: Date.now(), ...entry }
    setScanResult(outcome)
    setScanLog((current) => [outcome, ...current].slice(0, 20))
  }

  /**
   * A scanned badge goes through the very same action as the manual "Add"
   * button, so it inherits the idempotent attach and the office scoping.
   *
   * The member is looked up *before* attaching rather than after. Two reasons:
   * the aggregate says whether they are already on this meeting, which the
   * idempotent attach cannot report back on its own; and it names them even
   * when nothing is attached, so "already scanned" can say who.
   */
  const handleScan = async (token) => {
    try {
      const found = await search('members', {
        filters: [{ field: 'qr_token', operator: '=', value: token }],
        aggregates: [
          {
            relation: 'meetings',
            type: 'count',
            filters: [{ field: 'id', operator: '=', value: meetingId }],
          },
        ],
        limit: 10,
      })

      const member = found.data?.[0]

      // Office scoped, so another office's badge is indistinguishable from an
      // unknown one -- which is the correct answer to give at this door.
      if (!member) {
        reportScan({ label: 'Unknown badge', status: 'failed' })
        return
      }

      const label = fullName(member) || `Member #${member.id}`

      if ((member.meetings_count ?? 0) > 0) {
        reportScan({ label, status: 'already' })
        return
      }

      await attach.mutateAsync({ qr_token: token })
      reportScan({ label, status: 'added' })
    } catch (error) {
      reportScan({
        label: error.status === 404 ? 'Unknown badge' : error.message,
        status: 'failed',
      })
    }
  }

  const createAndAttach = async (event) => {
    event.preventDefault()
    setNewMemberErrors({})

    try {
      await attach.mutateAsync({
        first_name: newMember.first_name || null,
        last_name: newMember.last_name || null,
        email: newMember.email || null,
        phone: newMember.phone || null,
        address: newMember.address || null,
        constituency: newMember.constituency || null,
      })
      setNewMember(NEW_MEMBER)
      setNewMemberOpen(false)
    } catch {
      // Surfaced by the mutation's onError.
    }
  }

  if (meetingQuery.error) {
    return <ErrorState error={meetingQuery.error} onRetry={meetingQuery.refetch} />
  }

  const meeting = meetingQuery.data
  const participants = participantsQuery.data?.pages.flatMap((page) => page.data) ?? []
  const participantsTotal = participantsQuery.data?.pages[0]?.total ?? 0
  const candidates = candidatesQuery.data?.pages.flatMap((page) => page.data) ?? []
  const candidatesTotal = candidatesQuery.data?.pages[0]?.total ?? 0

  const newMemberErrorFor = (field) =>
    humanizeValidationMessage(newMemberErrors[`fields.${field}`]?.[0] ?? newMemberErrors[field]?.[0])

  return (
    /*
     * From lg up the page is pinned to the viewport: the two panels each scroll
     * internally so the header and both column titles stay put. Below lg the page
     * scrolls normally and each list is capped instead, which keeps both panels
     * reachable on a phone.
     */
    <div className="flex flex-col lg:h-[calc(100dvh-7rem)] lg:overflow-hidden">
      <div className="shrink-0">
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link to="/meetings">
            <ArrowLeft className="size-4" />
            Back to meetings
          </Link>
        </Button>

        {meetingQuery.isPending ? (
          <Skeleton className="mb-6 h-20" />
        ) : (
          <PageHeader
            title={meeting?.title || 'Untitled meeting'}
            description={[
              formatDate(meeting?.date),
              formatTimeRange(meeting?.start_time, meeting?.end_time),
              meeting?.office?.name,
              meeting?.topic,
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <Badge variant="secondary" className="self-center px-3 py-1 text-sm">
              {meeting?.members_count ?? 0} participant{meeting?.members_count === 1 ? '' : 's'}
            </Badge>
            {/*
              Members check themselves in by scanning this; the badge scanner
              below stays for the door desk, since it needs no phone from them.
            */}
            <MeetingCheckInCode meeting={meeting} />
            <Button asChild variant="outline">
              <Link to={`/meetings/${id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
          </PageHeader>
        )}
      </div>

      <div className="grid min-h-0 gap-4 lg:flex-1 lg:grid-cols-2 lg:gap-6">
        {/* ------------------------------------------------ Add participants */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 gap-3 border-b">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                Add participants
                {candidatesTotal ? (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {candidatesTotal} member{candidatesTotal === 1 ? '' : 's'}
                  </span>
                ) : null}
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setScannerOpen(true)}>
                  <ScanLine className="size-4" />
                  Scan
                </Button>
                <Button size="sm" variant="outline" onClick={() => setNewMemberOpen(true)}>
                  <Plus className="size-4" />
                  New member
                </Button>
              </div>
            </div>
            <SearchInput value={term} onChange={setTerm} placeholder="Search members" />
          </CardHeader>

          {candidatesQuery.error ? (
            <CardContent className="pt-5 sm:pt-6">
              <ErrorState error={candidatesQuery.error} onRetry={candidatesQuery.refetch} />
            </CardContent>
          ) : candidatesQuery.isPending ? (
            <CardContent className="pt-5 sm:pt-6">
              <LineSkeletons />
            </CardContent>
          ) : candidates.length === 0 ? (
            <CardContent className="pt-5 sm:pt-6">
              <EmptyState
                icon={UserPlus}
                title="No members match"
                description="Try another name, or create a new member."
              />
            </CardContent>
          ) : (
            <ScrollList
              className="max-h-[55vh] flex-1 px-4 py-2 lg:max-h-none"
              onReachEnd={() =>
                candidatesQuery.hasNextPage && !candidatesQuery.isFetchingNextPage
                  ? candidatesQuery.fetchNextPage()
                  : undefined
              }
            >
              <ul className="divide-y">
                {candidates.map((member) => {
                  const alreadyIn = (member.meetings_count ?? 0) > 0
                  return (
                    <MemberLine key={member.id}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {fullName(member) || 'Unnamed member'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[member.phone, member.email].filter(Boolean).join(' · ') ||
                            'No contact details'}
                        </p>
                      </div>
                      {alreadyIn ? (
                        <Badge variant="success" className="shrink-0 gap-1">
                          <Check className="size-3" />
                          Added
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          disabled={attach.isPending}
                          onClick={() => attach.mutate({ member_id: member.id })}
                        >
                          <UserPlus className="size-4" />
                          Add
                        </Button>
                      )}
                    </MemberLine>
                  )
                })}
              </ul>

              {candidatesQuery.isFetchingNextPage ? (
                <div className="flex justify-center py-3">
                  <Spinner className="text-muted-foreground" />
                </div>
              ) : null}

              {!candidatesQuery.hasNextPage && candidates.length > PAGE_SIZE ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  All {candidatesTotal} members loaded.
                </p>
              ) : null}
            </ScrollList>
          )}
        </Card>

        {/* ------------------------------------------------ Participants */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 border-b">
            <CardTitle className="text-base">
              Participants
              {participantsTotal ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {participantsTotal}
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>

          {participantsQuery.error ? (
            <CardContent className="pt-5 sm:pt-6">
              <ErrorState error={participantsQuery.error} onRetry={participantsQuery.refetch} />
            </CardContent>
          ) : participantsQuery.isPending ? (
            <CardContent className="pt-5 sm:pt-6">
              <LineSkeletons />
            </CardContent>
          ) : participants.length === 0 ? (
            <CardContent className="pt-5 sm:pt-6">
              <EmptyState
                icon={UserPlus}
                title="No participants yet"
                description="Add members from the list to record their attendance."
              />
            </CardContent>
          ) : (
            <ScrollList
              className="max-h-[55vh] flex-1 px-4 py-2 lg:max-h-none"
              onReachEnd={() =>
                participantsQuery.hasNextPage && !participantsQuery.isFetchingNextPage
                  ? participantsQuery.fetchNextPage()
                  : undefined
              }
            >
              <ul className="divide-y">
                {participants.map((member) => (
                  <MemberLine key={member.id}>
                    <div className="min-w-0">
                      <Link
                        to={`/members/${member.id}/edit`}
                        className="block truncate text-sm font-medium text-primary hover:underline"
                      >
                        {fullName(member) || 'Unnamed member'}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {[member.phone, member.email].filter(Boolean).join(' · ') ||
                          'No contact details'}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove ${fullName(member)}`}
                      disabled={detach.isPending}
                      onClick={() => detach.mutate(member.id)}
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  </MemberLine>
                ))}
              </ul>

              {participantsQuery.isFetchingNextPage ? (
                <div className="flex justify-center py-3">
                  <Spinner className="text-muted-foreground" />
                </div>
              ) : null}
            </ScrollList>
          )}
        </Card>
      </div>

      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={(next) => {
          setScannerOpen(next)
          if (!next) {
            setScanLog([])
            setScanResult(null)
          }
        }}
        onToken={handleScan}
        log={scanLog}
        result={scanResult}
        onContinue={() => setScanResult(null)}
      />

      <Dialog open={newMemberOpen} onOpenChange={setNewMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New member</DialogTitle>
          </DialogHeader>
          <form onSubmit={createAndAttach} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="nm_first" label="First name" error={newMemberErrorFor('first_name')}>
                <Input
                  id="nm_first"
                  value={newMember.first_name}
                  onChange={(event) => setNewMember((c) => ({ ...c, first_name: event.target.value }))}
                  autoFocus
                />
              </Field>
              <Field id="nm_last" label="Last name" error={newMemberErrorFor('last_name')}>
                <Input
                  id="nm_last"
                  value={newMember.last_name}
                  onChange={(event) => setNewMember((c) => ({ ...c, last_name: event.target.value }))}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="nm_phone" label="Phone" error={newMemberErrorFor('phone')}>
                <Input
                  id="nm_phone"
                  type="tel"
                  inputMode="tel"
                  value={newMember.phone}
                  onChange={(event) => setNewMember((c) => ({ ...c, phone: event.target.value }))}
                />
              </Field>
              <Field id="nm_email" label="Email" error={newMemberErrorFor('email')}>
                <Input
                  id="nm_email"
                  type="email"
                  value={newMember.email}
                  onChange={(event) => setNewMember((c) => ({ ...c, email: event.target.value }))}
                />
              </Field>
            </div>
            <Field id="nm_address" label="Address" error={newMemberErrorFor('address')}>
              <Input
                id="nm_address"
                value={newMember.address}
                onChange={(event) => setNewMember((c) => ({ ...c, address: event.target.value }))}
              />
            </Field>
            <Field id="nm_constituency" label="Constituency" error={newMemberErrorFor('constituency')}>
              <Input
                id="nm_constituency"
                inputMode="numeric"
                value={newMember.constituency}
                onChange={(event) => setNewMember((c) => ({ ...c, constituency: event.target.value }))}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewMemberOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={attach.isPending}>
                {attach.isPending ? <Spinner /> : <UserPlus className="size-4" />}
                Create and add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
