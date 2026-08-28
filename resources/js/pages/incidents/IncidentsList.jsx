import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, destroy, incidentComments, mutate, search } from '@/lib/api'
import { IncidentDiscussion } from '@/components/incident-discussion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'

const statuses = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const emptyForm = { title: '', description: '', department_id: '', status: 'open' }

export default function IncidentsList() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateOrder, setDateOrder] = useState('desc')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [discussion, setDiscussion] = useState(null)
  const payload = useMemo(() => {
    const filters = []
    if (departmentFilter !== 'all' && departmentFilter !== 'unassigned') {
      filters.push({ field: 'department_id', operator: '=', value: Number(departmentFilter) })
    }
    if (statusFilter !== 'all') filters.push({ field: 'status', operator: '=', value: statusFilter })

    return {
      includes: [{ relation: 'member' }, { relation: 'author' }, { relation: 'department' }],
      filters,
      ...(departmentFilter === 'unassigned' ? { scopes: [{ name: 'unassignedDepartment', parameters: [] }] } : {}),
      sorts: [{ field: 'created_at', direction: dateOrder }],
      limit: 100,
    }
  }, [departmentFilter, statusFilter, dateOrder])

  const incidents = useQuery({ queryKey: ['incidents', departmentFilter, statusFilter, dateOrder], queryFn: () => search('incidents', payload) })
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments') })
  const rows = incidents.data?.data ?? []
  const departmentOptions = useMemo(() => (departments.data?.data ?? []).map((department) => ({ value: String(department.id), label: department.name })), [departments.data])
  const departmentFilterOptions = useMemo(() => [
    { value: 'all', label: 'All departments' },
    { value: 'unassigned', label: 'Not assigned yet' },
    ...departmentOptions,
  ], [departmentOptions])

  const save = useMutation({
    mutationFn: () => mutate('incidents', [{
      operation: editing?.id ? 'update' : 'create',
      ...(editing?.id ? { key: editing.id } : {}),
      attributes: { ...form, office_id: user.office_id, member_id: editing?.member_id || null },
    }]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      toast.success(editing?.id ? 'Incident updated.' : 'Incident created.')
      setEditing(null)
    },
    onError: (error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: () => destroy('incidents', [pendingDelete.id]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      toast.success('Incident deleted.')
      setPendingDelete(null)
    },
    onError: (error) => toast.error(error.message),
  })

  const openForm = (incident = null) => {
    setEditing(incident || {})
    setForm(incident ? { title: incident.title, description: incident.description, department_id: incident.department_id || '', status: incident.status } : emptyForm)
  }

  return (
    <div>
      <PageHeader title="Incidents" description="Record incidents and track their follow-up status.">
        <Button onClick={() => openForm()}><Plus className="size-4" />New incident</Button>
      </PageHeader>

      <div className="mb-4 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="department-filter">Filter by department</Label>
          <SearchableSelect
            id="department-filter"
            value={departmentFilter}
            onValueChange={setDepartmentFilter}
            options={departmentFilterOptions}
            searchPlaceholder="Search departments…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status-filter">Filter by status</Label>
          <select id="status-filter" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="date-order">Order by date created</Label>
          <select id="date-order" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={dateOrder} onChange={(event) => setDateOrder(event.target.value)}>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
      </div>

      {incidents.error ? <ErrorState error={incidents.error} onRetry={incidents.refetch} /> : incidents.isPending ? (
        <div className="grid place-items-center py-16"><Spinner className="size-6" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No matching incidents" description={departmentFilter === 'all' && statusFilter === 'all' ? 'Create an incident to begin tracking its follow-up.' : 'No incidents match the selected filters.'} />
      ) : (
        <div className="space-y-3">
          {rows.map((incident) => (
            <Card key={incident.id}>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{incident.title}</h2>
                    <Badge variant={incident.status === 'resolved' || incident.status === 'closed' ? 'success' : 'secondary'}>
                      {statuses[incident.status] || incident.status}
                    </Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{incident.description}</p>
                  {incident.department && <p className="mt-2 text-sm font-medium">{incident.department.name}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {incident.member ? `Submitted by ${incident.member.first_name} ${incident.member.last_name}` : 'Created by staff'}
                    {' · '}{formatDate(incident.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setDiscussion(incident)} aria-label="Open discussion"><MessageSquare className="size-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => openForm(incident)} aria-label="Edit incident"><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setPendingDelete(incident)} aria-label="Delete incident"><Trash2 className="size-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit incident' : 'New incident'}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
            <div className="space-y-2"><Label htmlFor="incident-title">Title</Label><Input id="incident-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={150} required /></div>
            <div className="space-y-2"><Label htmlFor="incident-description">Description</Label><Textarea id="incident-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={6} required /></div>
            <div className="space-y-2">
              <Label htmlFor="incident-department">Department</Label>
              <SearchableSelect id="incident-department" value={form.department_id} onValueChange={(department_id) => setForm({ ...form, department_id })} options={departmentOptions} placeholder="Select a department" searchPlaceholder="Search departments…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="incident-status">Follow-up status</Label>
              <select id="incident-status" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={save.isPending || !form.department_id}>{save.isPending && <Spinner className="size-4" />}Save incident</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent><DialogHeader><DialogTitle>Delete incident?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">This will remove “{pendingDelete?.title}”.</p><DialogFooter><Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button><Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>Delete</Button></DialogFooter></DialogContent>
      </Dialog>
      <IncidentDiscussion incident={discussion} open={discussion !== null} onOpenChange={(open) => !open && setDiscussion(null)} queryKey={['incident-comments']} loadComments={incidentComments.list} addComment={incidentComments.create} />
    </div>
  )
}
