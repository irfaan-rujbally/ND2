import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { destroy, memberDocumentUrl, mutate, search } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { CheckboxField, CheckboxGroup, FileField, FormSection, RadioGroup } from '@/components/form-controls'
import {
  AGE_RANGES,
  COMMUNICATION_METHODS,
  CONSTITUENCIES,
  DOCUMENT_ACCEPT,
  GENDERS,
  HEARD_ABOUT_US,
  VOLUNTEER_INTERESTS,
} from '@/lib/membership'
import { humanizeValidationMessage } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'

const EMPTY = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  national_id: '',
  gender: '',
  phone: '',
  alternative_contact: '',
  whatsapp_available: false,
  address: '',
  email: '',
  constituency: '',
  age: '',
  profession: '',
  employer_name: '',
  skills_expertise: '',
  communication_preferences: [],
  referrer_name: '',
  referrer_contact: '',
  volunteer_interests: [],
  how_heard_about_us: '',
  cv_path: '',
  documents_path: '',
  documents_confirmed: false,
  office_id: '',
}

export default function MemberForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [form, setForm] = useState(EMPTY)
  const [uploadNames, setUploadNames] = useState({ cv: '', documents: '' })
  const [errors, setErrors] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const setInput = (key) => (event) => set(key)(event.target.value)

  const officesQuery = useQuery({
    queryKey: ['offices'],
    queryFn: () => search('offices', { limit: 100 }),
  })

  const memberQuery = useQuery({
    queryKey: ['member', id],
    enabled: isEdit,
    queryFn: () =>
      search('members', {
        filters: [{ field: 'id', operator: '=', value: Number(id) }],
        limit: 10,
      }).then((response) => response.data[0] ?? null),
  })

  useEffect(() => {
    if (isEdit && memberQuery.data) {
      const m = memberQuery.data
      setForm({
        first_name: m.first_name ?? '',
        last_name: m.last_name ?? '',
        date_of_birth: m.date_of_birth ? String(m.date_of_birth).slice(0, 10) : '',
        national_id: m.national_id ?? '',
        gender: m.gender ?? '',
        phone: m.phone ?? '',
        alternative_contact: m.alternative_contact ?? '',
        whatsapp_available: Boolean(m.whatsapp_available),
        address: m.address ?? '',
        email: m.email ?? '',
        constituency: m.constituency != null ? String(m.constituency) : '',
        age: m.age ?? '',
        profession: m.profession ?? '',
        employer_name: m.employer_name ?? '',
        skills_expertise: m.skills_expertise ?? '',
        communication_preferences: m.communication_preferences ?? [],
        referrer_name: m.referrer_name ?? '',
        referrer_contact: m.referrer_contact ?? '',
        volunteer_interests: m.volunteer_interests ?? [],
        how_heard_about_us: m.how_heard_about_us ?? '',
        cv_path: m.cv_path ?? '',
        documents_path: m.documents_path ?? '',
        documents_confirmed: Boolean(m.documents_confirmed),
        office_id: m.office_id != null ? String(m.office_id) : '',
      })
    } else if (!isEdit && user?.office_id) {
      setForm((current) => ({ ...current, office_id: String(user.office_id) }))
    }
  }, [isEdit, memberQuery.data, user?.office_id])

  const save = useMutation({
    mutationFn: () => {
      const blankToNull = (v) => (v === '' ? null : v)

      const attributes = {
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: blankToNull(form.date_of_birth),
        national_id: blankToNull(form.national_id),
        gender: blankToNull(form.gender),
        phone: blankToNull(form.phone),
        alternative_contact: blankToNull(form.alternative_contact),
        whatsapp_available: form.whatsapp_available,
        address: blankToNull(form.address),
        email: blankToNull(form.email),
        constituency: form.constituency === '' ? null : Number(form.constituency),
        age: blankToNull(form.age),
        profession: blankToNull(form.profession),
        employer_name: blankToNull(form.employer_name),
        skills_expertise: blankToNull(form.skills_expertise),
        communication_preferences: form.communication_preferences,
        referrer_name: blankToNull(form.referrer_name),
        referrer_contact: blankToNull(form.referrer_contact),
        volunteer_interests: form.volunteer_interests,
        how_heard_about_us: blankToNull(form.how_heard_about_us),
        cv_path: blankToNull(form.cv_path),
        documents_path: blankToNull(form.documents_path),
        documents_confirmed: form.documents_confirmed,
        office_id: form.office_id ? Number(form.office_id) : null,
      }

      return mutate('members', [
        isEdit
          ? { operation: 'update', key: Number(id), attributes }
          : { operation: 'create', attributes },
      ])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success(isEdit ? 'Member updated.' : 'Member created.')
      navigate('/members')
    },
    onError: (error) => {
      setErrors(error.errors ?? {})
      if (error.isValidation) toast.error('Please check the highlighted fields.')
      else toast.error(error.message)
    },
  })

  const remove = useMutation({
    mutationFn: () => destroy('members', [Number(id)]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Member deleted.')
      navigate('/members')
    },
    onError: (error) => toast.error(error.message),
  })

  const submit = (event) => {
    event.preventDefault()
    setErrors({})
    save.mutate()
  }

  /* Lomkit reports errors against the mutate path, e.g. mutate.0.attributes.email. */
  const errorFor = (field) =>
    humanizeValidationMessage(
      errors[field]?.[0] ?? errors[`mutate.0.attributes.${field}`]?.[0],
    ) ?? undefined

  if (memberQuery.error) {
    return <ErrorState error={memberQuery.error} onRetry={memberQuery.refetch} />
  }

  const offices = officesQuery.data?.data ?? []
  const loading = isEdit && memberQuery.isPending

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/members">
          <ArrowLeft className="size-4" />
          Back to members
        </Link>
      </Button>

      <PageHeader
        title={isEdit ? 'Edit member' : 'Membership application'}
        description={
          isEdit
            ? 'Update this member’s details.'
            : 'Same information as the public application form at nouveauxdemocrates.com/join.'
        }
      />

      {loading ? (
        <Card>
          <CardContent className="space-y-4 p-6 sm:p-8">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {/* ------------------------------------------------ Personal */}
          <Card>
            <CardContent className="p-6 sm:p-8">
              <FormSection title="Personal Information">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="first_name" label="First Name (as per National ID)" error={errorFor('first_name')} required>
                    <Input id="first_name" value={form.first_name} onChange={setInput('first_name')} />
                  </Field>
                  <Field id="last_name" label="Last Name (as per National ID)" error={errorFor('last_name')} required>
                    <Input id="last_name" value={form.last_name} onChange={setInput('last_name')} />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="date_of_birth" label="Date of Birth" error={errorFor('date_of_birth')} required={!isEdit}>
                    <Input id="date_of_birth" type="date" value={form.date_of_birth} onChange={setInput('date_of_birth')} />
                  </Field>
                  <Field id="national_id" label="National ID Number" error={errorFor('national_id')} required={!isEdit}>
                    <Input
                      id="national_id"
                      value={form.national_id}
                      onChange={setInput('national_id')}
                      placeholder="National ID Number"
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="gender" label="Gender" error={errorFor('gender')} required={!isEdit}>
                    <Select value={form.gender} onValueChange={set('gender')}>
                      <SelectTrigger id="gender">
                        <SelectValue placeholder="Select Gender" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    id="age"
                    label="Age Group"
                    error={errorFor('age')}
                    hint="Kept from earlier records; optional."
                  >
                    <Select value={form.age} onValueChange={set('age')}>
                      <SelectTrigger id="age">
                        <SelectValue placeholder="Select Age Group" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGE_RANGES.map((range) => (
                          <SelectItem key={range} value={range}>
                            {range}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="phone" label="Mobile Number" error={errorFor('phone')} required={!isEdit}>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      value={form.phone}
                      onChange={setInput('phone')}
                      placeholder="Mobile Number (+230)"
                    />
                  </Field>
                  <Field
                    id="alternative_contact"
                    label="Alternative Contact (Optional)"
                    error={errorFor('alternative_contact')}
                  >
                    <Input
                      id="alternative_contact"
                      type="tel"
                      inputMode="tel"
                      value={form.alternative_contact}
                      onChange={setInput('alternative_contact')}
                      placeholder="Alternative Contact"
                    />
                  </Field>
                </div>

                <CheckboxField
                  id="whatsapp_available"
                  checked={form.whatsapp_available}
                  onChange={set('whatsapp_available')}
                  label="My mobile number is registered on WhatsApp"
                />

                <Field id="address" label="Residential Address" error={errorFor('address')} required={!isEdit}>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={setInput('address')}
                    placeholder="Residential Address"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="email" label="Email Address" error={errorFor('email')} required={!isEdit}>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={setInput('email')}
                      placeholder="Email Address"
                    />
                  </Field>
                  <Field id="constituency" label="Constituency" error={errorFor('constituency')} required>
                    <Select value={form.constituency} onValueChange={set('constituency')}>
                      <SelectTrigger id="constituency">
                        <SelectValue placeholder="Select Constituency" />
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
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="profession" label="Profession/Occupation" error={errorFor('profession')} required={!isEdit}>
                    <Input
                      id="profession"
                      value={form.profession}
                      onChange={setInput('profession')}
                      placeholder="Profession/Occupation"
                    />
                  </Field>
                  <Field id="employer_name" label="Employer Name (Optional)" error={errorFor('employer_name')}>
                    <Input
                      id="employer_name"
                      value={form.employer_name}
                      onChange={setInput('employer_name')}
                      placeholder="Employer Name"
                    />
                  </Field>
                </div>

                <Field
                  id="skills_expertise"
                  label="Skills/Expertise (Optional)"
                  error={errorFor('skills_expertise')}
                >
                  <Textarea
                    id="skills_expertise"
                    value={form.skills_expertise}
                    onChange={setInput('skills_expertise')}
                    rows={3}
                  />
                </Field>

                <Field id="office_id" label="Office" error={errorFor('office_id')} required>
                  <Select value={form.office_id} onValueChange={set('office_id')}>
                    <SelectTrigger id="office_id">
                      <SelectValue placeholder="Select an office" />
                    </SelectTrigger>
                    <SelectContent>
                      {offices.map((office) => (
                        <SelectItem key={office.id} value={String(office.id)}>
                          {office.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FormSection>
            </CardContent>
          </Card>

          {/* ------------------------------------------------ Preferences */}
          <Card>
            <CardContent className="space-y-8 p-6 sm:p-8">
              <FormSection title="Preferred Communication Method">
                <CheckboxGroup
                  options={COMMUNICATION_METHODS}
                  value={form.communication_preferences}
                  onChange={set('communication_preferences')}
                  columns={3}
                  error={errorFor('communication_preferences')}
                />
              </FormSection>

              <FormSection
                title="Referral Information (Optional)"
                description="If referred by a member of Nouveaux Démocrates, please provide their details"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="referrer_name" label="Referrer Name" error={errorFor('referrer_name')}>
                    <Input id="referrer_name" value={form.referrer_name} onChange={setInput('referrer_name')} />
                  </Field>
                  <Field id="referrer_contact" label="Referrer Contact" error={errorFor('referrer_contact')}>
                    <Input
                      id="referrer_contact"
                      type="tel"
                      inputMode="tel"
                      value={form.referrer_contact}
                      onChange={setInput('referrer_contact')}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Volunteer Interests">
                <CheckboxGroup
                  options={VOLUNTEER_INTERESTS}
                  value={form.volunteer_interests}
                  onChange={set('volunteer_interests')}
                  error={errorFor('volunteer_interests')}
                />
              </FormSection>

              <FormSection title="How Did You Hear About Us?">
                <RadioGroup
                  name="how_heard_about_us"
                  options={HEARD_ABOUT_US}
                  value={form.how_heard_about_us}
                  onChange={set('how_heard_about_us')}
                  columns={4}
                  error={errorFor('how_heard_about_us')}
                />
              </FormSection>
            </CardContent>
          </Card>

          {/* ------------------------------------------------ Documents */}
          <Card>
            <CardContent className="p-6 sm:p-8">
              <FormSection title="Documents">
                <FileField
                  id="cv_path"
                  kind="cv"
                  label="CV / Resume (Optional)"
                  hint="PDF, DOC, DOCX, JPG, PNG — max 5 MB"
                  accept={DOCUMENT_ACCEPT.cv}
                  value={form.cv_path}
                  fileName={uploadNames.cv || form.cv_path?.split('/').pop()}
                  existingUrl={isEdit && form.cv_path ? memberDocumentUrl(id, 'cv') : null}
                  onUploaded={(uploaded) => {
                    set('cv_path')(uploaded.path)
                    setUploadNames((n) => ({ ...n, cv: uploaded.original_name }))
                  }}
                  onCleared={() => {
                    set('cv_path')('')
                    setUploadNames((n) => ({ ...n, cv: '' }))
                  }}
                  error={errorFor('cv_path')}
                />

                <FileField
                  id="documents_path"
                  kind="documents"
                  label="National ID & Birth Certificate"
                  hint="Upload a single PDF or image containing both documents — max 5 MB"
                  accept={DOCUMENT_ACCEPT.documents}
                  value={form.documents_path}
                  fileName={uploadNames.documents || form.documents_path?.split('/').pop()}
                  existingUrl={isEdit && form.documents_path ? memberDocumentUrl(id, 'documents') : null}
                  onUploaded={(uploaded) => {
                    set('documents_path')(uploaded.path)
                    setUploadNames((n) => ({ ...n, documents: uploaded.original_name }))
                  }}
                  onCleared={() => {
                    set('documents_path')('')
                    setUploadNames((n) => ({ ...n, documents: '' }))
                  }}
                  required={!isEdit}
                  error={errorFor('documents_path')}
                />

                <CheckboxField
                  id="documents_confirmed"
                  checked={form.documents_confirmed}
                  onChange={set('documents_confirmed')}
                  label="I confirm that I have provided copies of my National Identity Card and Birth Certificate with this application."
                />
                {errorFor('documents_confirmed') ? (
                  <p className="text-xs font-medium text-destructive">{errorFor('documents_confirmed')}</p>
                ) : null}

                <p className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                  <strong className="font-semibold text-foreground">Data Protection:</strong> By submitting this
                  form, I consent to the collection, processing, and storage of my personal information by
                  Nouveaux Démocrates in accordance with applicable data protection laws.
                </p>
              </FormSection>
            </CardContent>
          </Card>

          {/* ------------------------------------------------ Actions */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : (
              <span />
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => navigate('/members')}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Spinner /> : null}
                {isEdit ? 'Save changes' : 'Submit application'}
              </Button>
            </div>
          </div>
        </form>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this member?</DialogTitle>
            <DialogDescription>
              The member is archived rather than erased, so their attendance history is preserved and an
              administrator can restore them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? <Spinner /> : <Trash2 className="size-4" />}
              Delete member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
