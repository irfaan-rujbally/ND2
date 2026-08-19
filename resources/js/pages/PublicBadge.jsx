import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, QrCode, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { ThreeBackground } from '@/components/ThreeBackground'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { QrImage } from '@/components/qr-badge'
import { Field, Spinner } from '@/components/common'
import { qrToDataUrl } from '@/lib/qr'
import { fullName } from '@/lib/utils'

const EMPTY = { national_id: '', date_of_birth: '' }

export default function PublicBadge() {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [member, setMember] = useState(null)
  const [downloading, setDownloading] = useState(false)

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setErrors({})
    setMessage(null)
    setSubmitting(true)

    try {
      const response = await api.post('/public/member-badge', form)
      setMember(response.data)
    } catch (error) {
      setErrors(error.errors ?? {})
      if (!error.isValidation) setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const download = async () => {
    setDownloading(true)
    try {
      const url = await qrToDataUrl(member.qr_token)
      const link = document.createElement('a')
      link.href = url
      link.download = `${(fullName(member) || 'member').replace(/\s+/g, '-').toLowerCase()}-badge.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-nd-red via-primary to-nd-blue p-4">
      <ThreeBackground className="pointer-events-none absolute inset-0" density={1.1} />

      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <img
            src="/images/banner.jpeg"
            alt="Nouveaux Démocrates"
            className="mx-auto h-20 w-auto rounded-lg bg-white p-2 shadow-lg"
          />
          <p className="mt-4 text-sm font-medium text-white/80">Membership badge</p>
        </div>

        <Card className="border-white/20 bg-card/95 shadow-2xl backdrop-blur">
          <CardContent className="p-6 sm:p-8">
            {member ? (
              <div className="space-y-5 text-center">
                <div>
                  <p className="text-lg font-semibold">{fullName(member) || 'Your badge'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Show this code at the door to be recorded present.
                  </p>
                </div>

                <div className="flex justify-center">
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <QrImage token={member.qr_token} width={200} />
                  </div>
                </div>

                <Button className="w-full" onClick={download} disabled={downloading}>
                  {downloading ? <Spinner /> : <Download className="size-4" />}
                  Download badge
                </Button>

                <p className="text-xs text-muted-foreground">
                  Keep it to yourself — anyone holding this code can be recorded at a meeting in your
                  name.
                </p>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMember(null)
                    setForm(EMPTY)
                  }}
                >
                  Look up another badge
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4" noValidate>
                <div className="flex gap-3 rounded-lg bg-muted/50 p-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Confirm your identity to get your badge. Both details must match the ones on your
                    membership application.
                  </p>
                </div>

                {message ? (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {message}
                  </div>
                ) : null}

                <Field
                  id="national_id"
                  label="National ID number"
                  error={errors.national_id?.[0]}
                  required
                >
                  <Input
                    id="national_id"
                    autoFocus
                    required
                    value={form.national_id}
                    onChange={update('national_id')}
                    placeholder="As printed on your ID card"
                  />
                </Field>

                <Field
                  id="date_of_birth"
                  label="Date of birth"
                  error={errors.date_of_birth?.[0]}
                  required
                >
                  <Input
                    id="date_of_birth"
                    type="date"
                    required
                    value={form.date_of_birth}
                    onChange={update('date_of_birth')}
                  />
                </Field>

                <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? <Spinner /> : <QrCode className="size-4" />}
                  {submitting ? 'Checking…' : 'Get my QR code'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Button asChild variant="ghost" size="sm" className="mt-4 w-full text-white hover:bg-white/10 hover:text-white">
          <Link to="/login">
            <ArrowLeft className="size-4" />
            Back to login
          </Link>
        </Button>
      </div>
    </div>
  )
}
