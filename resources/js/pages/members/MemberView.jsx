import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { destroy, memberDocumentUrl, search, stats as fetchStats } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common'
import { MemberQrPanel } from '@/components/qr-badge'
import { constituencyLabel } from '@/lib/membership'
import { formatDate, fullName, initials } from '@/lib/utils'

/** Years between a date of birth and today; null when the date is unusable. */
function ageFromDateOfBirth(value) {
  if (!value) return null
  const born = new Date(value)
  if (Number.isNaN(born.getTime())) return null

  const today = new Date()
  let years = today.getFullYear() - born.getFullYear()
  const monthDelta = today.getMonth() - born.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < born.getDate())) years -= 1

  return years >= 0 && years < 130 ? years : null
}

/**
 * One label/value pair. Everything on this page reads as a definition list so a
 * field with no value still holds its place rather than shuffling the layout.
 */
function Item({ label, children, wide = false }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={empty ? 'mt-1 text-sm text-muted-foreground' : 'mt-1 text-sm'}>
        {empty ? '—' : children}
      </dd>
    </div>
  )
}

function Section({ title, description, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Grid({ children }) {
  return <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">{children}</dl>
}

/** A list of values shown as chips; falls back to the dash of an empty Item. */
function Chips({ values }) {
  if (!values?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Badge key={value} variant="secondary">
          {value}
        </Badge>
      ))}
    </div>
  )
}

function YesNo({ value }) {
  return value ? (
    <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
      <Check className="size-4" />
      Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <X className="size-4" />
      No
    </span>
  )
}

