import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { ThreeBackground } from '@/components/ThreeBackground'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Spinner } from '@/components/common'

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
          <img
            src="/images/banner.jpeg"
            alt="Nouveaux Démocrates"
            className="mx-auto h-20 w-auto rounded-lg bg-white p-2 shadow-lg"
          />
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
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-white/60">Nouveaux Démocrates</p>
      </div>
    </div>
  )
}
