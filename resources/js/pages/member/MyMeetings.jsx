import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, CalendarClock, ScanLine } from 'lucide-react'
import { Link } from 'react-router-dom'

import { memberApi } from '@/lib/memberApi'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, ErrorState, Spinner } from '@/components/common'
import { formatDate, formatTimeRange } from '@/lib/utils'

/**
 * The meetings this member attended, and their attendance rate.
 *
 * The rate needs a denominator the member can make sense of, so the API scopes
 * it to past meetings of their own office and says which scope it used. Where no
 * office is recorded there is nothing to scope by, and the caveat below says so
 * rather than presenting a number that looks more exact than it is.
 */
export default function MyMeetings() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['member', 'meetings'],
    queryFn: () => memberApi.meetings(),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="size-6 text-primary" />
      </div>
    )
  }

  if (error) return <ErrorState error={error} onRetry={refetch} />

  const meetings = data?.data ?? []
  const meta = data?.meta ?? {}
  const rate = meta.attendance_rate
  const next = meta.next_meeting

  return (
    <div className="space-y-4">
      {next && (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarClock className="size-4" />
                  Next meeting
                </p>
                <p className="mt-1 truncate font-semibold">{next.title}</p>
                <p className="text-sm text-muted-foreground">
                  {/* Times are optional: older meetings carry a date alone. */}
                  {[formatDate(next.date), formatTimeRange(next.start_time, next.end_time), next.office]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {next.topic && (
                  <p className="mt-1 text-sm text-muted-foreground">{next.topic}</p>
                )}
              </div>
              {next.checked_in ? (
                <p className="text-sm text-muted-foreground">Already checked in.</p>
              ) : (
                <Button asChild>
                  <Link to="/check-in">
                    <ScanLine className="size-4" />
                    Check in
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Attendance</p>
              <p className="text-3xl font-semibold tabular-nums">
                {rate === null || rate === undefined ? '—' : `${rate}%`}
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground tabular-nums">{meta.attended_count ?? 0}</strong>{' '}
                attended of{' '}
                <strong className="text-foreground tabular-nums">{meta.eligible_count ?? 0}</strong>{' '}
                past meetings
              </p>
              <p className="mt-0.5 text-xs">
                {meta.scope === 'office'
                  ? 'Counting past meetings of your office.'
                  : 'No office recorded for you, so every past meeting is counted — ask the office to set yours.'}
              </p>
            </div>
          </div>

          {meta.eligible_count === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              There are no past meetings to compare against yet.
            </p>
          )}
        </CardContent>
      </Card>

      {meetings.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No meetings yet"
          description="Once you check in to a meeting it will be listed here."
        >
          <Button asChild>
            <Link to="/check-in">
              <ScanLine className="size-4" />
              Check in to a meeting
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0 sm:p-0">
            <ul className="divide-y">
              {meetings.map((meeting) => (
                <li key={meeting.id} className="px-5 py-3">
                  <p className="truncate font-medium">{meeting.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {[formatDate(meeting.date), formatTimeRange(meeting.start_time, meeting.end_time)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
