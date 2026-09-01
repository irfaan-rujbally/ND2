import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

import { polls as pollsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ErrorState, PageHeader, Spinner } from '@/components/common'
import { PollDetailsField, toLocalInput } from '@/pages/polls/PollDetailsField'
import { MIN_OPTIONS, PollOptionsField } from '@/pages/polls/PollOptionsField'
import { AUDIENCE_OFFICE, AUDIENCE_SELECTED, PollAudienceField } from '@/pages/polls/PollAudienceField'

const emptyForm = {
  title: '',
  description: '',
  allows_multiple: false,
  closes_at: '',
  options: ['', ''],
  audience: AUDIENCE_OFFICE,
  member_ids: [],
}

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

    setForm((current) => ({
      ...current,
      title: poll.title,
      description: poll.description ?? '',
      allows_multiple: poll.allows_multiple,
      closes_at: toLocalInput(poll.closes_at),
      options: poll.options.map((option) => option.label),
      audience: poll.audience,
    }))
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
        audience: form.audience,
        ...(restricted ? { member_ids: form.member_ids } : {}),
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
  const restricted = form.audience === AUDIENCE_SELECTED

  // A restricted poll with nobody on the list is one nobody can answer, so the
  // button stays down rather than letting the server say no.
  const canSave =
    form.title.trim() !== '' &&
    (frozen || filled >= MIN_OPTIONS) &&
    (!restricted || form.member_ids.length > 0)

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
        <PollDetailsField
          form={form}
          onChange={setForm}
          errors={errors}
          isEditing={Boolean(id)}
        />

        <PollOptionsField
          options={form.options}
          onChange={(options) => setForm((current) => ({ ...current, options }))}
          frozen={frozen}
          error={errors.options?.[0]}
        />

        <PollAudienceField
          audience={form.audience}
          onAudienceChange={(audience) => setForm((current) => ({ ...current, audience }))}
          selectedIds={form.member_ids}
          onSelectedChange={(member_ids) => setForm((current) => ({ ...current, member_ids }))}
          pollId={id}
          error={errors.member_ids?.[0]}
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
