<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\Office;
use App\Rest\Resources\MemberResource;
use App\Rules\MobileNumber;
use App\Support\ActivityNotifier;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The public membership application.
 *
 * Fields mirror MemberResource::createRules() -- the same information an
 * administrator captures -- plus a password, because an applicant who cannot
 * sign in afterwards has no way back to their own record.
 *
 * Three things are deliberately not taken from the request, whatever it sends.
 * `Model::unguard()` is global in this application (AppServiceProvider), so
 * every attribute written here is listed explicitly and the request is never
 * handed to create() wholesale:
 *
 *   approved_at   always null. Set only by staff, and it gates sign-in.
 *   office_id     the configured intake office. An applicant cannot know which
 *                 office is theirs, and letting them choose would let them file
 *                 themselves into any register in the party.
 *   qr_token      minted by the model. It is the attendance credential.
 *
 * The document arrives inside this same multipart request rather than through a
 * separate public upload endpoint. That was the alternative, and it would have
 * meant an unauthenticated route that writes files to disk on its own -- worth
 * avoiding for a route nobody has to sign in to reach. Here the file is only
 * stored once the whole application has validated.
 */
class PublicMemberSignupController extends Controller
{
    /** Matches the limit the staff uploader advertises. */
    private const MAX_KILOBYTES = 5120;

    public function __invoke(Request $request): JsonResponse
    {
        abort_unless(config('members.signup.enabled'), 503, 'Membership applications are closed at the moment.');

        $office = $this->intakeOffice();

        abort_if($office === null, 503, 'Membership applications are not available yet.');

        $data = $request->validate([
            // Required: the same set an administrator must complete.
            'first_name'    => ['required', 'string', 'max:50'],
            'last_name'     => ['required', 'string', 'max:50'],
            'email'         => ['required', 'email', 'max:50', $this->unusedEmail()],
            // MobileNumber already refuses a number held by another member, and
            // compares on digits so the register's mixed formats cannot smuggle
            // a duplicate past it.
            'phone'         => ['required', new MobileNumber()],
            'address'       => ['required', 'string', 'max:250'],
            'date_of_birth' => ['required', 'date', 'before:today'],
            'national_id'   => ['required', 'string', 'max:50', $this->unusedNationalId()],
            'gender'        => ['required', Rule::in(MemberResource::GENDERS)],
            'profession'    => ['required', 'string', 'max:255'],
            'constituency'  => ['required', 'integer', 'between:'.MemberResource::CONSTITUENCY_MIN.','.MemberResource::CONSTITUENCY_MAX],

            'documents'           => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:'.self::MAX_KILOBYTES],
            'documents_confirmed' => ['accepted'],

            // They choose it here, so they never hold the derivable default.
            'password' => ['required', 'string', 'min:8', 'confirmed'],

            // Optional: everything the staff form marks optional.
            'alternative_contact'         => ['nullable', 'string', 'max:50'],
            'whatsapp_available'          => ['nullable', 'boolean'],
            'employer_name'               => ['nullable', 'string', 'max:255'],
            'skills_expertise'            => ['nullable', 'string', 'max:2000'],
            'communication_preferences'   => ['nullable', 'array'],
            'communication_preferences.*' => [Rule::in(MemberResource::COMMUNICATION_METHODS)],
            'volunteer_interests'         => ['nullable', 'array'],
            'volunteer_interests.*'       => [Rule::in(MemberResource::VOLUNTEER_INTERESTS)],
            'referrer_name'               => ['nullable', 'string', 'max:255'],
            'referrer_contact'            => ['nullable', 'string', 'max:50'],
            'how_heard_about_us'          => ['nullable', Rule::in(MemberResource::HEARD_ABOUT_US)],
        ], [], [
            'documents'           => 'identity document',
            'documents_confirmed' => 'declaration',
        ]);

        $member = DB::transaction(function () use ($request, $data, $office) {
            // Stored inside the transaction so a failed insert does not leave the
            // file behind, and only after validation so the disk is never written
            // to on a rejected request.
            $path = $request->file('documents')->store('member-documents/documents', 'local');

            return Member::create([
                'first_name'                => $data['first_name'],
                'last_name'                 => $data['last_name'],
                'email'                     => $data['email'],
                'phone'                     => $data['phone'],
                'address'                   => $data['address'],
                'date_of_birth'             => $data['date_of_birth'],
                'national_id'               => $data['national_id'],
                'gender'                    => $data['gender'],
                'profession'                => $data['profession'],
                'constituency'              => $data['constituency'],
                'alternative_contact'       => $data['alternative_contact'] ?? null,
                'whatsapp_available'        => (bool) ($data['whatsapp_available'] ?? false),
                'employer_name'             => $data['employer_name'] ?? null,
                'skills_expertise'          => $data['skills_expertise'] ?? null,
                'communication_preferences' => $data['communication_preferences'] ?? null,
                'volunteer_interests'       => $data['volunteer_interests'] ?? null,
                'referrer_name'             => $data['referrer_name'] ?? null,
                'referrer_contact'          => $data['referrer_contact'] ?? null,
                'how_heard_about_us'        => $data['how_heard_about_us'] ?? null,

                'documents_path'      => $path,
                'documents_confirmed' => true,

                'password'        => $data['password'],
                'password_set_at' => now(),

                'office_id'          => $office->id,
                'self_registered_at' => now(),
                'approved_at'        => null,
            ]);
        });

        ActivityNotifier::staff(
            $office->id,
            'member_application',
            'New membership application',
            $member->first_name.' '.$member->last_name.' applied to join',
            "/members/{$member->id}",
        );

        return response()->json([
            'message' => 'Your application has been received. The office will review it, and you will be able to sign in once it is approved.',
            'data'    => ['id' => $member->id],
        ], 201);
    }

