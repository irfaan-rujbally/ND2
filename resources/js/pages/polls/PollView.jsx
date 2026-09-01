import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Lock, LockOpen, Minus } from 'lucide-react'
import { toast } from 'sonner'

import { polls as pollsApi } from '@/lib/api'
import { PollResults, PollStatusBadge } from '@/components/poll-results'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, ErrorState, PageHeader, SearchInput, Spinner } from '@/components/common'
import { formatDate } from '@/lib/utils'

/**
 * The voting details for one poll: the tallies, and who has answered.
 *
 * Who, not what. The participation list exists so an office can chase the
 * members who have not replied, and there is no column on it for the option
 * somebody chose — the API returns no such field, on this or any other endpoint.
 * A member is told this when they vote, and it has to stay true.
 */
export default function PollView() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const query = useQuery({ queryKey: ['poll', id], queryFn: () => pollsApi.get(id) })
  const participation = useQuery({
    queryKey: ['poll-participation', id],
    queryFn: () => pollsApi.participation(id),
  })

  const poll = query.data?.data

  const setOpenState = useMutation({
    mutationFn: (open) => (open ? pollsApi.reopen(id) : pollsApi.close(id)),
    onSuccess: (_data, open) => {
      queryClient.invalidateQueries({ queryKey: ['poll', id] })
      queryClient.invalidateQueries({ queryKey: ['polls'] })
      toast.success(open ? 'Poll reopened.' : 'Poll closed.')
    },
    onError: (error) => toast.error(error.message),
  })

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()

    return (participation.data?.data ?? []).filter((row) => {
      if (filter === 'voted' && !row.has_voted) return false
      if (filter === 'waiting' && row.has_voted) return false

      return term === '' || row.name.toLowerCase().includes(term)
    })
  }, [participation.data, search, filter])

  if (query.isPending) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />

  const isOpen = poll.status === 'open'

  return (
    <div className="max-w-3xl">
      {/*
        The question is not the page title. PageHeader truncates to one line,
        which is right for "Members" and wrong for "Should we contest the Quatre
        Bornes by-election?" — the wording of the question is the content here,
        and half of it is no use to anybody. So the header names the screen and
        the question is rendered below, where it can wrap.
      */}
      <PageHeader title="Voting details">
        <Button variant="outline" asChild>
          <Link to="/polls">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
        <Button
          variant={isOpen ? 'default' : 'outline'}
          disabled={setOpenState.isPending}
          onClick={() => setOpenState.mutate(!isOpen)}
        >
          {isOpen ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          {isOpen ? 'Close poll' : 'Reopen poll'}
        </Button>
      </PageHeader>

      <h2 className="text-xl font-semibold leading-snug">{poll.title}</h2>
      {poll.description ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{poll.description}</p>
      ) : null}

      <div className="mb-4 mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <PollStatusBadge status={poll.status} />
        {poll.allows_multiple ? <span>several answers allowed</span> : <span>single answer</span>}
        <span>·</span>
        <span>{poll.is_restricted ? 'invited members only' : 'open to the whole office'}</span>
        <span>·</span>
        <span>{poll.author ? `asked by ${poll.author}, ` : ''}{formatDate(poll.created_at)}</span>
        {poll.closed_at ? <span>· closed {formatDate(poll.closed_at)}</span> : null}
        {poll.closes_at && !poll.closed_at ? <span>· deadline {formatDate(poll.closes_at)}</span> : null}
      </div>

      <Card className="mb-6">
        <CardContent>
          <PollResults results={poll.results} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="font-semibold">Who has answered</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The ballot is confidential: this shows who took part, never what they chose.
              {poll.is_restricted ? ' Only the members invited to this poll are listed.' : ''}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search members…" />
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'Everyone' },
                { value: 'voted', label: 'Answered' },
                { value: 'waiting', label: 'Not yet' },
              ].map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={filter === option.value ? 'default' : 'outline'}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {participation.error ? (
            <ErrorState error={participation.error} onRetry={participation.refetch} />
          ) : participation.isPending ? (
            <div className="grid place-items-center py-10">
              <Spinner className="size-5" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="Nobody matches" description="Try a different search or filter." />
          ) : (
            <ul className="divide-y rounded-lg border">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span
                    className={
                      row.has_voted
                        ? 'grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground'
                    }
                  >
                    {row.has_voted ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.has_voted ? formatDate(row.answered_at) : 'not yet'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
