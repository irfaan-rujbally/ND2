import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ErrorState, Spinner } from '@/components/common'

function timestamp(value) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''
}

export function IncidentDiscussion({ incident, open, onOpenChange, queryKey, loadComments, addComment }) {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const comments = useQuery({
    queryKey: [...queryKey, incident?.id],
    queryFn: () => loadComments(incident.id),
    enabled: open && Boolean(incident?.id),
  })
  const send = useMutation({
    mutationFn: () => addComment(incident.id, body.trim()),
    onSuccess: (result) => {
      queryClient.setQueryData([...queryKey, incident.id], result)
      setBody('')
    },
    onError: (error) => toast.error(error.message),
  })
  const rows = comments.data?.data ?? []

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Discussion: {incident?.title}</DialogTitle>
      </DialogHeader>
      <div className="min-h-32 flex-1 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-4">
        {comments.error ? <ErrorState error={comments.error} onRetry={comments.refetch} /> : comments.isPending ? <div className="grid place-items-center py-8"><Spinner className="size-5" /></div> : rows.length === 0 ? <div className="grid place-items-center py-8 text-center text-sm text-muted-foreground"><MessageSquare className="mb-2 size-6" /><p>No comments yet. Start the discussion.</p></div> : rows.map((comment) => <div key={comment.id} className="rounded-lg border bg-background p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{comment.author_name}</span>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{comment.author_type === 'staff' ? 'Staff' : 'Member'}</Badge>
            <span>· {timestamp(comment.created_at)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
        </div>)}
      </div>
      <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (body.trim()) send.mutate() }}>
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a comment…" rows={3} maxLength={5000} required />
        <div className="flex justify-end"><Button type="submit" disabled={send.isPending || !body.trim()}>{send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />}Send comment</Button></div>
      </form>
    </DialogContent>
  </Dialog>
}
