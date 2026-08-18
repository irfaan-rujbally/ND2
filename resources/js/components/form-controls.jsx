import { useRef, useState } from 'react'
import { FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/common'
import { uploadMemberDocument } from '@/lib/api'
import { MAX_UPLOAD_BYTES } from '@/lib/membership'
import { cn } from '@/lib/utils'

/** A titled block of fields, mirroring the sections of the public form. */
export function FormSection({ title, description, children, className }) {
  return (
    <section className={cn('space-y-5', className)}>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** Single boolean, rendered as a tappable row. */
export function CheckboxField({ id, checked, onChange, label, description }) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
    >
      <input
        id={id}
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-snug">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </label>
  )
}

/** Multi-select stored as an array of the option strings. */
export function CheckboxGroup({ legend, options, value = [], onChange, columns = 2, error }) {
  const selected = Array.isArray(value) ? value : []

  const toggle = (option) =>
    onChange(selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option])

  return (
    <fieldset>
      {legend ? <legend className="mb-2 text-sm font-medium">{legend}</legend> : null}
      <div className={cn('grid gap-2', columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
        {options.map((option) => (
          <label
            key={option}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors',
              selected.includes(option) ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
            )}
          >
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => toggle(option)}
              className="size-4 shrink-0 rounded border-input accent-primary"
            />
            <span className="leading-snug">{option}</span>
          </label>
        ))}
      </div>
      {error ? <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p> : null}
    </fieldset>
  )
}

/** Single choice. Clicking the selected option again clears it. */
export function RadioGroup({ legend, name, options, value, onChange, columns = 2, error }) {
  return (
    <fieldset>
      {legend ? <legend className="mb-2 text-sm font-medium">{legend}</legend> : null}
      <div className={cn('grid gap-2', columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-4')}>
        {options.map((option) => (
          <label
            key={option}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors',
              value === option ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
            )}
          >
            <input
              type="radio"
              name={name}
              checked={value === option}
              onChange={() => onChange(option)}
              onClick={() => value === option && onChange(null)}
              className="size-4 shrink-0 border-input accent-primary"
            />
            <span className="leading-snug">{option}</span>
          </label>
        ))}
      </div>
      {error ? <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p> : null}
    </fieldset>
  )
}

/**
 * Uploads immediately on selection and hands the stored path back to the form,
 * so saving the member is still a plain JSON mutate.
 */
export function FileField({
  id,
  label,
  hint,
  accept,
  kind,
  value,
  fileName,
  existingUrl,
  onUploaded,
  onCleared,
  required,
  error,
}) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const pick = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('That file is larger than 5 MB.')
      event.target.value = ''
      return
    }

    setUploading(true)
    try {
      const uploaded = await uploadMemberDocument(kind, file)
      onUploaded(uploaded)
      toast.success('File uploaded.')
    } catch (uploadError) {
      toast.error(uploadError.errors?.file?.[0] || uploadError.message)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

      <input ref={inputRef} id={id} type="file" accept={accept} onChange={pick} className="sr-only" />

      {value ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm">{fileName || 'Uploaded file'}</span>
          {existingUrl ? (
            <a
              href={existingUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              View
            </a>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onCleared}
            aria-label="Remove file"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Spinner /> : <Upload className="size-4" />}
          {uploading ? 'Uploading…' : 'Choose file…'}
        </Button>
      )}

      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  )
}

export { Paperclip }
