import { Link } from 'react-router-dom'
import { BarChart3, Lock, LockOpen, Pencil, Trash2, Users } from 'lucide-react'

import { PollResults, PollStatusBadge } from '@/components/poll-results'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'

/**
 * One poll on the office's list, with its running result.
 *
 * The tallies are here rather than only on the detail screen: the question an
 * administrator opens this page with is almost always "how is it going", and
 * making them click through to find out is a page of nothing.
 */
export function PollListCard({ poll, onToggleOpen, onDelete, busy }) {
  const isOpen = poll.status === 'open'

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{poll.title}</h2>
              <PollStatusBadge status={poll.status} />
              {poll.allows_multiple ? (
                <span className="text-xs text-muted-foreground">several answers allowed</span>
              ) : null}
              {/*
                Worth saying on the card: a turnout of "8 of 12" reads very
                differently once you know the poll went to twelve people rather
                than the whole office.
              */}
              {poll.is_restricted ? (
                <Badge variant="outline" className="gap-1">
                  <Users className="size-3" />
                  Invited members only
                </Badge>
              ) : null}
            </div>

            {poll.description ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{poll.description}</p>
            ) : null}

            <p className="mt-2 text-xs text-muted-foreground">
              {poll.author ? `Asked by ${poll.author} · ` : ''}
              {formatDate(poll.created_at)}
              {poll.closes_at && isOpen ? ` · closes ${formatDate(poll.closes_at)}` : ''}
            </p>
          </div>

          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" asChild aria-label="Voting details">
              <Link to={`/polls/${poll.id}`}>
                <BarChart3 className="size-4" />
              </Link>
            </Button>

            {/*
              Editing disappears once the poll is shut. The endpoint still allows
              it, but offering it here invites an office to reword a question
              after the answers are in.
            */}
            {isOpen ? (
              <Button variant="ghost" size="icon" asChild aria-label="Edit poll">
                <Link to={`/polls/${poll.id}/edit`}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              aria-label={isOpen ? 'Close poll' : 'Reopen poll'}
              disabled={busy}
              onClick={() => onToggleOpen(!isOpen)}
            >
              {isOpen ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              aria-label="Delete poll"
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <PollResults results={poll.results} />
      </CardContent>
    </Card>
  )
}