function DocumentLink({ memberId, kind, path, label }) {
  if (!path) return null
  return (
    <a
      href={memberDocumentUrl(memberId, kind)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-primary hover:underline"
    >
      <FileText className="size-4" />
      {label}
    </a>
  )
}

export default function MemberView() {
  const { id } = useParams()
  const memberId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmDelete, setConfirmDelete] = useState(false)

  const memberQuery = useQuery({
    queryKey: ['member', id],
    queryFn: () =>
      search('members', {
        filters: [{ field: 'id', operator: '=', value: memberId }],
        includes: [{ relation: 'office' }],
        aggregates: [{ relation: 'meetings', type: 'count' }],
        limit: 10,
      }).then((response) => response.data[0] ?? null),
  })

  // Attendance history: meetings are queried by the pivot rather than included,
  // so the newest ones come back first without sorting client side.
  const meetingsQuery = useQuery({
    queryKey: ['member-meetings', id],
    queryFn: () =>
      search('meetings', {
        filters: [{ field: 'members.id', operator: '=', value: memberId }],
        sorts: [{ field: 'date', direction: 'desc' }],
        limit: 100,
      }),
  })

  const statsQuery = useQuery({ queryKey: ['stats'], queryFn: fetchStats })

  const remove = useMutation({
    mutationFn: () => destroy('members', [memberId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Member deleted.')
      navigate('/members')
    },
    onError: (error) => toast.error(error.message),
  })

  if (memberQuery.error) {
    return <ErrorState error={memberQuery.error} onRetry={memberQuery.refetch} />
  }

  if (memberQuery.isPending) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const member = memberQuery.data

  if (!member) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptyState
          title="Member not found"
          description="This member may have been deleted, or belongs to another office."
        >
          <Button asChild size="sm">
            <Link to="/members">Back to members</Link>
          </Button>
        </EmptyState>
      </div>
    )
  }

  const name = fullName(member) || 'Unnamed member'
  const age = ageFromDateOfBirth(member.date_of_birth)
  const totalMeetings = statsQuery.data?.data?.total_meetings ?? 0
  const attended = member.meetings_count ?? 0
  const rate = totalMeetings ? Math.round((attended / totalMeetings) * 10000) / 100 : 0
  const meetings = meetingsQuery.data?.data ?? []

  return (
    <div className="mx-auto max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/members">
          <ArrowLeft className="size-4" />
          Back to members
        </Link>
      </Button>

      <PageHeader title={name} description={constituencyLabel(member.constituency) ?? 'No constituency recorded'}>
        <Button asChild variant="outline">
          <Link to={`/members/${member.id}/edit`}>
            <Pencil className="size-4" />
            Edit
          </Link>
        </Button>
        <Button
          variant="outline"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </PageHeader>

      <div className="space-y-5">
        {/* ------------------------------------------------ At a glance */}
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {initials(member.first_name, member.last_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{name}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {member.phone ? (
                  <a href={`tel:${member.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                    <Phone className="size-3.5" />
                    <span className="tabular-nums">{member.phone}</span>
                  </a>
                ) : null}
                {member.email ? (
                  <a href={`mailto:${member.email}`} className="inline-flex items-center gap-1.5 truncate hover:text-foreground">
                    <Mail className="size-3.5" />
                    <span className="truncate">{member.email}</span>
                  </a>
                ) : null}
                {member.office?.name ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    {member.office.name}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-6 sm:border-l sm:pl-6">
              <div className="text-center">
                <p className="text-2xl font-semibold tabular-nums">{attended}</p>
                <p className="text-xs text-muted-foreground">Meetings</p>
              </div>
              <div className="text-center">
                <Badge variant={rate >= 66 ? 'success' : rate >= 33 ? 'default' : 'destructive'}>{rate}%</Badge>
                <p className="mt-1 text-xs text-muted-foreground">Attendance</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------ Personal */}
        <Section title="Personal information">
          <Grid>
            <Item label="First name">{member.first_name}</Item>
            <Item label="Last name">{member.last_name}</Item>
            <Item label="Date of birth">
              {member.date_of_birth ? (
                <>
                  {formatDate(member.date_of_birth)}
                  {age !== null ? <span className="text-muted-foreground"> · {age} years old</span> : null}
                </>
              ) : null}
            </Item>
            <Item label="National ID">{member.national_id}</Item>
            <Item label="Gender">{member.gender}</Item>
            <Item label="Age group">{member.age}</Item>
          </Grid>
        </Section>

        {/* ------------------------------------------------ Contact */}
        <Section title="Contact details">
          <Grid>
            <Item label="Mobile number">
              {member.phone ? (
                <a href={`tel:${member.phone}`} className="tabular-nums text-primary hover:underline">
                  {member.phone}
                </a>
              ) : null}
            </Item>
            <Item label="On WhatsApp">
              <YesNo value={member.whatsapp_available} />
            </Item>
            <Item label="Alternative contact">
              {member.alternative_contact ? (
                <span className="tabular-nums">{member.alternative_contact}</span>
              ) : null}
            </Item>
            <Item label="Email address">
              {member.email ? (
                <a href={`mailto:${member.email}`} className="break-all text-primary hover:underline">
                  {member.email}
                </a>
              ) : null}
            </Item>
            <Item label="Residential address" wide>
              {member.address}
            </Item>
            <Item label="Constituency">{constituencyLabel(member.constituency)}</Item>
            <Item label="Office">{member.office?.name}</Item>
          </Grid>
        </Section>

        {/* ------------------------------------------------ Professional */}
        <Section title="Professional background">
          <Grid>
            <Item label="Profession">{member.profession}</Item>
            <Item label="Employer">{member.employer_name}</Item>
            <Item label="Skills / expertise" wide>
              {member.skills_expertise ? (
                <p className="whitespace-pre-line leading-relaxed">{member.skills_expertise}</p>
              ) : null}
            </Item>
          </Grid>
        </Section>

        {/* ------------------------------------------------ Engagement */}
        <Section title="Engagement">
          <Grid>
            <Item label="Preferred communication">
              <Chips values={member.communication_preferences} />
            </Item>
            <Item label="How they heard about us">{member.how_heard_about_us}</Item>
            <Item label="Volunteer interests" wide>
              <Chips values={member.volunteer_interests} />
            </Item>
            <Item label="Referred by">{member.referrer_name}</Item>
            <Item label="Referrer contact">
              {member.referrer_contact ? (
                <span className="tabular-nums">{member.referrer_contact}</span>
              ) : null}
            </Item>
          </Grid>
        </Section>

        {/* ------------------------------------------------ Documents */}
        <Section title="Documents" description="Opens through the API, which re-checks permissions on every request.">
          <Grid>
            <Item label="CV / Resume">
              <DocumentLink memberId={member.id} kind="cv" path={member.cv_path} label="View CV" />
            </Item>
            <Item label="National ID & birth certificate">
              <DocumentLink
                memberId={member.id}
                kind="documents"
                path={member.documents_path}
                label="View documents"
              />
            </Item>
            <Item label="Documents confirmed">
              <YesNo value={member.documents_confirmed} />
            </Item>
          </Grid>
        </Section>

        {/* ------------------------------------------------ Badge */}
        <Section title="Attendance badge" description="Printed QR code used to record this member at a meeting.">
          <MemberQrPanel member={member} />
        </Section>

        {/* ------------------------------------------------ History */}
        <Section
          title="Meetings attended"
          description={
            meetingsQuery.isPending
              ? undefined
              : `${meetings.length} of ${totalMeetings || meetings.length} recorded meetings.`
          }
        >
          {meetingsQuery.error ? (
            <ErrorState error={meetingsQuery.error} onRetry={meetingsQuery.refetch} />
          ) : meetingsQuery.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
          ) : meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This member has not been recorded at any meeting yet.
            </p>
          ) : (
            /*
              Five rows then a scrollbar: a member with a long history must not
              push the sections below it off the page. Rows are a fixed 3.5rem
              whether or not they carry a topic, so the cap is exactly five of
              them plus the four 1px dividers between.
            */
            <ul className="max-h-[17.75rem] divide-y overflow-y-auto overscroll-contain">
              {meetings.map((meeting) => (
                <li key={meeting.id} className="flex h-14 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/meetings/${meeting.id}/attendance`}
                      className="block truncate font-medium text-primary hover:underline"
                    >
                      {meeting.title || 'Untitled meeting'}
                    </Link>
                    {meeting.topic ? (
                      <p className="truncate text-xs text-muted-foreground">{meeting.topic}</p>
                    ) : null}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    {formatDate(meeting.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ------------------------------------------------ Record */}
        <Section title="Record">
          <Grid>
            <Item label="Registered">{formatDate(member.created_at)}</Item>
            <Item label="Last updated">{formatDate(member.updated_at)}</Item>
          </Grid>
        </Section>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              The member is archived rather than erased, so their attendance history is preserved and an
              administrator can restore them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? <Spinner /> : <Trash2 className="size-4" />}
              Delete member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
