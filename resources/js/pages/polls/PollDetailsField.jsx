import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CheckboxField } from '@/components/form-controls'
import { Field } from '@/components/common'

/**
 * `datetime-local` speaks local wall-clock time with no zone, so the value has
 * to be built from the local parts rather than sliced off an ISO string —
 * toISOString() would shift the deadline by the offset and show the office a
 * time it did not set.
 */
export function toLocalInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (value) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The question itself: wording, context, deadline, and how many answers count. */
export function PollDetailsField({ form, onChange, errors, isEditing }) {
  const set = (patch) => onChange({ ...form, ...patch })

  return (
    <Card>
      <CardContent className="space-y-4">
        <Field id="poll-title" label="Question" required error={errors.title?.[0]}>
          <Input
            id="poll-title"
            value={form.title}
            onChange={(event) => set({ title: event.target.value })}
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
            onChange={(event) => set({ description: event.target.value })}
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
            onChange={(event) => set({ closes_at: event.target.value })}
          />
        </Field>

        {/*
          Fixed at creation. Flipping a multiple-choice poll to single afterwards
          would leave members holding more answers than the poll allows, and
          there is no honest way to pick which to discard.
        */}
        {isEditing ? null : (
          <CheckboxField
            id="poll-allows-multiple"
            checked={form.allows_multiple}
            onChange={(allows_multiple) => set({ allows_multiple })}
            label="Allow several answers"
            description="Members may tick more than one option. This cannot be changed later."
          />
        )}
      </CardContent>
    </Card>
  )
}
