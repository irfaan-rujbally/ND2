import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  CheckCircle2,
  Info,
  LogIn,
  LogOut,
  QrCode,
  ShieldCheck,
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
import { OrbitBorder } from '@/components/orbit-border'
import { cn, formatDate, formatTimeRange } from '@/lib/utils'

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
  const location = useLocation()

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
          {/*
            "Access Member's Portal" rather than "Meeting check-in": this screen
            is the members' way in generally — scanning a meeting code is one of
            the things they do once here, not the only one.
          */}
          <p className="mt-4 text-sm font-medium text-white/80">Access Member&apos;s Portal</p>
        </div>

        <Card className="border-white/20 bg-card/95 shadow-2xl backdrop-blur">
          <CardContent className="p-6 sm:p-8">{children}</CardContent>
        </Card>

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
          {submitting ? <Spinner /> : <LogIn className="size-4" />}
          Sign in as member
        </Button>

        {/*
          Everything that is not "sign in as a member" sits below the divider,
          the same shape the staff form uses. Neither is a step of this one:
          collecting a badge needs no account at all, and the admin form is a
          different audience entirely.

          Only rendered while signed out, because this whole branch is. That is
          also why `location.state` is forwarded to /admin: a signed-out member
          of staff following a bookmark arrives here with the page they wanted in
          it, and /admin returns them there once they sign in.
        */}
        <div className="space-y-4 border-t pt-4">
          <div className="space-y-2">
            <p className="text-center text-xs text-muted-foreground">Just need your badge?</p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/badge">
                <QrCode className="size-4" />
                Get QR code
              </Link>
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-center text-xs text-muted-foreground">Are you an admin?</p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/admin" state={location.state}>
                <ShieldCheck className="size-4" />
                Admin&apos;s Portal
              </Link>
            </Button>
          </div>
        </div>
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
          <Link to="/my" className="font-medium underline">
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
          <p className="text-xs text-muted-foreground">
            {[formatDate(checkedIn.date), formatTimeRange(checkedIn.start_time, checkedIn.end_time)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      )}

      <Button className="w-full" size="lg" onClick={() => setScannerOpen(true)}>
        <QrCode className="size-4" />
        {checkedIn ? 'Scan another meeting' : 'Scan meeting code'}
      </Button>

      <div className="grid gap-2">
        {/*
          One way in rather than two. The portal has its own tab bar for details,
          meetings, announcements and news, so deep-linking two of those four from
          here only made the shorter list look like the whole of it.
        */}
        <Button variant="outline" asChild>
          <Link to="/my">
            <UserCircle className="size-4" />
            My Portal
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
        // One meeting code per member, so a successful scan ends the dialog
        // rather than reopening the camera.
        singleScan
        // The default copy addresses a member of staff working the door; here the
        // person reading it is the member being checked in.
        messages={{
          title: 'Scan the meeting code',
          aim: "Point the camera at the meeting's QR code.",
          rescan: 'Scan again',
          notOurs: 'That is not a meeting code.',
          added: 'You are checked in.',
          already: 'You were already checked in to this meeting.',
          failed: 'Not checked in.',
          pending: 'Checking the code…',
        }}
      />
    </div>,
  )
}
