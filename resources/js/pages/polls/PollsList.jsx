import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Vote } from 'lucide-react'
import { toast } from 'sonner'

import { polls as pollsApi } from '@/lib/api'
import { PollListCard } from '@/pages/polls/PollListCard'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, ErrorState, PageHeader, Pagination, Spinner } from '@/components/common'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  // Includes the polls that ran past their deadline: "closed" here means no
  // longer taking votes, not "somebody pressed the button".
  { value: 'closed', label: 'Closed' },
]

/** Every poll this office has run, newest first. */
export default function PollsList() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [pendingDelete, setPendingDelete] = useState(null)

  const query = useQuery({
    queryKey: ['polls', status, page],
    queryFn: () => pollsApi.list({ status, page }),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['polls'] })

  const setOpenState = useMutation({
    mutationFn: ({ id, open }) => (open ? pollsApi.reopen(id) : pollsApi.close(id)),
    onSuccess: (_data, { open }) => {
      invalidate()
      toast.success(open ? 'Poll reopened.' : 'Poll closed.')
    },
    onError: (error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: () => pollsApi.remove(pendingDelete.id),
    onSuccess: () => {
      invalidate()
      toast.success('Poll deleted.')
      setPendingDelete(null)
    },
    onError: (error) => toast.error(error.message),
  })

  const rows = query.data?.data ?? []
  const meta = query.data?.meta ?? {}

  const newPollButton = (
    <Button asChild>
      <Link to="/polls/create">
        <Plus className="size-4" />
        New poll
      </Link>
    </Button>
  )

  return (
    <div>
      <PageHeader title="Polls" description="Ask the members a question, then close it and read the result.">
        {newPollButton}
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Button
            key={filter.value}
            size="sm"
            variant={status === filter.value ? 'default' : 'outline'}
            onClick={() => {
              setStatus(filter.value)
              setPage(1)
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.isPending ? (
        <div className="grid place-items-center py-16">
          <Spinner className="size-6" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Vote}
          title="No polls yet"
          description="Put a question to the members before the party takes a decision."
        >
          {newPollButton}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((poll) => (
            <PollListCard
              key={poll.id}
              poll={poll}
              busy={setOpenState.isPending}
              onToggleOpen={(open) => setOpenState.mutate({ id: poll.id, open })}
              onDelete={() => setPendingDelete(poll)}
            />
          ))}

          <Pagination
            page={meta.current_page ?? 1}
            lastPage={meta.last_page ?? 1}
            total={meta.total ?? 0}
            onPageChange={setPage}
          />
        </div>
      )}

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete poll?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            “{pendingDelete?.title}” and the votes cast on it will no longer appear anywhere.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
