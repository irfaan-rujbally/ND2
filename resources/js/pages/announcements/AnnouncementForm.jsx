import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus, Send, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  announcementImageUrl,
  destroy,
  mutate,
  search,
  uploadAnnouncementImage,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

const EMPTY = { title: '', description: '', image_path: '', office_id: '' }

/** Matches AnnouncementImageController's `max:5120`. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Matches its `mimes:` rule. Excludes SVG, which is a script-bearing document. */
const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif'

/**
 * The image picker.
 *
 * Uploads on selection rather than on submit, so the announcement carries only a
 * stored path by the time it is saved — the same two-step flow the membership
 * form uses for its attachments, and the reason the REST resource can stay
 * JSON-only.
 *
 * `preview` holds an object URL for a freshly chosen file so the picture appears
 * immediately. Falling back to the server URL would show nothing until the
 * announcement itself had been saved.
 */
function ImagePicker({ announcement, imagePath, onUploaded, onCleared, error }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(null)

  // Object URLs are a document-lifetime allocation; release the previous one
  // whenever it is replaced, and the last one on unmount.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const pick = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('That image is larger than 5 MB.')
      event.target.value = ''
      return
    }

    setUploading(true)
    try {
      const uploaded = await uploadAnnouncementImage(file)

      setPreview((current) => {
        if (current) URL.revokeObjectURL(current)
        return URL.createObjectURL(file)
      })

      onUploaded(uploaded)
      toast.success('Image uploaded.')
    } catch (uploadError) {
      toast.error(uploadError.errors?.file?.[0] || uploadError.message)
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

  const shown = preview ?? announcementImageUrl(announcement)

  return (
    <div className="space-y-1.5">
      <Label htmlFor="image">Image</Label>
      <p className="text-xs text-muted-foreground">
        Optional. Shown at the top of the email. JPG, PNG, WebP or GIF, up to 5 MB.
      </p>

      <input
        ref={inputRef}
        id="image"
        type="file"
        accept={IMAGE_ACCEPT}
        onChange={pick}
        className="sr-only"
      />

      {shown ? (
        <div className="overflow-hidden rounded-lg border">
          <img src={shown} alt="" className="max-h-64 w-full bg-muted/40 object-contain" />
          <div className="flex items-center justify-between gap-2 border-t p-2">
            <span className="truncate text-xs text-muted-foreground">
              This image will appear in the email.
            </span>
            <div className="flex shrink-0 gap-1">
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
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Spinner /> : <ImagePlus className="size-4" />}
          {uploading ? 'Uploading…' : 'Choose an image'}
        </Button>
      )}

      {/* Reported even though the field is a path rather than the file itself:
          a rejected upload leaves the path unset and the server says why. */}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {imagePath && !shown ? (
        <p className="text-xs text-muted-foreground">Stored at {imagePath}</p>
      ) : null}
    </div>
  )
}

export default function AnnouncementForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [form, setForm] = useState(() => ({
    ...EMPTY,
    office_id: user?.office_id != null ? String(user.office_id) : '',
  }))
  const [hydrated, setHydrated] = useState(!id)
  const [errors, setErrors] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(false)

  const announcementQuery = useQuery({
    queryKey: ['announcement', id],
    enabled: isEdit,
    queryFn: () =>
      search('announcements', {
        filters: [{ field: 'id', operator: '=', value: Number(id) }],
        limit: 10,
      }).then((response) => response.data[0] ?? null),
  })

  useEffect(() => {
    if (isEdit && announcementQuery.data) {
      const announcement = announcementQuery.data
      setForm({
        title: announcement.title ?? '',
        description: announcement.description ?? '',
        image_path: announcement.image_path ?? '',
        office_id: announcement.office_id != null ? String(announcement.office_id) : '',
      })
      setHydrated(true)
    }
  }, [isEdit, announcementQuery.data])

  const save = useMutation({
    mutationFn: () => {
      const attributes = {
        title: form.title,
        description: form.description || null,
        image_path: form.image_path || null,
        // Required on update as well as create, matching MemberResource, so it
        // is always round-tripped rather than sent only on create.
        office_id: form.office_id ? Number(form.office_id) : null,
      }

      return mutate('announcements', [
        isEdit
          ? { operation: 'update', key: Number(id), attributes }
          : { operation: 'create', attributes },
      ])
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      queryClient.invalidateQueries({ queryKey: ['announcement', id] })
      toast.success(isEdit ? 'Announcement updated.' : 'Announcement created.')

      // Straight to the announcement on create: choosing recipients and sending
      // it is the reason it was written.
      const createdId = response?.created?.[0]
      navigate(isEdit || !createdId ? `/announcements/${id ?? ''}` : `/announcements/${createdId}`)
    },
    onError: (error) => {
      setErrors(error.errors ?? {})
      if (!error.isValidation) toast.error(error.message)
    },
  })

  const remove = useMutation({
    mutationFn: () => destroy('announcements', [Number(id)]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      toast.success('Announcement deleted.')
      navigate('/announcements')
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

  if (announcementQuery.error) {
    return <ErrorState error={announcementQuery.error} onRetry={announcementQuery.refetch} />
  }

  const loading = isEdit && (announcementQuery.isPending || !hydrated)

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to={isEdit ? `/announcements/${id}` : '/announcements'}>
          <ArrowLeft className="size-4" />
          {isEdit ? 'Back to announcement' : 'Back to announcements'}
        </Link>
      </Button>

      <PageHeader title={isEdit ? 'Edit announcement' : 'New announcement'}>
        {isEdit ? (
          <Button asChild variant="outline">
            <Link to={`/announcements/${id}`}>
              <Send className="size-4" />
              Send by email
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Announcement</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-11" />
              ))}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <Field
                id="title"
                label="Title"
                error={errorFor('title')}
                hint="Used as the email's subject line."
                required
              >
                <Input id="title" value={form.title} onChange={update('title')} autoFocus={!isEdit} />
              </Field>

              <Field
                id="description"
                label="Description"
                error={errorFor('description')}
                hint="Plain text. Line breaks are kept in the email; nothing else is formatted."
              >
                <Textarea
                  id="description"
                  rows={8}
                  value={form.description}
                  onChange={update('description')}
                />
              </Field>

              <ImagePicker
                announcement={announcementQuery.data}
                imagePath={form.image_path}
                error={errorFor('image_path')}
                onUploaded={(uploaded) =>
                  setForm((current) => ({ ...current, image_path: uploaded.path }))
                }
                onCleared={() => setForm((current) => ({ ...current, image_path: '' }))}
              />

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                {isEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                ) : null}
                <Button asChild type="button" variant="outline">
                  <Link to={isEdit ? `/announcements/${id}` : '/announcements'}>Cancel</Link>
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? <Spinner /> : null}
                  {isEdit ? 'Save changes' : 'Create announcement'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this announcement?</DialogTitle>
            <DialogDescription>
              It is archived rather than erased. Emails already sent are unaffected — their image keeps
              loading.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? <Spinner /> : <Trash2 className="size-4" />}
              Delete announcement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
