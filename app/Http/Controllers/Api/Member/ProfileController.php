<?php

namespace App\Http\Controllers\Api\Member;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Rules\MobileNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * A member's own record: what they may see of it, and what they may change.
 *
 * The member always comes from the token, never from the request, so there is no
 * id to tamper with and no way to address another member's row.
 *
 * The editable set is deliberately narrower than the admin form. Contact details
 * are the member's own business; office, constituency, membership status and the
 * QR token are the party's records about them and stay read-only here -- a member
 * must not be able to move themselves into another office's register or reissue
 * the badge they check in with.
 */
class ProfileController extends Controller
{
    /** Fields a member may change about themselves. */
    private const EDITABLE = [
        'first_name', 'last_name', 'email', 'phone', 'address',
        'date_of_birth', 'occupation', 'whatsapp_available',
        'communication_preferences', 'volunteer_interests',
    ];

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->payload($request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        $member = $request->user();

        $rules = [
            'first_name'    => ['sometimes', 'required', 'string', 'max:50'],
            'last_name'     => ['sometimes', 'required', 'string', 'max:50'],
            'email'         => ['sometimes', 'nullable', 'email', 'max:50'],
            // The member's own id is known here, so uniqueness can be checked
            // properly without their existing number counting against them.
            'phone'         => ['sometimes', 'nullable', new MobileNumber($member->id)],
            'address'       => ['sometimes', 'nullable', 'string', 'max:250'],
            'date_of_birth' => ['sometimes', 'nullable', 'date', 'before:today'],
            'occupation'    => ['sometimes', 'nullable', 'string', 'max:100'],
            'whatsapp_available'        => ['sometimes', 'boolean'],
            'communication_preferences' => ['sometimes', 'nullable', 'array'],
            'communication_preferences.*' => ['string', Rule::in(['Email', 'SMS', 'WhatsApp'])],
            'volunteer_interests'       => ['sometimes', 'nullable', 'array'],
            'volunteer_interests.*'     => ['string', 'max:100'],
        ];

        // Columns the register does not actually have yet are dropped rather than
        // rejected, so this keeps working as the schema fills out.
        $validated = collect($request->validate($rules))
            ->only(self::EDITABLE)
            ->filter(fn ($value, $key) => \Illuminate\Support\Facades\Schema::hasColumn('members', $key))
            ->all();

        $member->fill($validated)->save();

        return response()->json([
            'data'    => $this->payload($member->fresh()),
            'message' => 'Your details have been updated.',
        ]);
    }

    /**
     * Changing the password off its default. Requires the current one, so a
     * borrowed but unlocked phone cannot be used to take the account over.
     */
    public function updatePassword(Request $request): JsonResponse
    {
        $member = $request->user();

        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password'         => ['required', 'confirmed', Password::min(8)],
        ]);

        if ($member->password === null || ! Hash::check($validated['current_password'], $member->password)) {
            return response()->json([
                'message' => 'Your current password is not correct.',
                'errors'  => ['current_password' => ['Your current password is not correct.']],
            ], 422);
        }

        $member->forceFill([
            'password'        => $validated['password'],
            'password_set_at' => now(),
        ])->save();

        /*
         * Every other session is dropped: the default password is derivable by
         * anyone who knows the member's name and number, so if someone else got
         * in first, changing the password has to end their session too. The
         * current token is kept so the member is not signed out of their own app.
         */
        $current = $request->user()->currentAccessToken();
        $member->tokens()->where('id', '!=', $current->id)->delete();

        return response()->json(['message' => 'Your password has been changed.']);
    }

    private function payload(Member $member): array
    {
        return [
            'id'         => $member->id,
            'first_name' => $member->first_name,
            'last_name'  => $member->last_name,
            'name'       => $member->name,
            'email'      => $member->email,
            'phone'      => $member->phone,
            'address'    => $member->address,
            'date_of_birth' => $member->date_of_birth?->toDateString(),
            'occupation'    => $member->occupation,
            'whatsapp_available' => (bool) $member->whatsapp_available,
            'communication_preferences' => $member->communication_preferences,
            'volunteer_interests'       => $member->volunteer_interests,
            'constituency' => $member->constituency,
            'office_id'    => $member->office_id,
            // The badge the member downloads; read-only, and the reason the
            // portal guard exists.
            'qr_token'     => $member->qr_token,
            'must_change_password' => $member->password_set_at === null,
        ];
    }
}
