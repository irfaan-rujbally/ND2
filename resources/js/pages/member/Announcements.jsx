import { useQuery } from '@tanstack/react-query'
import { Clock3, Megaphone } from 'lucide-react'

import { memberApi } from '@/lib/memberApi'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, ErrorState, Spinner } from '@/components/common'

/**
 * Announcements from the member's own office, newest first.
 *
 * Read-only by design: this is the notice board, not the send screen. Members see
 * the notice and nothing about who else received it.
 *
 * Deliberately plainer than the News tab. News renders Facebook posts, where a
 * featured card and a grid make sense because the posts are promotional. An
 * announcement is a letter from the office — a date, a heading and some text to
 * read in order — so it gets one column and full text, with nothing collapsed
 * behind a "read more" that a member could miss.
 */

function formatPublishedAt(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

function AnnouncementCard({ announcement }) {
  return (
    <Card className="overflow-hidden">
      {announcement.image_url ? (
        /*
         * object-contain, not cover: an announcement image is usually a poster
         * or a flyer, and cropping one to fill a banner cuts off the half with
         * the date on it.
         */
        <img
          src={announcement.image_url}
          alt=""
          loading="lazy"
          className="max-h-80 w-full bg-muted/40 object-contain"
        />
      ) : null}

      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 className="size-3.5" />
          <time dateTime={announcement.created_at}>{formatPublishedAt(announcement.created_at)}</time>
        </div>

        <h2 className="mt-2 text-lg font-semibold leading-snug">{announcement.title}</h2>

        {announcement.description ? (
          // whitespace-pre-line to match the emailed copy, where the line breaks
          // typed into the office's textarea are the only formatting carried over.
          <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-foreground">
            {announcement.description}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function Announcements() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['member', 'announcements'],
    queryFn: () => memberApi.announcements(),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="size-6 text-primary" />
      </div>
    )
  }

  if (error) return <ErrorState error={error} onRetry={refetch} />

  const announcements = data?.data ?? []
  const meta = data?.meta ?? {}

  if (announcements.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No announcements yet"
        description="Notices from your office will appear here."
      />
    )
  }

  return (
    <div className="space-y-4">
      {announcements.map((announcement) => (
        <AnnouncementCard key={announcement.id} announcement={announcement} />
      ))}

      {/* The feed is capped. Say so rather than letting it look complete. */}
      {meta.total > announcements.length ? (
        <p className="pt-1 text-center text-xs text-muted-foreground">
          Showing the {announcements.length} most recent of {meta.total} announcements.
        </p>
      ) : null}
    </div>
  )
}
