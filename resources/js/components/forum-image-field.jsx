import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/common'
import { cn } from '@/lib/utils'

/**
 * Picks and uploads an image for a forum topic or comment.
 *
 * Takes the upload function rather than importing one, because the two sides of
 * the app authenticate differently: a member's portal token goes to
 * /api/member/forum/images and an administrator's staff token to
 * /api/forum/images. Same component, same rules, two callers.
 *
 * Uploads on selection rather than on submit, so the record it belongs to only
 * ever carries a stored path -- the same two-step flow the membership form and
 * announcements use, and the reason the JSON endpoints never see a file.
 */

/** Matches the `max:5120` on ForumImageController. */
const MAX_BYTES = 5 * 1024 * 1024

/** Matches its `mimes:` rule. No SVG: it is a script-bearing document. */
const ACCEPT = '.jpg,.jpeg,.png,.webp,.gif'

export function ForumImageField({
  upload,
  imagePath,
  existingUrl,
  onUploaded,
  onCleared,
  label = 'Image',
  hint = 'Optional. JPG, PNG, WebP or GIF, up to 5 MB.',
  compact = false,
}) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(null)

  // An object URL lives as long as the document unless released; drop the
  // previous one whenever it is replaced, and the last on unmount.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const pick = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_BYTES) {
      toast.error('That image is larger than 5 MB.')
      event.target.value = ''
      return
    }

    setUploading(true)
    try {
      const uploaded = await upload(file)

      setPreview((current) => {
        if (current) URL.revokeObjectURL(current)
        // Shown immediately: the stored file is only reachable once the topic or
        // comment that references it has been saved.
        return URL.createObjectURL(file)
      })

      onUploaded(uploaded)
    } catch (error) {
      toast.error(error.errors?.file?.[0] || error.message)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const clear = () => {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    onCleared()
  }

  const shown = preview ?? existingUrl ?? null
  const inputId = `forum-image-${label.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div className="space-y-1.5">
      {!compact ? (
        <>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        onChange={pick}
        className="sr-only"
      />

      {shown ? (
        <div className="overflow-hidden rounded-lg border">
          <img
            src={shown}
            alt=""
            className={cn('w-full bg-muted/40 object-contain', compact ? 'max-h-40' : 'max-h-64')}
          />
          <div className="flex items-center justify-end gap-1 border-t p-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Spinner /> : <Upload className="size-4" />}
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={clear}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size={compact ? 'sm' : 'default'}
          className={compact ? undefined : 'w-full justify-center'}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Spinner /> : <ImagePlus className="size-4" />}
          {uploading ? 'Uploading…' : compact ? 'Add image' : 'Choose an image'}
        </Button>
      )}

      {/* Only shows if a path is set but no preview resolved -- a saved image
          whose URL the parent did not pass down. */}
      {imagePath && !shown ? (
        <p className="text-xs text-muted-foreground">Image attached.</p>
      ) : null}
    </div>
  )
}
