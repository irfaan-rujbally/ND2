import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { destroy, mutate, search } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState, Field, PageHeader, Spinner } from '@/components/common'
import { toDateInput, humanizeValidationMessage } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'

const EMPTY = { title: '', date: '', topic: '', attachment_path: '', office_id: '' }

export default function MeetingForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  /*
   * Radix Select calls onValueChange with its previous value when the controlled
   * value changes from outside after mount, which wipes the selection. So the
   * value is correct from the very first render: seeded here on create, and the
   * form is withheld until `hydrated` on edit.
   */
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    office_id: user?.office_id != null ? String(user.office_id) : '',
  }))
  const [hydrated, setHydrated] = useState(!id)
  const [errors, setErrors] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(false)

  const officesQuery = useQuery({
    queryKey: ['offices'],
    queryFn: () => search('offices', { limit: 100 }),
  })

  const meetingQuery = useQuery({
    queryKey: ['meeting', id],
    enabled: isEdit,
    queryFn: () =>
      search('meetings', {
        filters: [{ field: 'id', operator: '=', value: Number(id) }],
        aggregates: [{ relation: 'members', type: 'count' }],
        limit: 10,
      }).then((response) => response.data[0] ?? null),
  })

  useEffect(() => {
    if (isEdit && meetingQuery.data) {
      const meeting = meetingQuery.data
      setForm({
        title: meeting.title ?? '',
        date: toDateInput(meeting.date),
        topic: meeting.topic ?? '',
        attachment_path: meeting.attachment_path ?? '',
        office_id: meeting.office_id != null ? String(meeting.office_id) : '',
      })
      setHydrated(true)
    }
  }, [isEdit, meetingQuery.data])

  const save = useMutation({
    mutationFn: () => {
      const attributes = {
        title: form.title,
        date: form.date || null,
        topic: form.topic || null,
        attachment_path: form.attachment_path || null,
        office_id: form.office_id ? Number(form.office_id) : null,
      }

      return mutate('meetings', [
        isEdit
          ? { operation: 'update', key: Number(id), attributes }
          : { operation: 'create', attributes },
      ])
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success(isEdit ? 'Meeting updated.' : 'Meeting created.')

      // Straight into attendance for a brand new meeting: that is the reason
      // most meetings get created in the first place.
      const createdId = response?.created?.[0]
      navigate(isEdit || !createdId ? '/meetings' : `/meetings/${createdId}/attendance`)
    },
    onError: (error) => {
      setErrors(error.errors ?? {})
      if (!error.isValidation) toast.error(error.message)
    },
  })

  const remove = useMutation({
    mutationFn: () => destroy('meetings', [Number(id)]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Meeting deleted.')
      navigate('/meetings')
    },
    onError: (error) => toast.error(error.message),
  })

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const submit = (event) => {
    event.preventDefault()
    setErrors({})
    save.mutate()
  }

  const errorFor = (field) =>
    humanizeValidationMessage(
      errors[field]?.[0] ?? errors[`mutate.0.attributes.${field}`]?.[0],
    ) ?? undefined

  if (meetingQuery.error) {
    return <ErrorState error={meetingQuery.error} onRetry={meetingQuery.refetch} />
  }

  const offices = officesQuery.data?.data ?? []
  const loading = !officesQuery.isSuccess || (isEdit && (meetingQuery.isPending || !hydrated))
  const participants = meetingQuery.data?.members_count

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/meetings">
          <ArrowLeft className="size-4" />
          Back to meetings
        </Link>
      </Button>

      <PageHeader title={isEdit ? 'Edit meeting' : 'New meeting'}>
        {isEdit ? (
          <Button asChild variant="outline">
            <Link to={`/meetings/${id}/attendance`}>
              <Users className="size-4" />
              Attendance{participants != null ? ` (${participants})` : ''}
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meeting details</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-11" />
              ))}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <Field id="title" label="Title" error={errorFor('title')} required>
                <Input id="title" value={form.title} onChange={update('title')} autoFocus={!isEdit} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="date" label="Date" error={errorFor('date')}>
                  <Input id="date" type="date" value={form.date} onChange={update('date')} />
                </Field>
                <Field id="office_id" label="Office" error={errorFor('office_id')} required>
                  <Select
                    value={form.office_id}
                    onValueChange={(value) => setForm((current) => ({ ...current, office_id: value }))}
                  >
                    <SelectTrigger id="office_id">
                      <SelectValue placeholder="Select an office" />
                    </SelectTrigger>
                    <SelectContent>
                      {offices.map((office) => (
                        <SelectItem key={office.id} value={String(office.id)}>
                          {office.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field id="topic" label="Topic" error={errorFor('topic')}>
                <Input id="topic" value={form.topic} onChange={update('topic')} />
              </Field>

              <Field
                id="attachment_path"
                label="Attachment"
                error={errorFor('attachment_path')}
                hint="Path or reference to a supporting document."
              >
                <Input
                  id="attachment_path"
                  value={form.attachment_path}
                  onChange={update('attachment_path')}
                />
              </Field>

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                {isEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                ) : (
                  <span />
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={() => navigate('/meetings')}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? <Spinner /> : null}
                    {isEdit ? 'Save changes' : 'Create meeting'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this meeting?</DialogTitle>
            <DialogDescription>
              The meeting is archived rather than erased, so its attendance records are preserved and it
              can be restored later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? <Spinner /> : <Trash2 className="size-4" />}
              Delete meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
