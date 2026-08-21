import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Send, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { forum, uploadForumImage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState, ErrorState, PageHeader, SearchInput, Spinner } from '@/components/common'
import { ForumImageField } from '@/components/forum-image-field'
import { cn } from '@/lib/utils'

/**
 * A thread as the office sees it: everything, including the content of anything
 * already removed.
 *
 * That is the deliberate difference from the member portal. A removed post is
 * marked and struck through here but still readable, because a moderation
 * decision nobody can go back and check is not reviewable -- and the same button
 * that removed it puts it back.
 */

/* Below this many replies a search box is more clutter than help. */
const SEARCH_FROM = 3

function timestamp(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value))
}

function Comment({ comment, onModerate }) {
  return (
    <div className={cn('rounded-lg border p-4', comment.moderated && 'border-dashed bg-muted/30')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className={cn('font-medium', comment.by_office ? 'text-primary' : 'text-foreground')}>
          {comment.author_name}
        </span>
        <span aria-hidden>·</span>
        <span>{timestamp(comment.created_at)}</span>
        {comment.edited ? <span className="italic">edited</span> : null}
        {comment.by_office ? <Badge variant="default">Office</Badge> : null}
        {comment.moderated ? <Badge variant="destructive">Removed from members</Badge> : null}
      </div>

      {/* Struck through rather than hidden: still legible, obviously withdrawn. */}
      <p
        className={cn(
          'mt-2 whitespace-pre-line break-words text-sm leading-relaxed',
          comment.moderated && 'text-muted-foreground line-through decoration-1',
        )}
      >
        {comment.body}
      </p>

      {comment.image_url ? (
        <img
          src={comment.image_url}
          alt=""
          loading="lazy"
          className={cn(
            'mt-3 max-h-72 rounded-md border bg-muted/40 object-contain',
            comment.moderated && 'opacity-50',
          )}
        />
      ) : null}

      <div className="mt-2 flex gap-1 border-t pt-2">
        <Button
          size="sm"
          variant="ghost"
          className={
            comment.moderated
              ? undefined
              : 'text-destructive hover:bg-destructive/10 hover:text-destructive'
          }
          onClick={() => onModerate(comment)}
        >
          {comment.moderated ? (
            <>
              <ShieldCheck className="size-3.5" />
              Restore
            </>
          ) : (
            <>
              <ShieldAlert className="size-3.5" />
              Remove
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

export default function ForumTopicView() {
  const { id } = useParams()
  const queryClient = useQueryClient()

  const [body, setBody] = useState('')
  const [imagePath, setImagePath] = useState('')
  const [commentSearch, setCommentSearch] = useState('')
  const [pendingComment, setPendingComment] = useState(null)
  const [pendingTopic, setPendingTopic] = useState(false)

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['forum', 'topic', id],
    queryFn: () => forum.topic(id),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['forum'] })

  const reply = useMutation({
    mutationFn: () => forum.comment(id, { body, image_path: imagePath || null }),
    onSuccess: () => {
      setBody('')
      setImagePath('')
      invalidate()
      toast.success('Replied as the office.')
    },
    onError: (error) => toast.error(error.errors?.body?.[0] || error.message),
  })

  const moderateComment = useMutation({
    mutationFn: (comment) =>
      comment.moderated ? forum.unmoderateComment(comment.id) : forum.moderateComment(comment.id),
    onSuccess: (_data, comment) => {
      invalidate()
      setPendingComment(null)
      toast.success(comment.moderated ? 'Comment restored.' : 'Comment removed from members.')
    },
    onError: (error) => toast.error(error.message),
  })

  const moderateTopic = useMutation({
    mutationFn: (topic) =>
      topic.moderated ? forum.unmoderateTopic(topic.id) : forum.moderateTopic(topic.id),
    onSuccess: (_data, topic) => {
      invalidate()
      setPendingTopic(false)
      toast.success(topic.moderated ? 'Topic restored.' : 'Topic removed from members.')
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

  if (error) return <ErrorState error={error} onRetry={refetch} />

  const topic = data?.data
  const allComments = data?.comments ?? []

  /*
   * Matches the body or the author. Moderated comments stay searchable here --
   * the member portal excludes them, but the office reviewing its own decisions
   * needs to be able to find them.
   */
  const term = commentSearch.trim().toLowerCase()
  const comments = term
    ? allComments.filter(
        (comment) =>
          (comment.body ?? '').toLowerCase().includes(term) ||
          (comment.author_name ?? '').toLowerCase().includes(term),
      )
    : allComments

  if (!topic) {
    return (
      <EmptyState title="Topic not found" description="It may have been deleted by its author.">
        <Button asChild size="sm">
          <Link to="/forum">Back to the forum</Link>
        </Button>
      </EmptyState>
    )
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/forum">
          <ArrowLeft className="size-4" />
          Back to the forum
        </Link>
      </Button>

      <PageHeader title={topic.title}>
        <Button
          variant={topic.moderated ? 'outline' : 'destructive'}
          onClick={() => setPendingTopic(true)}
        >
          {topic.moderated ? (
            <>
              <ShieldCheck className="size-4" />
              Restore topic
            </>
          ) : (
            <>
              <ShieldAlert className="size-4" />
              Remove topic
            </>
          )}
        </Button>
      </PageHeader>

      <Card className={cn('mb-6', topic.moderated && 'border-dashed bg-muted/30')}>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className={cn('font-medium', topic.by_office ? 'text-primary' : 'text-foreground')}>
              {topic.author_name}
            </span>
            <span aria-hidden>·</span>
            <span>{timestamp(topic.created_at)}</span>
            {topic.by_office ? <Badge variant="default">Office</Badge> : null}
            {topic.moderated ? (
              <Badge variant="destructive">
                Removed from members {topic.moderated_at ? `on ${timestamp(topic.moderated_at)}` : ''}
              </Badge>
            ) : null}
          </div>

          {topic.description ? (
            <p
              className={cn(
                'mt-3 whitespace-pre-line break-words text-sm leading-relaxed',
                topic.moderated && 'text-muted-foreground line-through decoration-1',
              )}
            >
              {topic.description}
            </p>
          ) : null}

          {topic.image_url ? (
            <img
              src={topic.image_url}
              alt=""
              className={cn(
                'mt-3 max-h-80 w-full rounded-md border bg-muted/40 object-contain',
                topic.moderated && 'opacity-50',
              )}
            />
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/*
          Sticky for the same reason as in the portal: a thread goes stale while
          you are reading it, there is no live connection, and this is how you pull
          in what has been posted since. The negative margins span AppLayout's
          p-4 sm:p-6 content padding.
        */}
        <div className="sticky top-16 z-10 -mx-4 space-y-2 border-b bg-background/85 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {term
                ? `${comments.length} of ${allComments.length} match`
                : allComments.length === 0
                  ? 'No replies'
                  : `${allComments.length} ${allComments.length === 1 ? 'reply' : 'replies'}`}
            </p>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Check for new replies"
            >
              <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          {/*
            Filtered in the browser: the whole thread is already here. Unlike the
            portal this searches removed comments too -- finding what was taken
            down is half of what moderation review is for.
          */}
          {allComments.length >= SEARCH_FROM ? (
            <SearchInput
              value={commentSearch}
              onChange={setCommentSearch}
              placeholder="Search replies"
              delay={150}
            />
          ) : null}
        </div>

        {comments.map((comment) => (
          <Comment key={comment.id} comment={comment} onModerate={setPendingComment} />
        ))}

        {term && comments.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No replies match “{commentSearch.trim()}”.
          </p>
        ) : null}
      </div>

      <Card className="mt-4">
        <CardContent className="space-y-3 p-4 sm:p-4">
          <p className="text-xs text-muted-foreground">
            Replying posts as Nouveaux Démocrates, not under your own name.
          </p>

          <Textarea
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Reply as the office…"
            aria-label="Reply as the office"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <ForumImageField
              compact
              upload={uploadForumImage}
              imagePath={imagePath}
              onUploaded={(uploaded) => setImagePath(uploaded.path)}
              onCleared={() => setImagePath('')}
            />

            <Button
              className="ml-auto"
              disabled={reply.isPending || !body.trim()}
              onClick={() => reply.mutate()}
            >
              {reply.isPending ? <Spinner /> : <Send className="size-4" />}
              Reply as the office
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(pendingComment)} onOpenChange={(open) => !open && setPendingComment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingComment?.moderated ? 'Restore this comment?' : 'Remove this comment?'}
            </DialogTitle>
            <DialogDescription>
              {pendingComment?.moderated
                ? 'Members will be able to read it again.'
                : 'Its author will see that an administrator removed it. The text stays readable here, and you can restore it later.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingComment(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingComment?.moderated ? 'default' : 'destructive'}
              onClick={() => moderateComment.mutate(pendingComment)}
              disabled={moderateComment.isPending}
            >
              {moderateComment.isPending ? <Spinner /> : null}
              {pendingComment?.moderated ? 'Restore' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingTopic} onOpenChange={setPendingTopic}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {topic.moderated ? 'Restore this topic?' : 'Remove this topic?'}
            </DialogTitle>
            <DialogDescription>
              {topic.moderated
                ? 'Members will be able to read and reply to it again.'
                : 'Members will see that an administrator removed it, and the thread closes to new replies.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingTopic(false)}>
              Cancel
            </Button>
            <Button
              variant={topic.moderated ? 'default' : 'destructive'}
              onClick={() => moderateTopic.mutate(topic)}
              disabled={moderateTopic.isPending}
            >
              {moderateTopic.isPending ? <Spinner /> : null}
              {topic.moderated ? 'Restore topic' : 'Remove topic'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
