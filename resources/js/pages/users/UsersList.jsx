import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, UserCog } from 'lucide-react'
import { search } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  EmptyState,
  ErrorState,
  Pagination,
  PageHeader,
  SearchInput,
  SortableHead,
  TableSkeleton,
} from '@/components/common'
import { fullName, initials } from '@/lib/utils'

const PER_PAGE = 10

export default function UsersList() {
  const [params, setParams] = useSearchParams()

  const page = Number(params.get('page') || 1)
  const searchTerm = params.get('search') || ''
  const sort = params.get('sort') || 'last_name'
  const direction = params.get('direction') || 'asc'

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

    // Mirrors User::scopeFilter, which also matched on email.
    if (searchTerm) {
      filters.push({
        nested: [
          { field: 'first_name', operator: 'like', value: `%${searchTerm}%` },
          { field: 'last_name', operator: 'like', value: `%${searchTerm}%`, type: 'or' },
          { field: 'email', operator: 'like', value: `%${searchTerm}%`, type: 'or' },
        ],
      })
    }

    return {
      filters,
      sorts: [{ field: sort, direction }],
      includes: [{ relation: 'office' }],
      page,
      limit: PER_PAGE,
    }
  }, [searchTerm, sort, direction, page])

  const usersQuery = useQuery({
    queryKey: ['users', searchPayload],
    queryFn: () => search('users', searchPayload),
    placeholderData: (previous) => previous,
  })

  const rows = usersQuery.data?.data ?? []
  const onSort = (field, nextDirection) => setParam({ sort: field, direction: nextDirection })

  return (
    <div>
      <PageHeader title="Users" description="Accounts that can sign in to this office.">
        <Button asChild>
          <Link to="/users/create">
            <Plus className="size-4" />
            New User
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={searchTerm}
          onChange={(value) => setParam({ search: value })}
          placeholder="Search by name or email"
        />
        {searchTerm ? (
          <Button variant="ghost" size="sm" onClick={() => setParam({ search: '' })}>
            Reset
          </Button>
        ) : null}
      </div>

      {usersQuery.error ? (
        <ErrorState error={usersQuery.error} onRetry={usersQuery.refetch} />
      ) : usersQuery.isPending ? (
        <TableSkeleton columns={4} />
      ) : rows.length === 0 ? (
        <EmptyState icon={UserCog} title="No users found" description="Try a different search." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortableHead field="first_name" sort={sort} direction={direction} onSort={onSort}>
                      Name
                    </SortableHead>
                  </TableHead>
                  <TableHead>
                    <SortableHead field="email" sort={sort} direction={direction} onSort={onSort}>
                      Email
                    </SortableHead>
                  </TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Link
                        to={`/users/${user.id}/edit`}
                        className="flex items-center gap-2 font-medium text-primary hover:underline"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          {initials(user.first_name, user.last_name)}
                        </span>
                        {fullName(user)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell className="text-muted-foreground">{user.office?.name || '-'}</TableCell>
                    <TableCell>
                      {user.owner ? <Badge>Owner</Badge> : <Badge variant="secondary">Member</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((user) => (
              <Card key={user.id}>
                <CardContent className="flex items-center gap-3 p-4 sm:p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    {initials(user.first_name, user.last_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/users/${user.id}/edit`}
                      className="block truncate font-semibold text-primary hover:underline"
                    >
                      {fullName(user)}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  {user.owner ? <Badge>Owner</Badge> : null}
                </CardContent>
              </Card>
            ))}
          </div>

          <Pagination
            page={usersQuery.data.current_page}
            lastPage={usersQuery.data.last_page}
            total={usersQuery.data.total}
            onPageChange={(next) => setParam({ page: next }, { resetPage: false })}
          />
        </>
      )}
    </div>
  )
}
