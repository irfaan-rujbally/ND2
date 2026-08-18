import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
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
import { humanizeValidationMessage } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'

const EMPTY = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  owner: false,
  office_id: '',
}

export default function UserForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()

  /*
   * Radix Select calls onValueChange with its previous value when the controlled
   * value changes from outside after mount, which wipes the selection. So the
   * value is correct from the very first render: seeded here on create, and the
   * form is withheld until `hydrated` on edit.
   */
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    office_id: currentUser?.office_id != null ? String(currentUser.office_id) : '',
  }))
  const [hydrated, setHydrated] = useState(!id)
  const [errors, setErrors] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(false)

  const officesQuery = useQuery({
    queryKey: ['offices'],
    queryFn: () => search('offices', { limit: 100 }),
  })

  const userQuery = useQuery({
    queryKey: ['user', id],
    enabled: isEdit,
    queryFn: () =>
      search('users', {
        filters: [{ field: 'id', operator: '=', value: Number(id) }],
        limit: 10,
      }).then((response) => response.data[0] ?? null),
  })

  useEffect(() => {
    if (isEdit && userQuery.data) {
      const record = userQuery.data
      setForm({
        first_name: record.first_name ?? '',
        last_name: record.last_name ?? '',
        email: record.email ?? '',
        password: '',
        owner: Boolean(record.owner),
        office_id: record.office_id != null ? String(record.office_id) : '',
      })
      setHydrated(true)
    }
  }, [isEdit, userQuery.data])

  const save = useMutation({
    mutationFn: () => {
      const attributes = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        owner: form.owner,
        office_id: form.office_id ? Number(form.office_id) : null,
      }

      // Only send a password when one was typed, so editing a user without
      // touching the password field leaves their existing one alone.
      if (form.password) attributes.password = form.password

      return mutate('users', [
        isEdit
          ? { operation: 'update', key: Number(id), attributes }
          : { operation: 'create', attributes },
      ])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success(isEdit ? 'User updated.' : 'User created.')
      navigate('/users')
    },
    onError: (error) => {
      setErrors(error.errors ?? {})
      if (!error.isValidation) toast.error(error.message)
    },
  })

  const remove = useMutation({
    mutationFn: () => destroy('users', [Number(id)]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deleted.')
      navigate('/users')
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

  if (userQuery.error) {
    return <ErrorState error={userQuery.error} onRetry={userQuery.refetch} />
  }

  const offices = officesQuery.data?.data ?? []
  const loading = !officesQuery.isSuccess || (isEdit && (userQuery.isPending || !hydrated))
  const isSelf = isEdit && currentUser?.id === Number(id)

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/users">
          <ArrowLeft className="size-4" />
          Back to users
        </Link>
      </Button>

      <PageHeader title={isEdit ? 'Edit user' : 'New user'} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account details</CardTitle>
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
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="first_name" label="First name" error={errorFor('first_name')} required>
                  <Input id="first_name" value={form.first_name} onChange={update('first_name')} />
                </Field>
                <Field id="last_name" label="Last name" error={errorFor('last_name')} required>
                  <Input id="last_name" value={form.last_name} onChange={update('last_name')} />
                </Field>
              </div>

              <Field id="email" label="Email" error={errorFor('email')} required>
                <Input id="email" type="email" value={form.email} onChange={update('email')} />
              </Field>

              <Field
                id="password"
                label="Password"
                error={errorFor('password')}
                hint={isEdit ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}
                required={!isEdit}
              >
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={update('password')}
                />
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

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.owner}
                  onChange={(event) => setForm((c) => ({ ...c, owner: event.target.checked }))}
                  className="size-4 rounded border-input accent-primary"
                />
                Account owner
              </label>

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                {isEdit && !isSelf ? (
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
                  <Button type="button" variant="outline" onClick={() => navigate('/users')}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? <Spinner /> : null}
                    {isEdit ? 'Save changes' : 'Create user'}
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
            <DialogTitle>Delete this user?</DialogTitle>
            <DialogDescription>
              The account is archived and can be restored by an administrator. They will no longer be able
              to sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? <Spinner /> : <Trash2 className="size-4" />}
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
