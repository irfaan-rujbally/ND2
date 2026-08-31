import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

import { polls as pollsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CheckboxField } from '@/components/form-controls'
import { ErrorState, Field, PageHeader, Spinner } from '@/components/common'
import { MIN_OPTIONS, PollOptionsField } from '@/pages/polls/PollOptionsField'

/**
 * `datetime-local` speaks local wall-clock time with no zone, so the value has
 * to be built from the local parts rather than sliced off an ISO string —
 * toISOString() would shift the deadline by the offset and show the office a
 * time it did not set.
 */
function toLocalInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (value) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const emptyForm = { title: '', description: '', allows_multiple: false, closes_at: '', options: ['', ''] }

export default function PollForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})

  const existing = useQuery({
    queryKey: ['poll', id],
    queryFn: () => pollsApi.get(id),
    enabled: Boolean(id),
  })

  const poll = existing.data?.data

  useEffect(() => {
    if (!poll) return

    setForm({
      title: poll.title,
      description: poll.description ?? '',
      allows_multiple: poll.allows_multiple,
      closes_at: toLocalInput(poll.closes_at),
      options: poll.options.map((option) => option.label),
    })
  }, [poll])

  // The ballot is frozen once anyone has answered — the API refuses the change,
  // so the fields say why rather than letting the office type into a dead form.
  const frozen = Boolean(poll && poll.results?.total_votes > 0)

  const save = useMutation({
    mutationFn: () => {
      const labels = form.options.map((option) => option.trim()).filter(Boolean)

      const payload = {
        title: form.title,
        description: form.description || null,
        closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
        ...(frozen ? {} : { options: labels }),
        ...(id ? {} : { allows_multiple: form.allows_multiple }),
      }

      return id ? pollsApi.update(id, payload) : pollsApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polls'] })
      toast.success(id ? 'Poll updated.' : 'Poll published.')
      navigate('/polls')
    },
    onError: (error) => {
      setErrors(error.errors ?? {})
      toast.error(error.message)
    },
  })

  const filled = form.options.filter((option) => option.trim()).length
  const canSave = form.title.trim() !== '' && (frozen || filled >= MIN_OPTIONS)

  if (id && existing.isPending) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (id && existing.error) return <ErrorState error={existing.error} onRetry={existing.refetch} />

  return (
    <div className="max-w-2xl">
      <PageHeader title={id ? 'Edit poll' : 'New poll'}>
        <Button variant="outline" asChild>
          <Link to="/polls">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
      </PageHeader>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          setErrors({})
          save.mutate()
        }}
      >
        <Card>
          <CardContent className="space-y-4">
            <Field id="poll-title" label="Question" required error={errors.title?.[0]}>
              <Input
                id="poll-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                maxLength={150}
                placeholder="Should we contest the by-election?"
                required
              />
            </Field>

            <Field
              id="poll-description"
              label="Details"
              hint="Optional. Context the members need before they answer."
              error={errors.description?.[0]}
            >
              <Textarea
                id="poll-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={4}
              />
            </Field>

            <Field
              id="poll-closes-at"
              label="Closing date"
              hint="Optional. It stops taking votes at this time; you can also close it by hand at any point."
              error={errors.closes_at?.[0]}
            >
              <Input
                id="poll-closes-at"
                type="datetime-local"
                value={form.closes_at}
                onChange={(event) => setForm({ ...form, closes_at: event.target.value })}
              />
            </Field>

            {/*
              Fixed at creation. Flipping a multiple-choice poll to single
              afterwards would leave members holding more answers than the poll
              allows, and there is no honest way to pick which to discard.
            */}
            {id ? null : (
              <CheckboxField
                id="poll-allows-multiple"
                checked={form.allows_multiple}
                onChange={(allows_multiple) => setForm({ ...form, allows_multiple })}
                label="Allow several answers"
                description="Members may tick more than one option. This cannot be changed later."
              />
            )}
          </CardContent>
        </Card>

        <PollOptionsField
          options={form.options}
          onChange={(options) => setForm((current) => ({ ...current, options }))}
          frozen={frozen}
          error={errors.options?.[0]}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={!canSave || save.isPending}>
            {save.isPending ? <Spinner className="size-4" /> : null}
            {id ? 'Save poll' : 'Publish poll'}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/polls">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
