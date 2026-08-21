import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, MessageSquare, MessagesSquare, Plus, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import { memberApi, uploadMemberForumImage } from '@/lib/memberApi'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState, ErrorState, Field, Pagination, SearchInput, Spinner } from '@/components/common'
import { ForumImageField } from '@/components/forum-image-field'
import { cn } from '@/lib/utils'

/**
 * The forum's front page: every topic in the member's office, most recently
 * discussed first, plus their own under a second tab.
 *
 * Ordering is on the server's `last_activity_at`, not on creation date -- a
 * conversation that is still going belongs above one that stopped a month ago.
 */

function relativeTime(value) {
  if (!value) return ''
  const then = new Date(value)
  const minutes = Math.round((Date.now() - then.getTime()) / 60000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / (60 * 24))} d ago`

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(then)
}

/**
 * A topic an administrator removed.
 *
 * Shown rather than hidden, and only ever reached by its own author or by
 * someone who saw it before: the point is that the member is told what happened
 * instead of watching their topic quietly disappear. The server has already
 * stripped the title and body, so there is nothing here to leak.
 */
function RemovedTopicCard({ topic }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-3 p-4 sm:p-4">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            {topic.is_mine ? 'Your topic was removed' : 'Topic removed'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            An administrator removed this topic{topic.moderated_at ? ` ${relativeTime(topic.moderated_at)}` : ''}.
            {topic.is_mine ? ' Contact the office if you think this was a mistake.' : ''}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function TopicCard({ topic }) {
  if (topic.moderated) return <RemovedTopicCard topic={topic} />

  return (
    <Card className="transition-colors hover:border-primary/40">
      <Link to={`/my/forum/${topic.id}`} className="block">
        <CardContent className="flex items-start gap-3 p-4 sm:p-4">
          {topic.image_url ? (
            <img
              src={topic.image_url}
              alt=""
              loading="lazy"
              className="size-14 shrink-0 rounded-md border object-cover"
            />
          ) : null}

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{topic.title}</p>

            {topic.description ? (
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{topic.description}</p>
            ) : null}

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className={cn(topic.by_office && 'font-medium text-primary')}>
                {topic.author_name}
              </span>
              <span aria-hidden>·</span>
              <span>{relativeTime(topic.last_activity_at)}</span>
              {topic.is_mine ? <Badge variant="secondary">Yours</Badge> : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="size-3.5" />
            {topic.comments_count}
            <ChevronRight className="size-4" />
          </div>
        </CardContent>
      </Link>
    </Card>
  )
}

/** Create dialog. Editing happens on the topic's own page. */
function NewTopicDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ title: '', description: '', image_path: '' })
  const [errors, setErrors] = useState({})

  const reset = () => {
    setForm({ title: '', description: '', image_path: '' })
    setErrors({})
  }

  const create = useMutation({
    mutationFn: () =>
      memberApi.createForumTopic({
        title: form.title,
        description: form.description || null,
        image_path: form.image_path || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member', 'forum', 'topics'] })
      toast.success('Topic posted.')
      reset()
      onOpenChange(false)
    },
    onError: (error) => {
      setErrors(error.errors ?? {})
      if (!error.isValidation) toast.error(error.message)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a topic</DialogTitle>
          <DialogDescription>
            Everyone in your office can read and reply to this.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field id="topic-title" label="Title" error={errors.title?.[0]} required>
            <Input
              id="topic-title"
              value={form.title}
              onChange={(event) => setForm((c) => ({ ...c, title: event.target.value }))}
              autoFocus
            />
          </Field>

          <Field id="topic-description" label="Description" error={errors.description?.[0]}>
            <Textarea
              id="topic-description"
              rows={5}
              value={form.description}
              onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
            />
          </Field>

          <ForumImageField
            upload={uploadMemberForumImage}
            imagePath={form.image_path}
            onUploaded={(uploaded) => setForm((c) => ({ ...c, image_path: uploaded.path }))}
            onCleared={() => setForm((c) => ({ ...c, image_path: '' }))}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.title.trim()}>
            {create.isPending ? <Spinner /> : null}
            Post topic
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ForumTopics() {
  const [params, setParams] = useSearchParams()
  const [composing, setComposing] = useState(false)

  const mine = params.get('mine') === '1'
  const searchTerm = params.get('search') || ''
  const page = Number(params.get('page') || 1)

  const setParam = (updates, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params)
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) next.delete(key)
      else next.set(key, String(value))
    })
    if (resetPage) next.delete('page')
    setParams(next, { replace: true })
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['member', 'forum', 'topics', { mine, searchTerm, page }],
    queryFn: () => memberApi.forumTopics({ mine, search: searchTerm, page }),
    placeholderData: (previous) => previous,
  })

  const topics = data?.data ?? []
  const meta = data?.meta ?? {}

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {/* Two views of one list; the server does the filtering. */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setParam({ mine: '' })}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              !mine ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            All topics
          </button>
          <button
            type="button"
            onClick={() => setParam({ mine: '1' })}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mine ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            My topics{meta.mine_total ? ` (${meta.mine_total})` : ''}
          </button>
        </div>

        <Button size="sm" onClick={() => setComposing(true)}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">New topic</span>
        </Button>
      </div>

      {/*
        Server side, because the list is paginated: filtering only the rows
        already on screen would miss every match further down. Searches titles and
        bodies, not authors.
      */}
      <SearchInput
        value={searchTerm}
        onChange={(value) => setParam({ search: value })}
        placeholder="Search topics"
      />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : topics.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={
            searchTerm
              ? 'No topics match your search'
              : mine
                ? 'You have not started a topic yet'
                : 'No topics yet'
          }
          description={
            searchTerm
              ? 'Try a different word, or clear the search.'
              : mine
                ? 'Anything you start will be listed here.'
                : 'Be the first to start a discussion in your office.'
          }
        >
          <Button size="sm" onClick={() => setComposing(true)}>
            Start a topic
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="space-y-3">
            {topics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>

          <Pagination
            page={meta.current_page}
            lastPage={meta.last_page}
            total={meta.total}
            onPageChange={(next) => setParam({ page: next }, { resetPage: false })}
          />
        </>
      )}

      <NewTopicDialog open={composing} onOpenChange={setComposing} />
    </div>
  )
}
