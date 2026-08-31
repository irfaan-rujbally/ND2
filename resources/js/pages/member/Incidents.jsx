import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, MessageSquare, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { memberApi } from '@/lib/memberApi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorState, Spinner } from '@/components/common'
import { formatDate } from '@/lib/utils'
import { IncidentDiscussion } from '@/components/incident-discussion'

const labels = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' }

export default function MemberIncidents() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '' })
  const [discussion, setDiscussion] = useState(null)
  const incidents = useQuery({ queryKey: ['member-incidents'], queryFn: memberApi.incidents })
  const rows = incidents.data?.data ?? []
  const create = useMutation({
    mutationFn: () => memberApi.createIncident(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-incidents'] })
      toast.success('Incident submitted.')
      setForm({ title: '', description: '' })
      setOpen(false)
    },
    onError: (error) => toast.error(error.message),
  })

  return <div>
    {/* The title comes from MemberLayout, which names the tab; this row is the action alone. */}
    <div className="mb-5 flex items-center justify-between gap-3 sm:mb-6">
      <p className="text-sm text-muted-foreground">Submit an incident and follow its progress.</p>
      <Button onClick={() => setOpen(true)}><Plus className="size-4" />New incident</Button>
    </div>
    {incidents.error ? <ErrorState error={incidents.error} onRetry={incidents.refetch} /> : incidents.isPending ? <div className="grid place-items-center py-12"><Spinner className="size-6" /></div> : rows.length === 0 ? <EmptyState icon={AlertTriangle} title="No incidents" description="You have not submitted an incident yet." /> : <div className="space-y-3">{rows.map((incident) => <Card key={incident.id}><CardContent><div className="mb-2 flex items-center justify-between gap-3"><h2 className="font-semibold">{incident.title}</h2><Badge variant={['resolved', 'closed'].includes(incident.status) ? 'success' : 'secondary'}>{labels[incident.status]}</Badge></div><p className="whitespace-pre-wrap text-sm text-muted-foreground">{incident.description}</p>{incident.department && <p className="mt-2 text-sm font-medium">{incident.department.name}</p>}<div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Submitted {formatDate(incident.created_at)}</p><Button variant="outline" size="sm" onClick={() => setDiscussion(incident)}><MessageSquare className="size-4" />Discussion</Button></div></CardContent></Card>)}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Submit an incident</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate() }}><div className="space-y-2"><Label htmlFor="member-incident-title">Title</Label><Input id="member-incident-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={150} /></div><div className="space-y-2"><Label htmlFor="member-incident-description">Description</Label><Textarea id="member-incident-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={7} required /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending && <Spinner className="size-4" />}Submit</Button></DialogFooter></form></DialogContent></Dialog>
    <IncidentDiscussion incident={discussion} open={discussion !== null} onOpenChange={(value) => !value && setDiscussion(null)} queryKey={['member-incident-comments']} loadComments={memberApi.incidentComments} addComment={memberApi.createIncidentComment} />
  </div>
}
