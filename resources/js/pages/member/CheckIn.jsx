import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  Info,
  LogOut,
  QrCode,
  ScanLine,
  UserCircle,
} from 'lucide-react'

import { useMemberAuth } from '@/auth/MemberAuthProvider'
import { memberApi } from '@/lib/memberApi'
import { ThreeBackground } from '@/components/ThreeBackground'
import { QrScannerDialog } from '@/components/qr-scanner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Spinner } from '@/components/common'
import { cn, formatDate } from '@/lib/utils'

/**
 * Self service check-in.
 *
 * Two steps, deliberately in this order: the member signs in first, then scans
 * the meeting's code. The code is on a poster or a projector, so everyone in the
 * room has it -- it only says *which* meeting. Signing in is what says *who*
 * arrived, so it cannot be skipped.
 *
 * The route is public because a member arriving at a door has no session yet.
 * Everything past the sign-in form is not.
 */
export default function CheckIn() {
  const { member, isAuthenticated, isLoading, signIn, signOut, mustChangePassword } = useMemberAuth()

  const [form, setForm] = useState({ identifier: '', password: '' })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [scanLog, setScanLog] = useState([])
  const [checkedIn, setCheckedIn] = useState(null)

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setErrors({})
    setMessage(null)
    setSubmitting(true)

    try {
      await signIn({ identifier: form.identifier.trim(), password: form.password })
      setForm({ identifier: '', password: '' })
    } catch (error) {
      setErrors(error.errors ?? {})
      if (!error.isValidation) setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * The scanned code is spent straight away. The endpoint is idempotent, so a
   * camera that fires twice reports "already checked in" rather than failing or
   * double counting.
   */
  const handleScan = async (token) => {
    try {
      const response = await memberApi.checkIn(token)
      const meeting = response.data.meeting

      setCheckedIn({ ...meeting, alreadyHere: response.data.already_here })
      setScanResult({
        at: Date.now(),
        label: meeting.title,
        status: response.data.already_here ? 'already' : 'added',
      })
      setScanLog((current) =>
        [
          {
            at: Date.now(),
            label: meeting.title,
            status: response.data.already_here ? 'already' : 'added',
          },
          ...current,
        ].slice(0, 20),
      )
    } catch (error) {
      setScanResult({
        at: Date.now(),
        label: error.status === 404 ? 'Not a meeting code' : error.message,
        status: 'failed',
      })
    }
  }

  const shell = (children) => (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-nd-red via-primary to-nd-blue p-4">
      <ThreeBackground className="pointer-events-none absolute inset-0" density={1.1} />

      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <img
            src="/images/logo-new.png"
            alt="Nouveaux Démocrates"
            className="mx-auto h-20 w-auto rounded-lg bg-white p-2 shadow-lg"
          />
          <p className="mt-4 text-sm font-medium text-white/80">Meeting check-in</p>
        </div>

        <Card className="border-white/20 bg-card/95 shadow-2xl backdrop-blur">
          <CardContent className="p-6 sm:p-8">{children}</CardContent>
        </Card>

        {/*
          Only while signed out. It is the way back for a member who landed here
          from the staff login; once they are signed in it points at a form they
          have no use for, and "Sign out" inside the card is the exit they want.
          Hidden during the initial token check too, so it does not flash in and
          straight back out again.
        */}
        {!isAuthenticated && !isLoading && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="mt-4 w-full text-white hover:bg-white/10 hover:text-white"
          >
            <Link to="/login">
              <ArrowLeft className="size-4" />
              Back to login
            </Link>
          </Button>
        )}
      </div>
    </div>
  )

  if (isLoading) {
    return shell(
      <div className="flex justify-center py-6">
        <Spinner className="size-6 text-primary" />
      </div>,
    )
  }

  if (!isAuthenticated) {
    return shell(
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="flex gap-3 rounded-lg bg-muted/50 p-3">
          <ScanLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sign in, then scan the QR code shown at the meeting to be recorded present.
          </p>
        </div>

        {message && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>
        )}

        <Field
          id="identifier"
          label="Email or phone number"
          error={errors.identifier?.[0]}
          required
        >
          <Input
            id="identifier"
            value={form.identifier}
            onChange={update('identifier')}
            autoComplete="username"
            inputMode="email"
            autoFocus
          />
        </Field>

        <Field id="password" label="Password" error={errors.password?.[0]} required>
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={update('password')}
            autoComplete="current-password"
          />
        </Field>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Spinner /> : <ScanLine className="size-4" />}
          Sign in to check in
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          First time? Your password is the first letter of your last name in capitals followed by the
          last 7 digits of your phone number.
        </p>

        <p className="text-center text-xs text-muted-foreground">
          Just need your badge?{' '}
          <Link to="/badge" className="font-medium text-primary hover:underline">
            Get your QR code
          </Link>
        </p>
      </form>,
    )
  }

  return shell(
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-lg font-semibold">{member?.first_name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {checkedIn ? 'You are on the attendance list.' : 'Scan the meeting code to check in.'}
        </p>
      </div>

      {mustChangePassword && (
        <p className="rounded-lg bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          You are still using your starting password, which others could work out.{' '}
          <Link to="/my/password" className="font-medium underline">
            Change it
          </Link>
          .
        </p>
      )}

      {/*
        Already-present is not the same outcome as just-recorded, so it does not
        get the same green panel: a member who scans twice should be able to see
        at a glance that the second scan changed nothing, without reading it as a
        failure either -- hence amber rather than red.
      */}
      {checkedIn && (
        <div
          className={cn(
            'space-y-2 rounded-xl p-4 text-center',
            checkedIn.alreadyHere ? 'bg-amber-500/10' : 'bg-emerald-500/10',
          )}
        >
          {checkedIn.alreadyHere ? (
            <Info className="mx-auto size-8 text-amber-600" />
          ) : (
            <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
          )}
          <p className="font-semibold">{checkedIn.title}</p>
          <p className="text-sm">
            {checkedIn.alreadyHere
              ? 'You were already checked in — nothing changed.'
              : 'You are checked in.'}
          </p>
          <p className="text-xs text-muted-foreground">{formatDate(checkedIn.date)}</p>
        </div>
      )}

      <Button className="w-full" size="lg" onClick={() => setScannerOpen(true)}>
        <QrCode className="size-4" />
        {checkedIn ? 'Scan another meeting' : 'Scan meeting code'}
      </Button>

      <div className="grid gap-2">
        <Button variant="outline" asChild>
          <Link to="/my">
            <UserCircle className="size-4" />
            My details and badge
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/my/meetings">
            <CalendarCheck className="size-4" />
            My meetings
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>

      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onToken={handleScan}
        log={scanLog}
        result={scanResult}
        onContinue={() => setScanResult(null)}
        // The default copy addresses a member of staff working the door; here the
        // person reading it is the member being checked in.
        messages={{
          added: 'You are checked in.',
          already: 'You were already checked in to this meeting.',
          failed: 'Not checked in.',
          pending: 'Checking the code…',
        }}
      />
    </div>,
  )
}