    /**
     * Refuses an email address already on the register.
     *
     * Compared case-insensitively and trimmed, because "A.Ragoo@example.com "
     * and "a.ragoo@example.com" are one mailbox and a plain unique: would let
     * the second one through.
     *
     * Soft-deleted members do not count, here and in the two rules below: the
     * default scope excludes them, which is what lets someone the office removed
     * apply again rather than being locked out by their own deleted record.
     */
    private function unusedEmail(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail): void {
            $normalised = mb_strtolower(trim((string) $value));

            if (Member::query()->whereRaw('LOWER(TRIM(email)) = ?', [$normalised])->exists()) {
                $fail('This email address is already registered. If it is yours, sign in instead, or contact the office.');
            }
        };
    }

    /**
     * Refuses a national ID already on the register.
     *
     * A national ID is the one field that identifies a person beyond doubt, so a
     * second application carrying one is either a duplicate or an impersonation
     * -- neither should quietly become a row.
     *
     * Compared in PHP on letters and digits, for the same reason MobileNumber
     * is: the column holds whatever was typed during the import, so spacing and
     * case vary, and any SQL comparison -- a LIKE on a fragment included -- can
     * be defeated by a space landing inside that fragment. A stored
     * "r12 0494 400012 a" contains neither "00012A" nor "R120494400012A".
     */
    private function unusedNationalId(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail): void {
            $normalised = $this->normaliseNationalId($value);

            if ($normalised === '') {
                return;
            }

            $clash = Member::query()
                ->whereNotNull('national_id')
                ->where('national_id', '!=', '')
                ->pluck('national_id')
                ->contains(fn ($stored) => $this->normaliseNationalId($stored) === $normalised);

            if ($clash) {
                $fail('This national ID is already registered. If it is yours, sign in instead, or contact the office.');
            }
        };
    }

    /** Letters and digits only, upper case: how two IDs are the same ID. */
    private function normaliseNationalId(mixed $value): string
    {
        return mb_strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $value));
    }

    /**
     * Configured intake office, or the lowest id when nothing is configured --
     * which is the right guess for a single-office installation and harmless for
     * a larger one, because staff reassign on approval anyway.
     */
    private function intakeOffice(): ?Office
    {
        $configured = config('members.signup.office_id');

        if ($configured !== null) {
            return Office::find($configured);
        }

        return Office::orderBy('id')->first();
    }
}
