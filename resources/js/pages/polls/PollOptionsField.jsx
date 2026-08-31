import { GripVertical, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

/** Mirrors Poll::MAX_OPTIONS and Poll::MIN_OPTIONS; the server enforces both. */
export const MAX_OPTIONS = 10
export const MIN_OPTIONS = 2

/**
 * The ballot editor: the answers a member will choose between.
 *
 * `frozen` is set once anybody has voted. The API refuses the change then —
 * rewriting the options replaces the rows and takes the votes cast against them
 * with it — so the fields say why rather than letting an office type into a form
 * that will be rejected.
 */
export function PollOptionsField({ options, onChange, frozen, error }) {
  const setOption = (index, value) =>
    onChange(options.map((option, position) => (position === index ? value : option)))

  const filled = options.filter((option) => option.trim()).length

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Answers</h2>
          <span className="text-xs text-muted-foreground">
            {filled} of {MAX_OPTIONS}
          </span>
        </div>

        {frozen ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Members have started answering, so the options can no longer be changed. The wording of
            the question and the closing date can still be edited.
          </p>
        ) : null}

        {options.map((option, index) => (
          // Keyed by position, not by value: these are free-text fields the user
          // is mid-way through typing, and keying on the text would rebuild the
          // input on every keystroke and drop the caret.
          <div key={index} className="flex items-center gap-2">
            <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              value={option}
              onChange={(event) => setOption(index, event.target.value)}
              placeholder={`Answer ${index + 1}`}
              maxLength={255}
              disabled={frozen}
              aria-label={`Answer ${index + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive"
              aria-label={`Remove answer ${index + 1}`}
              disabled={frozen || options.length <= MIN_OPTIONS}
              onClick={() => onChange(options.filter((_option, position) => position !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}

        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={frozen || options.length >= MAX_OPTIONS}
          onClick={() => onChange([...options, ''])}
        >
          <Plus className="size-4" />
          Add answer
        </Button>
      </CardContent>
    </Card>
  )
}
