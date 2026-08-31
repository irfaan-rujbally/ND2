import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock3, Vote } from 'lucide-react'
import { toast } from 'sonner'

import { memberApi } from '@/lib/memberApi'
import { PollResults, PollStatusBadge } from '@/components/poll-results'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, ErrorState, Spinner } from '@/components/common'
import { cn } from '@/lib/utils'

/**
 * The polls a member may answer.
 *
 * Built as a ballot rather than a form: one card per question, the answers as
 * large tappable rows, and the result appearing in place of the options the
 * moment the vote lands. Members answer these on a phone, often standing up.
 *
 * The running total is deliberately absent until they have voted — the server
 * does not send it — so nobody's answer is nudged by the count so far. Changing
 * a submitted answer is allowed while the poll is open; "Change my answer" puts
 * the options back.
 */

function formatWhen(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function PollCard({ poll }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState(poll.my_option_ids ?? [])
  const [editing, setEditing] = useState(false)

  const cast = useMutation({
    mutationFn: () => memberApi.votePoll(poll.id, selected),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member', 'polls'] })
      setEditing(false)
      toast.success('Your vote has been recorded.')
    },
    onError: (error) => toast.error(error.message),
  })

  const toggle = (optionId) => {
    if (!poll.allows_multiple) {
      setSelected([optionId])
      return
    }

    setSelected((current) =>
      current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
    )
  }

  const showBallot = poll.is_open && (!poll.has_voted || editing)

  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            <time dateTime={poll.created_at}>{formatWhen(poll.created_at)}</time>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold leading-snug">{poll.title}</h2>
            <PollStatusBadge status={poll.status} />
          </div>

          {poll.description ? (
            <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed">{poll.description}</p>
          ) : null}

          <p className="mt-2 text-xs text-muted-foreground">
            {poll.allows_multiple ? 'Choose as many as you like.' : 'Choose one answer.'}
            {poll.is_open && poll.closes_at ? ` Closes ${formatWhen(poll.closes_at)}.` : ''}
          </p>
        </div>

        {showBallot ? (
          <>
            <ul className="space-y-2">
              {poll.options.map((option) => {
                const picked = selected.includes(option.id)

                return (
                  <li key={option.id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors',
                        picked ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
                      )}
                    >
                      <input
                        type={poll.allows_multiple ? 'checkbox' : 'radio'}
                        name={`poll-${poll.id}`}
                        checked={picked}
                        onChange={() => toggle(option.id)}
                        className="size-4 shrink-0 border-input accent-primary"
                      />
                      <span className="min-w-0 break-words leading-snug">{option.label}</span>
                    </label>
                  </li>
                )
              })}
            </ul>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={selected.length === 0 || cast.isPending}
                onClick={() => cast.mutate()}
              >
                {cast.isPending ? <Spinner className="size-4" /> : <Vote className="size-4" />}
                {poll.has_voted ? 'Save my answer' : 'Cast your vote'}
              </Button>
              {editing ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelected(poll.my_option_ids ?? [])
                    setEditing(false)
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <PollResults results={poll.results} chosen={poll.my_option_ids ?? []} />

            {!poll.has_voted ? (
              <p className="text-xs text-muted-foreground">This poll closed before you answered it.</p>
            ) : poll.is_open ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Change my answer
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function Polls() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['member', 'polls'],
    queryFn: () => memberApi.polls(),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="size-6 text-primary" />
      </div>
    )
  }

  if (error) return <ErrorState error={error} onRetry={refetch} />

  const polls = data?.data ?? []

  if (polls.length === 0) {
    return (
      <EmptyState
        icon={Vote}
        title="No polls yet"
        description="When your office asks the members a question, it will appear here."
      />
    )
  }

  return (
    <div className="space-y-4">
      {polls.map((poll) => (
        // Keyed on the answer as well as the id: a member who changes their vote
        // gets a fresh card, so the local selection cannot survive as a stale
        // draft over the server's version of what they chose.
        <PollCard key={`${poll.id}-${(poll.my_option_ids ?? []).join('-')}`} poll={poll} />
      ))}
    </div>
  )
}
