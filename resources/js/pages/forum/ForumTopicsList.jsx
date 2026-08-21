import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, MessageSquare, MessagesSquare, Plus, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { forum, uploadForumImage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  EmptyState,
  ErrorState,
  Field,
  Pagination,
  PageHeader,
  SearchInput,
  Spinner,
} from '@/components/common'
import { ForumImageField } from '@/components/forum-image-field'
import { formatDate } from '@/lib/utils'

/**
 * The office's view of the forum: every topic in this office, and the controls to
 * remove one from members' view.
 *
 * "Remove" is moderation, not deletion. The topic stays in this list with its
 * content still readable here, while members see a tombstone telling them an
 * administrator removed it. Nothing on this screen erases a member's words, and
 * the same button puts them back.
 */

const FILTERS = [
  { value: 'all', label: 'All topics' },
  { value: 'active', label: 'Visible only' },
  { value: 'moderated', label: 'Removed only' },
]

/** Post a topic as the office rather than under the administrator's own name. */
function NewTopicDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ title: '', description: '', image_path: '' })
  const [errors, setErrors] = useState({})

  const create = useMutation({
    mutationFn: () =>
      forum.createTopic({
        title: form.title,
        description: form.description || null,
        image_path: form.image_path || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum'] })
      toast.success('Topic posted as the office.')
      setForm({ title: '', description: '', image_path: '' })
      onOpenChange(false)
    },
    onError: (error) => {
      setErrors(error.errors ?? {})
      if (!error.isValidation) toast.error(error.message)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a topic as the office</DialogTitle>
          <DialogDescription>
            Members see this attributed to Nouveaux Démocrates, not to you by name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field id="staff-topic-title" label="Title" error={errors.title?.[0]} required>
            <Input
              id="staff-topic-title"
              value={form.title}
              onChange={(event) => setForm((c) => ({ ...c, title: event.target.value }))}
              autoFocus
            />
          </Field>

          <Field id="staff-topic-description" label="Description" error={errors.description?.[0]}>
            <Textarea
              id="staff-topic-description"
              rows={5}
              value={form.description}
              onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
            />
          </Field>

          <ForumImageField
            upload={uploadForumImage}
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
            Post as the office
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ForumTopicsList() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()

  const [composing, setComposing] = useState(false)
  const [pendingModeration, setPendingModeration] = useState(null)

  const searchTerm = params.get('search') || ''
  const filter = params.get('filter') || 'all'
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

  const topicsQuery = useQuery({
    queryKey: ['forum', 'topics', { searchTerm, filter, page }],
    queryFn: () => forum.topics({ search: searchTerm, filter, page }),
    placeholderData: (previous) => previous,
  })

  const moderate = useMutation({
    mutationFn: (topic) =>
      topic.moderated ? forum.unmoderateTopic(topic.id) : forum.moderateTopic(topic.id),
    onSuccess: (_data, topic) => {
      queryClient.invalidateQueries({ queryKey: ['forum'] })
      setPendingModeration(null)
      toast.success(topic.moderated ? 'Topic restored for members.' : 'Topic removed from members.')
    },
    onError: (error) => toast.error(error.message),
  })

  const topics = topicsQuery.data?.data ?? []
  const meta = topicsQuery.data?.meta ?? {}

  return (
    <div>
      <PageHeader
        title="Forum"
        description="Discussions among the members of this office. Removing a topic tells its author."
      >
        <Button onClick={() => setComposing(true)}>
          <Plus className="size-4" />
          New Topic
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={searchTerm}
          onChange={(value) => setParam({ search: value })}
          placeholder="Search by title or text"
        />

        <Select value={filter} onValueChange={(value) => setParam({ filter: value })}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter topics">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {meta.moderated_total ? (
          <p className="text-xs text-muted-foreground">
            {meta.moderated_total} removed
          </p>
        ) : null}
      </div>

      {topicsQuery.error ? (
        <ErrorState error={topicsQuery.error} onRetry={topicsQuery.refetch} />
      ) : topicsQuery.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : topics.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No topics"
          description={
            searchTerm || filter !== 'all'
              ? 'Try a different search or filter.'
              : 'Members have not started any discussions yet.'
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {topics.map((topic) => (
              <Card key={topic.id} className={topic.moderated ? 'border-dashed' : undefined}>
                <CardContent className="p-4 sm:p-4">
                  <div className="flex items-start gap-3">
                    {topic.image_url ? (
                      <img
                        src={topic.image_url}
                        alt=""
                        loading="lazy"
                        className="size-12 shrink-0 rounded-md border object-cover"
                      />
                    ) : null}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/forum/${topic.id}`}
                          className="truncate font-medium text-primary hover:underline"
                        >
                          {topic.title}
                        </Link>
                        {topic.moderated ? (
                          <Badge variant="destructive">Removed from members</Badge>
                        ) : null}
                        {topic.by_office ? <Badge variant="default">Office</Badge> : null}
                      </div>

                      {topic.description ? (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {topic.description}
                        </p>
                      ) : null}

                      <p className="mt-1 text-xs text-muted-foreground">
                        {topic.author_name} · {formatDate(topic.created_at)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="size-3.5" />
                      {topic.comments_count}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-1 border-t pt-2">
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/forum/${topic.id}`}>
                        <Eye className="size-4" />
                        Open
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={
                        topic.moderated
                          ? undefined
                          : 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                      }
                      onClick={() => setPendingModeration(topic)}
                    >
                      {topic.moderated ? (
                        <>
                          <ShieldCheck className="size-4" />
                          Restore
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="size-4" />
                          Remove
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
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

      <Dialog
        open={Boolean(pendingModeration)}
        onOpenChange={(open) => !open && setPendingModeration(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingModeration?.moderated ? 'Restore this topic?' : 'Remove this topic?'}
            </DialogTitle>
            <DialogDescription>
              {pendingModeration?.moderated
                ? 'Members will be able to read and reply to it again.'
                : 'Members will see that an administrator removed it, and the thread closes to new replies. The text stays readable here, and you can restore it later.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingModeration(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingModeration?.moderated ? 'default' : 'destructive'}
              onClick={() => moderate.mutate(pendingModeration)}
              disabled={moderate.isPending}
            >
              {moderate.isPending ? <Spinner /> : null}
              {pendingModeration?.moderated ? 'Restore topic' : 'Remove topic'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
