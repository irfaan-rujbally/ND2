import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarDays, TrendingUp, UserCheck, Users } from 'lucide-react'
import { stats as fetchStats } from '@/lib/api'
import { useAuth } from '@/auth/AuthProvider'
import { ThreeBackground } from '@/components/ThreeBackground'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common'
import { formatDate } from '@/lib/utils'

/**
 * Label sits top-left with the icon top-right so the tile uses its full width
 * instead of leaving a gap, then the number leads and a caption gives it meaning.
 * `progress` (0-100) draws a bar for values that are a share of something.
 */
function StatCard({ icon: Icon, label, value, suffix, caption, progress }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
            {label}
          </p>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary sm:size-9">
            <Icon className="size-4 sm:size-[18px]" />
          </span>
        </div>

        <p className="mt-2 text-2xl font-bold leading-none tabular-nums sm:mt-3 sm:text-3xl">
          {value}
          {suffix ? (
            <span className="ml-1 text-base font-semibold text-muted-foreground sm:text-lg">{suffix}</span>
          ) : null}
        </p>

        {caption ? (
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground sm:mt-2 sm:text-xs">{caption}</p>
        ) : null}

        {progress != null ? (
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  })

  const summary = data?.data

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-nd-blue via-primary to-nd-red p-6 sm:p-8">
        <ThreeBackground className="pointer-events-none absolute inset-0" density={0.7} />
        <div className="relative">
          <p className="text-sm font-medium text-white/70">{user?.office?.name}</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
            Welcome back, {user?.first_name}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/80">
            Track meetings, manage members and record attendance.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/meetings">View meetings</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-white/15 text-white backdrop-blur hover:bg-white/25"
            >
              <Link to="/members">View members</Link>
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px] sm:h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard
            icon={CalendarDays}
            label="Meetings"
            value={summary.total_meetings}
            caption="Recorded for this office"
          />
          <StatCard
            icon={Users}
            label="Members"
            value={summary.total_members}
            caption="On the register"
          />
          <StatCard
            icon={UserCheck}
            label="Attendances"
            value={summary.total_attendances}
            caption="Total across all meetings"
          />
          <StatCard
            icon={TrendingUp}
            label="Avg turnout"
            value={summary.average_participants}
            caption={`${summary.average_attendance}% of the ${summary.total_members} members`}
            progress={summary.average_attendance}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent meetings</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-14" />
              ))}
            </div>
          ) : summary?.recent_meetings?.length ? (
            <ul className="divide-y">
              {/* No wrapping: the title truncates so the count always stays on the right. */}
              {summary.recent_meetings.map((meeting) => (
                <li key={meeting.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      to={`/meetings/${meeting.id}/attendance`}
                      className="block truncate font-medium text-primary hover:underline"
                    >
                      {meeting.title || 'Untitled meeting'}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(meeting.date)}
                      {meeting.topic ? ` · ${meeting.topic}` : ''}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                    {meeting.participants}
                    <span className="hidden sm:inline">
                      &nbsp;participant{meeting.participants === 1 ? '' : 's'}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No meetings recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
