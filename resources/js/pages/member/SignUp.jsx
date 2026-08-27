import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, FileUp, UserPlus, X } from 'lucide-react'

import { submitMemberSignup } from '@/lib/memberApi'
import {
  COMMUNICATION_METHODS,
  CONSTITUENCIES,
  GENDERS,
  HEARD_ABOUT_US,
  VOLUNTEER_INTERESTS,
} from '@/lib/membership'
import { ThreeBackground } from '@/components/ThreeBackground'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, Spinner } from '@/components/common'
import { CheckboxField, CheckboxGroup, FormSection, RadioGroup } from '@/components/form-controls'
import { OrbitBorder } from '@/components/orbit-border'

/** Mirrors the server's cap, so an oversized file is refused before uploading it. */
const MAX_BYTES = 5 * 1024 * 1024

const EMPTY = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
  date_of_birth: '',
  national_id: '',
  gender: '',
  constituency: '',
  profession: '',
  password: '',
  password_confirmation: '',

  alternative_contact: '',
  whatsapp_available: false,
  employer_name: '',
  skills_expertise: '',
  communication_preferences: [],
  volunteer_interests: [],
  referrer_name: '',
  referrer_contact: '',
  how_heard_about_us: '',
  documents_confirmed: false,
}

/**
 * The public membership application.
 *
 * The same fields an administrator completes on the staff form, minus the ones
 * that are the office's to decide: no office, no attendance badge, no CV slot.
 * A password is added, because an applicant who cannot sign in afterwards has no
 * way back to their own record.
 *
 * The identity document is a plain file input, not the FileField used elsewhere:
 * that component uploads to the staff-only endpoint and hands back a path, while
 * here the file travels inside the application itself so nothing is written to
 * disk until the whole form validates.
 */
