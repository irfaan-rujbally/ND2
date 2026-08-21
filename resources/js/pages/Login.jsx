import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { LogIn, QrCode, UserCircle } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { ThreeBackground } from '@/components/ThreeBackground'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Spinner } from '@/components/common'
import { OrbitBorder } from '@/components/orbit-border'

export default function Login() {
  const { login, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '', remember: true })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to={location.state?.from ?? '/'} replace />
  }

  const update = (key) => (event) =>
    setForm((current) => ({
      ...current,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }))

  const submit = async (event) => {
    event.preventDefault()
    setErrors({})
    setMessage(null)
    setSubmitting(true)

    try {
      await login(form)
    } catch (error) {
      setErrors(error.errors ?? {})
      // 422 already surfaces per-field messages; anything else needs a banner.
      if (!error.isValidation) setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-nd-red via-primary to-nd-blue p-4">
      <ThreeBackground className="pointer-events-none absolute inset-0" density={1.1} />

      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          {/*
            Full width so the plate lines up with the card beneath it. logo-new.png
            is transparent, so the white sits on the wrapper's inner surface and
            its padding is the band of white around the mark.
          */}
          <OrbitBorder innerClassName="bg-white px-4 py-3">
            {/*
              The plate stays the card's full width; the mark is capped by height
              and centred inside it, which is what keeps the header short. Sizing
              by height rather than width means the logo cannot grow with the
              plate on a wider screen.
            */}
            <img
              src="/images/logo-new.png"
              alt="Nouveaux Démocrates"
              className="mx-auto h-14 w-auto sm:h-16"
            />
          </OrbitBorder>
          <p className="mt-4 text-sm font-medium text-white/80">Meeting Management System</p>
        </div>

        <Card className="border-white/20 bg-card/95 shadow-2xl backdrop-blur">
          {/* Uniform padding: CardContent's default is tuned for sitting under a
              CardHeader, which this card does not have. */}
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={submit} className="space-y-4" noValidate>
              {message ? (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {message}
                </div>
              ) : null}

              {/*
                Says who this form is for, mirroring the "Are you a member?"
                caption below the divider — a member landing here would otherwise
                try their own details against the staff sign-in and be told only
                that they were wrong.
              */}
              <p className="text-center text-xs text-muted-foreground">For Admins only</p>

              <Field id="email" label="Email" error={errors.email?.[0]} required>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={form.email}
                  onChange={update('email')}
                />
              </Field>

              <Field id="password" label="Password" error={errors.password?.[0]} required>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={update('password')}
                />
              </Field>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={update('remember')}
                  className="size-4 rounded border-input accent-primary"
                />
                Remember me
              </label>

              <Button type="submit" size="lg" className="w-full" disabled={submitting || isLoading}>
                {submitting ? <Spinner /> : <LogIn className="size-4" />}
                {submitting ? 'Signing in…' : 'Login'}
              </Button>
            </form>

            {/*
              This form is the staff sign-in. Members have their own, so the two
              ways in for them are kept together below the divider: collect a
              badge without signing in at all, or sign in to the portal — which is
              also where checking in to a meeting happens.
            */}
            <div className="mt-6 space-y-2 border-t pt-5">
              <p className="mb-2 text-center text-xs text-muted-foreground">
                Are you a member?
              </p>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link to="/badge">
                  <QrCode className="size-4" />
                  Get QR code
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link to="/check-in">
                  <UserCircle className="size-4" />
                  Member&apos;s Portal
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-white/60">Nouveaux Démocrates</p>
      </div>
    </div>
  )
}
