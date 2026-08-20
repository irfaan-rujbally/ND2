import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'

import { useMemberAuth } from '@/auth/MemberAuthProvider'
import { memberApi } from '@/lib/memberApi'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Spinner } from '@/components/common'

const EMPTY = { current_password: '', password: '', password_confirmation: '' }

/**
 * Changing the password off the one the office issued.
 *
 * Worth doing: the starting password is the member's last-name initial and the
 * last seven digits of their phone number, so anyone who knows both can work it
 * out. Changing it also ends every other session, which is the point if someone
 * already guessed it.
 */
export default function ChangePassword() {
  const { member, setMember } = useMemberAuth()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  const change = useMutation({
    mutationFn: (values) => memberApi.changePassword(values),
    onSuccess: (response) => {
      setErrors({})
      setForm(EMPTY)
      // The warning banner keys off this, so clear it without a refetch.
      setMember((current) => (current ? { ...current, must_change_password: false } : current))
      toast.success(response.message ?? 'Your password has been changed.')
    },
    onError: (error) => {
      setErrors(error.errors ?? {})
      if (!error.isValidation && error.status !== 422) toast.error(error.message)
    },
  })

  const submit = (event) => {
    event.preventDefault()
    change.mutate(form)
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={submit} className="max-w-sm space-y-4" noValidate>
          <div>
            <h2 className="font-semibold">Change my password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              At least 8 characters. Signing out everywhere else happens automatically.
            </p>
          </div>

          {member?.must_change_password && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
              You are still using the password the office issued. Anyone who knows your name and
              phone number could work it out, so please change it now.
            </p>
          )}

          <Field
            id="current_password"
            label="Current password"
            error={errors.current_password?.[0]}
            required
          >
            <Input
              id="current_password"
              type="password"
              autoComplete="current-password"
              value={form.current_password}
              onChange={update('current_password')}
            />
          </Field>

          <Field id="password" label="New password" error={errors.password?.[0]} required>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={update('password')}
            />
          </Field>

          <Field
            id="password_confirmation"
            label="Confirm new password"
            error={errors.password_confirmation?.[0]}
            required
          >
            <Input
              id="password_confirmation"
              type="password"
              autoComplete="new-password"
              value={form.password_confirmation}
              onChange={update('password_confirmation')}
            />
          </Field>

          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? <Spinner /> : <KeyRound className="size-4" />}
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
