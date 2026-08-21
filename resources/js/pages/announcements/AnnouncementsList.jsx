import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { announcementImageUrl, destroy, search } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  Pagination,
  PageHeader,
  SearchInput,
  SortableHead,
  Spinner,
  TableSkeleton,
} from '@/components/common'
import { formatDate } from '@/lib/utils'

const PER_PAGE = 10

/**
 * How far a send has got.
 *
 * `pending_count` only ever sits above zero while a queue worker still has jobs
 * to run, so on a `sync` queue it goes straight from nothing to a number of
 * sends. Showing it anyway is what makes a real queue legible once one is
 * configured.
 */
function SendStatus({ announcement }) {
  const sent = announcement.sent_count ?? 0
  const pending = announcement.pending_count ?? 0

  if (pending > 0) {
    return <Badge variant="default">{sent} sent, {pending} queued</Badge>
  }

  if (sent > 0) {
    return <Badge variant="success">Sent to {sent}</Badge>
  }

  return <Badge variant="secondary">Not sent</Badge>
}

/** A small thumbnail, so the list is scannable when several share a title. */
function Thumbnail({ announcement }) {
  const url = announcementImageUrl(announcement)

  if (!url) {
    return (
      <div className="grid size-10 shrink-0 place-items-center rounded-md border bg-muted/40">
        <Megaphone className="size-4 text-muted-foreground" />
      </div>
    )
  }

  return (
    <img
      src={url}
      alt=""
      className="size-10 shrink-0 rounded-md border object-cover"
      loading="lazy"
    />
  )
}

function RowActions({ announcement, onDelete, size = 'icon' }) {
  return (
    <>
      <Button asChild variant="ghost" size={size} aria-label={`View ${announcement.title}`}>
        <Link to={`/announcements/${announcement.id}`}>
          <Eye className="size-4" />
          {size === 'sm' ? 'View' : null}
        </Link>
      </Button>
      <Button asChild variant="ghost" size={size} aria-label={`Edit ${announcement.title}`}>
        <Link to={`/announcements/${announcement.id}/edit`}>
          <Pencil className="size-4" />
          {size === 'sm' ? 'Edit' : null}
        </Link>
      </Button>
      <Button
        variant="ghost"
        size={size}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Delete ${announcement.title}`}
        onClick={() => onDelete(announcement)}
      >
        <Trash2 className="size-4" />
        {size === 'sm' ? 'Delete' : null}
      </Button>
    </>
  )
}

export default function AnnouncementsList() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()

  const [pendingDelete, setPendingDelete] = useState(null)

  const page = Number(params.get('page') || 1)
  const searchTerm = params.get('search') || ''
  const sort = params.get('sort') || 'created_at'
  const direction = params.get('direction') || 'desc'

  const setParam = (updates, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params)
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) next.delete(key)
      else next.set(key, String(value))
    })
    if (resetPage) next.delete('page')
    setParams(next, { replace: true })
  }

  const searchPayload = useMemo(() => {
    const filters = []

    if (searchTerm) {
      filters.push({
        nested: [
          { field: 'title', operator: 'like', value: `%${searchTerm}%` },
          { field: 'description', operator: 'like', value: `%${searchTerm}%`, type: 'or' },
        ],
      })
    }

    return {
      filters,
      sorts: [{ field: sort, direction }],
      includes: [{ relation: 'author' }],
      page,
      limit: PER_PAGE,
    }
  }, [searchTerm, sort, direction, page])

  const announcementsQuery = useQuery({
    queryKey: ['announcements', searchPayload],
    queryFn: () => search('announcements', searchPayload),
    placeholderData: (previous) => previous,
  })

  const remove = useMutation({
    mutationFn: (announcement) => destroy('announcements', [announcement.id]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      toast.success('Announcement deleted.')
      setPendingDelete(null)
    },
    onError: (error) => toast.error(error.message),
  })

  const rows = announcementsQuery.data?.data ?? []
  const onSort = (field, nextDirection) => setParam({ sort: field, direction: nextDirection })

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Notices you can email to the members of this office."
      >
        <Button asChild>
          <Link to="/announcements/create">
            <Plus className="size-4" />
            New Announcement
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={searchTerm}
          onChange={(value) => setParam({ search: value })}
          placeholder="Search by title or text"
        />
        {searchTerm ? (
          <Button variant="ghost" size="sm" onClick={() => setParam({ search: '' })}>
            Reset
          </Button>
        ) : null}
      </div>

      {announcementsQuery.error ? (
        <ErrorState error={announcementsQuery.error} onRetry={announcementsQuery.refetch} />
      ) : announcementsQuery.isPending ? (
        <TableSkeleton columns={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description={
            searchTerm
              ? 'Try a different search.'
              : 'Write an announcement, then email it to the members you choose.'
          }
        >
          <Button asChild size="sm">
            <Link to="/announcements/create">New Announcement</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* Desktop: full table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortableHead field="title" sort={sort} direction={direction} onSort={onSort}>
                      Title
                    </SortableHead>
                  </TableHead>
                  <TableHead>
                    <SortableHead field="created_at" sort={sort} direction={direction} onSort={onSort}>
                      Created
                    </SortableHead>
                  </TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((announcement) => (
                  <TableRow key={announcement.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Thumbnail announcement={announcement} />
                        <Link
                          to={`/announcements/${announcement.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {announcement.title}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(announcement.created_at) || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {announcement.author
                        ? [announcement.author.first_name, announcement.author.last_name]
                            .filter(Boolean)
                            .join(' ')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <SendStatus announcement={announcement} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <RowActions announcement={announcement} onDelete={setPendingDelete} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: a card each, so nothing scrolls sideways */}
          <div className="space-y-3 md:hidden">
            {rows.map((announcement) => (
              <Card key={announcement.id}>
                <CardContent className="p-4 sm:p-4">
                  <div className="flex items-start gap-3">
                    <Thumbnail announcement={announcement} />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/announcements/${announcement.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {announcement.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(announcement.created_at) || '-'}
                      </p>
                    </div>
                    <SendStatus announcement={announcement} />
                  </div>
                  <div className="mt-3 flex gap-1 border-t pt-2">
                    <RowActions announcement={announcement} onDelete={setPendingDelete} size="sm" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Pagination
            page={announcementsQuery.data.current_page}
            lastPage={announcementsQuery.data.last_page}
            total={announcementsQuery.data.total}
            onPageChange={(next) => setParam({ page: next }, { resetPage: false })}
          />
        </>
      )}

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{pendingDelete?.title}”?</DialogTitle>
            <DialogDescription>
              The announcement is archived rather than erased, and emails already sent are unaffected —
              their image keeps loading.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate(pendingDelete)}
              disabled={remove.isPending}
            >
              {remove.isPending ? <Spinner /> : <Trash2 className="size-4" />}
              Delete announcement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