export default function SignUp() {
  const navigate = useNavigate()

  const [form, setForm] = useState(EMPTY)
  const [document, setDocument] = useState(null)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(null)
  const fileInput = useRef(null)

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const setInput = (key) => (event) => set(key)(event.target.value)
  const errorFor = (key) => errors[key]?.[0]

  const pickFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_BYTES) {
      setErrors((current) => ({ ...current, documents: ['That file is larger than 5 MB.'] }))
      event.target.value = ''
      return
    }

    setErrors((current) => ({ ...current, documents: undefined }))
    setDocument(file)
  }

  const clearFile = () => {
    setDocument(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const submit = async (event) => {
    event.preventDefault()
    setErrors({})
    setMessage(null)
    setSubmitting(true)

    try {
      const result = await submitMemberSignup({
        ...form,
        constituency: form.constituency === '' ? '' : Number(form.constituency),
        documents: document,
      })

      setSubmitted(result.message)
    } catch (error) {
      setErrors(error.errors ?? {})
      // 422 already puts a message under each field; anything else needs saying.
      if (!error.isValidation) setMessage(error.message)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSubmitting(false)
    }
  }

  /*
   * The same shell as the sign-in screen, deliberately identical: the gradient,
   * the ThreeBackground settings and the logo plate. Only the column is wider,
   * because this is a long form rather than two fields.
   *
   * The white belongs on OrbitBorder's innerClassName, not its className. On the
   * outer wrapper it sits *behind* the orbiting gradient, which then shows
   * through and turns the plate into a translucent coloured panel with the logo
   * barely legible on it -- see the component's own note.
   */
  const shell = (children) => (
    <div className="relative flex min-h-dvh justify-center overflow-hidden bg-gradient-to-br from-nd-red via-primary to-nd-blue p-4">
      <ThreeBackground className="pointer-events-none absolute inset-0" density={1.1} />

      <div className="relative w-full max-w-2xl py-6 sm:py-10">
        <div className="mb-6 text-center">
          <OrbitBorder innerClassName="bg-white px-4 py-3">
            <img
              src="/images/logo-new.png"
              alt="Nouveaux Démocrates"
              className="mx-auto h-14 w-auto sm:h-16"
            />
          </OrbitBorder>
          <p className="mt-4 text-sm font-medium text-white/80">Apply for Membership</p>
        </div>

        <Card className="border-white/20 bg-card/95 shadow-2xl backdrop-blur">
          <CardContent className="p-6 sm:p-8">{children}</CardContent>
        </Card>

        <Button
          asChild
          variant="ghost"
          size="sm"
          className="mt-4 w-full text-white hover:bg-white/10 hover:text-white"
        >
          <Link to="/login">
            <ArrowLeft className="size-4" />
            Back to sign in
          </Link>
        </Button>
      </div>
    </div>
  )

  if (submitted) {
    return shell(
      <div className="space-y-5 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
        <div>
          <p className="text-lg font-semibold">Application received</p>
          <p className="mt-2 text-sm text-muted-foreground">{submitted}</p>
        </div>
        <Button className="w-full" onClick={() => navigate('/login')}>
          Back to sign in
        </Button>
      </div>,
    )
  }

  return shell(
    <form onSubmit={submit} className="space-y-8" noValidate>
      {message ? (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>
      ) : null}

      <FormSection
        title="Personal Information"
        description="Everything here is required. The office checks it against your document before approving."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="first_name" label="First name" error={errorFor('first_name')} required>
            <Input id="first_name" value={form.first_name} onChange={setInput('first_name')} autoComplete="given-name" />
          </Field>
          <Field id="last_name" label="Last name" error={errorFor('last_name')} required>
            <Input id="last_name" value={form.last_name} onChange={setInput('last_name')} autoComplete="family-name" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="email" label="Email address" error={errorFor('email')} required>
            <Input id="email" type="email" value={form.email} onChange={setInput('email')} autoComplete="email" />
          </Field>
          <Field
            id="phone"
            label="Mobile number"
            hint="Eight digits, no spaces or country code."
            error={errorFor('phone')}
            required
          >
            <Input id="phone" inputMode="numeric" value={form.phone} onChange={setInput('phone')} autoComplete="tel-national" />
          </Field>
        </div>

        <Field id="address" label="Address" error={errorFor('address')} required>
          <Textarea id="address" rows={2} value={form.address} onChange={setInput('address')} autoComplete="street-address" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="date_of_birth" label="Date of birth" error={errorFor('date_of_birth')} required>
            <Input id="date_of_birth" type="date" value={form.date_of_birth} onChange={setInput('date_of_birth')} />
          </Field>
          <Field id="national_id" label="National ID" error={errorFor('national_id')} required>
            <Input id="national_id" value={form.national_id} onChange={setInput('national_id')} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="constituency" label="Constituency" error={errorFor('constituency')} required>
            <Select value={form.constituency} onValueChange={set('constituency')}>
              <SelectTrigger id="constituency">
                <SelectValue placeholder="Select constituency" />
              </SelectTrigger>
              <SelectContent>
                {CONSTITUENCIES.map((c) => (
                  <SelectItem key={c.value} value={String(c.value)}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="profession" label="Profession / occupation" error={errorFor('profession')} required>
            <Input id="profession" value={form.profession} onChange={setInput('profession')} />
          </Field>
        </div>

        <RadioGroup
          legend="Gender"
          name="gender"
          options={GENDERS}
          value={form.gender}
          onChange={set('gender')}
          error={errorFor('gender')}
        />
      </FormSection>

      <FormSection
        title="Choose a password"
        description="You will use this with your email address or mobile number once your application is approved."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="password" label="Password" hint="At least 8 characters." error={errorFor('password')} required>
            <Input id="password" type="password" value={form.password} onChange={setInput('password')} autoComplete="new-password" />
          </Field>
          <Field id="password_confirmation" label="Confirm password" required>
            <Input
              id="password_confirmation"
              type="password"
              value={form.password_confirmation}
              onChange={setInput('password_confirmation')}
              autoComplete="new-password"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Identity document" description="A PDF or photo of your national ID. Up to 5 MB.">
        <div>
          <input
            ref={fileInput}
            id="documents"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={pickFile}
            className="sr-only"
          />

          {document ? (
            <div className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <FileUp className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{document.name}</span>
              <Button type="button" variant="ghost" size="icon" className="size-7" onClick={clearFile} aria-label="Remove file">
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="w-full" onClick={() => fileInput.current?.click()}>
              <FileUp className="size-4" />
              Choose file
            </Button>
          )}

          {errorFor('documents') ? (
            <p className="mt-1.5 text-sm text-destructive">{errorFor('documents')}</p>
          ) : null}
        </div>

        <CheckboxField
          id="documents_confirmed"
          checked={form.documents_confirmed}
          onChange={set('documents_confirmed')}
          label="I confirm the information above is correct"
          description="And that the document I have attached is my own."
        />
        {errorFor('documents_confirmed') ? (
          <p className="text-sm text-destructive">{errorFor('documents_confirmed')}</p>
        ) : null}
      </FormSection>

      <FormSection title="Preferred communication method" description="Optional.">
        <CheckboxGroup
          options={COMMUNICATION_METHODS}
          value={form.communication_preferences}
          onChange={set('communication_preferences')}
          columns={3}
          error={errorFor('communication_preferences')}
        />
        <CheckboxField
          id="whatsapp_available"
          checked={form.whatsapp_available}
          onChange={set('whatsapp_available')}
          label="I am reachable on WhatsApp"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="alternative_contact" label="Alternative contact" error={errorFor('alternative_contact')}>
            <Input id="alternative_contact" value={form.alternative_contact} onChange={setInput('alternative_contact')} />
          </Field>
          <Field id="employer_name" label="Employer" error={errorFor('employer_name')}>
            <Input id="employer_name" value={form.employer_name} onChange={setInput('employer_name')} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Volunteer interests" description="Optional. Where you would be willing to help.">
        <CheckboxGroup
          options={VOLUNTEER_INTERESTS}
          value={form.volunteer_interests}
          onChange={set('volunteer_interests')}
          error={errorFor('volunteer_interests')}
        />
        <Field id="skills_expertise" label="Skills & expertise" error={errorFor('skills_expertise')}>
          <Textarea id="skills_expertise" rows={3} value={form.skills_expertise} onChange={setInput('skills_expertise')} />
        </Field>
      </FormSection>

      <FormSection title="Referral" description="Optional. Who told you about us, if anyone.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="referrer_name" label="Referrer's name" error={errorFor('referrer_name')}>
            <Input id="referrer_name" value={form.referrer_name} onChange={setInput('referrer_name')} />
          </Field>
          <Field id="referrer_contact" label="Referrer's contact" error={errorFor('referrer_contact')}>
            <Input id="referrer_contact" value={form.referrer_contact} onChange={setInput('referrer_contact')} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="How did you hear about us?" description="Optional.">
        <RadioGroup
          name="how_heard_about_us"
          options={HEARD_ABOUT_US}
          value={form.how_heard_about_us}
          onChange={set('how_heard_about_us')}
          error={errorFor('how_heard_about_us')}
        />
      </FormSection>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? <Spinner /> : <UserPlus className="size-4" />}
        {submitting ? 'Sending…' : 'Submit application'}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Your application goes to the office for review. You will be able to sign in once it is approved.
      </p>
    </form>,
  )
}
