import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Lock, Save } from 'lucide-react'
import { toast } from 'sonner'

import { memberApi } from '@/lib/memberApi'
import { QrImage } from '@/components/qr-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ErrorState, Field, Spinner } from '@/components/common'
import { downloadQrPng } from '@/lib/qr'
import { fullName } from '@/lib/utils'
import { constituencyLabel } from '@/lib/membership'
import ChangePassword from '@/pages/member/ChangePassword'

/**
 * The member's own record: the contact details they may change, and the badge
 * they may download.
 *
 * Only the fields the API accepts are on this form. Office, constituency and
 * membership status are the party's records about the member, not the member's
 * to edit, so they are shown read-only -- the server refuses them either way,
 * but offering an input that silently does nothing would be worse.
 */
export default function MyDetails() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['member', 'profile'],
    queryFn: () => memberApi.profile(),
  })

  const profile = data?.data

  // Seed the form once the record arrives, and again if it is refetched.
  useEffect(() => {
    if (!profile) return

    setForm({
      first_name: profile.first_name ?? '',
      last_name: profile.last_name ?? '',
      email: profile.email ?? '',
      phone: profile.phone ?? '',
      address: profile.address ?? '',
      date_of_birth: profile.date_of_birth ?? '',
    })
  }, [profile])

  const save = useMutation({
    mutationFn: (values) => memberApi.updateProfile(values),
    onSuccess: (response) => {
      setErrors({})
      queryClient.setQueryData(['member', 'profile'], { data: response.data })
      toast.success(response.message ?? 'Your details have been updated.')
    },
    onError: (mutationError) => {
      setErrors(mutationError.errors ?? {})
      if (!mutationError.isValidation) toast.error(mutationError.message)
    },
  })

  const submit = (event) => {
    event.preventDefault()

    // Blank optional fields are sent as null, not '', so clearing one actually
    // clears the column instead of storing an empty string.
    save.mutate({
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      date_of_birth: form.date_of_birth || null,
    })
  }

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  const download = async () => {
    setDownloading(true)
    try {
      await downloadQrPng(profile.qr_token, `${(fullName(profile) || 'member').replace(/\s+/g, '-').toLowerCase()}-badge.png`)
    } finally {
      setDownloading(false)
    }
  }

  if (isLoading || !form) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="size-6 text-primary" />
      </div>
    )
  }

  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-4">
      <Card>
        {/*
          sm:p-6 is not redundant with p-5: CardContent's base class is `p-5 pt-0 sm:p-6 sm:pt-0` -- it is built to sit
              under a CardHeader that supplies the top padding. These cards have no
              header, so the sm:pt-0 has to be overridden explicitly or the heading
              sits flush against the card's top border on any screen >= 640px.
        */}
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div>
            <h2 className="font-semibold">My QR code</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Show this at the door, or scan the meeting code yourself to check in.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <QrImage token={profile.qr_token} width={150} />
            </div>
            <div className="space-y-2">
              <Button onClick={download} disabled={downloading}>
                {downloading ? <Spinner /> : <Download className="size-4" />}
                Download my QR code
              </Button>
              <p className="max-w-xs text-xs text-muted-foreground">
                Keep it to yourself — anyone holding this code can be recorded present in your name.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <h2 className="font-semibold">My details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep these up to date so the office can reach you.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="first_name" label="First name" error={errors.first_name?.[0]} required>
                <Input id="first_name" value={form.first_name} onChange={update('first_name')} />
              </Field>

              <Field id="last_name" label="Last name" error={errors.last_name?.[0]} required>
                <Input id="last_name" value={form.last_name} onChange={update('last_name')} />
              </Field>

              <Field id="email" label="Email" error={errors.email?.[0]}>
                <Input id="email" type="email" value={form.email} onChange={update('email')} />
              </Field>

              <Field
                id="phone"
                label="Mobile number"
                error={errors.phone?.[0]}
                hint="8 digits, no spaces."
              >
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={8}
                  value={form.phone}
                  // Digits only, capped at 8, so the field cannot hold a value
                  // the API would reject -- including a pasted "+230 " prefix.
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      phone: event.target.value.replace(/\D/g, '').slice(0, 8),
                    }))
                  }
                  placeholder="52528555"
                />
              </Field>

              <Field id="date_of_birth" label="Date of birth" error={errors.date_of_birth?.[0]}>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={form.date_of_birth}
                  onChange={update('date_of_birth')}
                />
              </Field>

              <Field id="address" label="Address" error={errors.address?.[0]}>
                <Input id="address" value={form.address} onChange={update('address')} />
              </Field>
            </div>

            {/*
              Read-only on purpose: changing office would change which meetings
              the member may attend, so it stays an office decision.
            */}
            <div className="flex flex-wrap gap-6 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Lock className="size-3.5" />
                <span>
                  Constituency:{' '}
                  <strong>{constituencyLabel(profile.constituency) ?? 'Not recorded'}</strong>
                </span>
              </div>
              <div className="text-muted-foreground">
                To change your constituency or office, contact the party office.
              </div>
            </div>

            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : <Save className="size-4" />}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <section id="password" className="scroll-mt-4" aria-label="Change password">
        <ChangePassword />
      </section>
    </div>
  )
}
