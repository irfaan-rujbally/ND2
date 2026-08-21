import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, RefreshCw, Send, ShieldAlert, Trash2 } from 'lucide-react'
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
import { EmptyState, ErrorState, Field, SearchInput, Spinner } from '@/components/common'
import { ForumImageField } from '@/components/forum-image-field'
import { OrbitBorder } from '@/components/orbit-border'
import { cn } from '@/lib/utils'

/**
 * One thread: the topic, then its replies oldest first, then the box to add one.
 *
 * A moderated post -- topic or comment -- arrives from the server with its
 * content already stripped and `moderated: true`. It is rendered as a tombstone
 * rather than skipped, so the gap in the conversation is explained and the author
 * learns what happened. Nothing here can un-hide that content; only the office
 * sees it.
 */

/* Below this many replies a search box is more clutter than help. */
const SEARCH_FROM = 3

function timestamp(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value))
}

function RemovedNotice({ what, mine, at }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed p-4">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">
          {mine ? `Your ${what} was removed` : `${what[0].toUpperCase()}${what.slice(1)} removed`}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          An administrator removed this {what}
          {at ? ` on ${timestamp(at)}` : ''}.
          {mine ? ' Contact the office if you think this was a mistake.' : ''}
        </p>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- the comment */

function Comment({ comment, onEdit, onDelete }) {
  if (comment.moderated) {
    return <RemovedNotice what="comment" mine={comment.is_mine} at={comment.moderated_at} />
  }

  /*
   * Your own replies get the party's red-and-blue ring, so your side of a
   * conversation is findable by glance rather than by reading every byline.
   *
   * The `inline` variant, not the animated one the sign-in plate uses: see
   * OrbitBorder. The inner surface has to be opaque (bg-card) or the gradient
   * shows through the middle and it reads as a coloured panel instead of a lit
   * edge -- and it carries the padding, since the ring is the border now.
   */
  const body = (
    <div className={cn(!comment.is_mine && 'rounded-lg border', 'p-4')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className={cn('font-medium', comment.by_office ? 'text-primary' : 'text-foreground')}>
          {comment.author_name}
        </span>
        <span aria-hidden>·</span>
        <span>{timestamp(comment.created_at)}</span>
        {comment.edited ? <span className="italic">edited</span> : null}
        {comment.is_mine ? <Badge variant="secondary">You</Badge> : null}
      </div>

      <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed">{comment.body}</p>

      {comment.image_url ? (
        <img
          src={comment.image_url}
          alt=""
          loading="lazy"
          className="mt-3 max-h-72 rounded-md border bg-muted/40 object-contain"
        />
      ) : null}

      {/* Only ever your own: the server refuses anything else, and drawing the
          buttons anyway would be a promise it would not keep. */}
      {comment.is_mine ? (
        <div className="mt-2 flex gap-1 border-t pt-2">
          <Button size="sm" variant="ghost" onClick={() => onEdit(comment)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(comment)}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  )

  if (!comment.is_mine) return body

  return (
    <OrbitBorder variant="inline" innerClassName="bg-card">
      {body}
    </OrbitBorder>
  )
}

/* ------------------------------------------------------------ edit the topic */

function EditTopicDialog({ topic, open, onOpenChange }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: topic.title ?? '',
    description: topic.description ?? '',
    image_path: topic.image_url ? 'keep' : '',
  })
  const [errors, setErrors] = useState({})

  /*
   * `image_path` here is a three-state flag, not a path. The API distinguishes
   * "absent, leave the image alone" from "present but null, clear it", and the
   * page never learns the stored path -- only its URL. 'keep' means send nothing.
   */
  const save = useMutation({
    mutationFn: () =>
      memberApi.updateForumTopic(topic.id, {
        title: form.title,
        description: form.description || null,
        ...(form.image_path === 'keep' ? {} : { image_path: form.image_path || null }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member', 'forum'] })
      toast.success('Topic updated.')
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
          <DialogTitle>Edit your topic</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field id="edit-title" label="Title" error={errors.title?.[0]} required>
            <Input
              id="edit-title"
              value={form.title}
              onChange={(event) => setForm((c) => ({ ...c, title: event.target.value }))}
            />
          </Field>

          <Field id="edit-description" label="Description" error={errors.description?.[0]}>
            <Textarea
              id="edit-description"
              rows={5}
              value={form.description}
              onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
            />
          </Field>

          <ForumImageField
            upload={uploadMemberForumImage}
            imagePath={form.image_path === 'keep' ? 'kept' : form.image_path}
            existingUrl={form.image_path === 'keep' ? topic.image_url : null}
            onUploaded={(uploaded) => setForm((c) => ({ ...c, image_path: uploaded.path }))}
            onCleared={() => setForm((c) => ({ ...c, image_path: '' }))}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim()}>
            {save.isPending ? <Spinner /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ the page */

export default function ForumTopicView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [body, setBody] = useState('')
  const [imagePath, setImagePath] = useState('')
  const [editingTopic, setEditingTopic] = useState(false)
  const [editingComment, setEditingComment] = useState(null)
  const [commentSearch, setCommentSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [confirmDeleteTopic, setConfirmDeleteTopic] = useState(false)

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['member', 'forum', 'topic', id],
    queryFn: () => memberApi.forumTopic(id),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['member', 'forum'] })

  const post = useMutation({
    mutationFn: () =>
      memberApi.createForumComment(id, { body, image_path: imagePath || null }),
    onSuccess: () => {
      setBody('')
      setImagePath('')
      invalidate()
    },
    onError: (error) => toast.error(error.errors?.body?.[0] || error.message),
  })

  const saveComment = useMutation({
    mutationFn: ({ commentId, values }) => memberApi.updateForumComment(commentId, values),
    onSuccess: () => {
      setEditingComment(null)
      invalidate()
      toast.success('Comment updated.')
    },
    onError: (error) => toast.error(error.errors?.body?.[0] || error.message),
  })

  const removeComment = useMutation({
    mutationFn: (comment) => memberApi.deleteForumComment(comment.id),
    onSuccess: () => {
      setPendingDelete(null)
      invalidate()
      toast.success('Comment deleted.')
    },
    onError: (error) => toast.error(error.message),
  })

  const removeTopic = useMutation({
    mutationFn: () => memberApi.deleteForumTopic(id),
    onSuccess: () => {
      invalidate()
      toast.success('Topic deleted.')
      navigate('/my/forum')
    },
    onError: (error) => toast.error(error.message),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="size-6 text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/my/forum">
            <ArrowLeft className="size-4" />
            Back to the forum
          </Link>
        </Button>
        <ErrorState error={error} onRetry={refetch} />
      </div>
    )
  }

  const topic = data?.data
  const allComments = data?.comments ?? []
  const visibleReplies = allComments.filter((comment) => !comment.moderated).length

  /*
   * A search hides tombstones as well as non-matching replies: a moderated
   * comment has no body to match, and leaving them in a filtered list would look
   * like results.
   */
  const term = commentSearch.trim().toLowerCase()
  const comments = term
    ? allComments.filter(
        (comment) =>
          !comment.moderated &&
          ((comment.body ?? '').toLowerCase().includes(term) ||
            (comment.author_name ?? '').toLowerCase().includes(term)),
      )
    : allComments
  const matchingReplies = comments.filter((comment) => !comment.moderated).length

  if (!topic) {
    return (
      <EmptyState title="Topic not found" description="It may have been deleted.">
        <Button asChild size="sm">
          <Link to="/my/forum">Back to the forum</Link>
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/my/forum">
          <ArrowLeft className="size-4" />
          Back to the forum
        </Link>
      </Button>

      {/* ---------------------------------------------------------- the topic */}

      <Card>
        <CardContent className="p-5 sm:p-6">
          {topic.moderated ? (
            <RemovedNotice what="topic" mine={topic.is_mine} at={topic.moderated_at} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className={cn('font-medium', topic.by_office ? 'text-primary' : 'text-foreground')}>
                  {topic.author_name}
                </span>
                <span aria-hidden>·</span>
                <span>{timestamp(topic.created_at)}</span>
                {topic.is_mine ? <Badge variant="secondary">You</Badge> : null}
              </div>

              <h1 className="mt-2 text-lg font-semibold leading-snug">{topic.title}</h1>

              {topic.description ? (
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed">
                  {topic.description}
                </p>
              ) : null}

              {topic.image_url ? (
                <img
                  src={topic.image_url}
                  alt=""
                  className="mt-3 max-h-80 w-full rounded-md border bg-muted/40 object-contain"
                />
              ) : null}

              {topic.is_mine ? (
                <div className="mt-3 flex gap-1 border-t pt-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditingTopic(true)}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmDeleteTopic(true)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* -------------------------------------------------------- the replies */}

      <div className="space-y-3">
        {/*
          Sticky, so the refresh stays reachable however far down a long thread you
          have read. A thread is the one screen here that goes stale while you are
          looking at it -- somebody else is replying -- and there is no live
          connection, so this is how you pull the new ones in.

          The negative margins let the bar span the full content width against
          MemberLayout's px-4 sm:px-6 padding.
        */}
        <div className="sticky top-0 z-10 -mx-4 space-y-2 border-b bg-background/85 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            {/*
              Tombstones are not replies. Counting them here would disagree with
              the number on the topic's card in the list, which comes from the
              server and excludes anything moderated.
            */}
            <p className="text-sm font-medium text-muted-foreground">
              {commentSearch
                ? `${matchingReplies} of ${visibleReplies} match`
                : visibleReplies === 0
                  ? 'No replies yet'
                  : `${visibleReplies} ${visibleReplies === 1 ? 'reply' : 'replies'}`}
            </p>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => refetch()}
              /* isFetching, not isLoading: isLoading is only true on the very
                 first load, when this bar is not on screen at all. */
              disabled={isFetching}
              aria-label="Check for new replies"
            >
              <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          {/*
            Searched in the browser, not on the server: a thread arrives whole in
            one response, so filtering here costs nothing and every keystroke is
            instant. Only appears once there are enough replies to be worth
            hunting through.
          */}
          {visibleReplies >= SEARCH_FROM ? (
            <SearchInput
              value={commentSearch}
              onChange={setCommentSearch}
              placeholder="Search replies"
              delay={150}
            />
          ) : null}
        </div>

        {comments.map((comment) =>
          editingComment?.id === comment.id ? (
            <div key={comment.id} className="space-y-2 rounded-lg border p-4">
              <Textarea
                rows={4}
                value={editingComment.body}
                onChange={(event) =>
                  setEditingComment((c) => ({ ...c, body: event.target.value }))
                }
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingComment(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={saveComment.isPending || !editingComment.body.trim()}
                  onClick={() =>
                    saveComment.mutate({
                      commentId: comment.id,
                      values: { body: editingComment.body },
                    })
                  }
                >
                  {saveComment.isPending ? <Spinner /> : null}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <Comment
              key={comment.id}
              comment={comment}
              onEdit={(c) => setEditingComment({ id: c.id, body: c.body })}
              onDelete={setPendingDelete}
            />
          ),
        )}

        {/* A filtered list that comes back empty needs saying so; otherwise the
            thread just looks as though it lost its replies. */}
        {term && comments.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No replies match “{commentSearch.trim()}”.
          </p>
        ) : null}
      </div>

      {/* ------------------------------------------------------- the composer */}

      {topic.moderated ? (
        <p className="rounded-lg bg-muted/50 p-3 text-center text-xs text-muted-foreground">
          This topic is closed to new replies.
        </p>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-4">
            <Textarea
              rows={3}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write a reply…"
              aria-label="Write a reply"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <ForumImageField
                compact
                upload={uploadMemberForumImage}
                imagePath={imagePath}
                onUploaded={(uploaded) => setImagePath(uploaded.path)}
                onCleared={() => setImagePath('')}
              />

              <Button
                className="ml-auto"
                disabled={post.isPending || !body.trim()}
                onClick={() => post.mutate()}
              >
                {post.isPending ? <Spinner /> : <Send className="size-4" />}
                Reply
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editingTopic ? (
        <EditTopicDialog topic={topic} open onOpenChange={setEditingTopic} />
      ) : null}

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your comment?</DialogTitle>
            <DialogDescription>
              It will be removed from the thread. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeComment.mutate(pendingDelete)}
              disabled={removeComment.isPending}
            >
              {removeComment.isPending ? <Spinner /> : <Trash2 className="size-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteTopic} onOpenChange={setConfirmDeleteTopic}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your topic?</DialogTitle>
            <DialogDescription>
              The replies go with it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteTopic(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeTopic.mutate()}
              disabled={removeTopic.isPending}
            >
              {removeTopic.isPending ? <Spinner /> : <Trash2 className="size-4" />}
              Delete topic
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
