<?php

namespace App\Http\Controllers\Api\Member;

use App\Http\Controllers\Controller;
use App\Models\Member;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Sign-in for the member portal.
 *
 * Members are not users. The token minted here carries exactly one ability,
 * Member::PORTAL_ABILITY, while every staff route requires the `staff` ability,
 * so a member token is rejected by the staff API even though Sanctum verifies
 * both. That is the whole isolation mechanism -- see routes/api.php.
 *
 * The identifier accepts an email address *or* a phone number. Email alone would
 * lock out most of the register while it is still being completed, and the
 * starting password is derived from the phone number anyway, so the phone is the
 * one credential a member is certain to know.
 */
class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'identifier'  => ['required', 'string', 'max:255'],
            'password'    => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:255'],
        ], [], [
            'identifier' => 'email address or phone number',
        ]);

        $this->ensureIsNotRateLimited($request);

        $matches = $this->findByIdentifier($credentials['identifier']);

        /*
         * Two different people share one email address in the live register
         * (#375 and #384), and phone numbers are shared by families. Signing in
         * whichever record happened to come back first would hand one member
         * another member's profile, so an ambiguous identifier is refused and the
         * member is pointed at the office. Deliberately not resolved by asking
         * for a name, which would confirm who holds that address.
         */
        if ($matches->count() > 1) {
            RateLimiter::hit($this->throttleKey($request));

            throw ValidationException::withMessages([
                'identifier' => 'More than one membership uses those details. Please contact the office so your record can be separated.',
            ]);
        }

        $member = $matches->first();

        /*
         * A null password is not a password. Members whose phone number is too
         * short to build the default from have null here, and Hash::check
         * against null would raise rather than simply fail, so it is checked
         * first. The failure message never distinguishes the cases.
         */
        if ($member === null || $member->password === null || ! Hash::check($credentials['password'], $member->password)) {
            RateLimiter::hit($this->throttleKey($request));

            throw ValidationException::withMessages([
                'identifier' => __('auth.failed'),
            ]);
        }

        RateLimiter::clear($this->throttleKey($request));

        $member->forceFill(['last_login_at' => now()])->saveQuietly();

        $token = $member->createToken(
            $credentials['device_name'] ?? 'member-portal',
            [Member::PORTAL_ABILITY],
        )->plainTextToken;

        return response()->json([
            'token'  => $token,
            'member' => $this->payload($member),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['member' => $this->payload($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    /**
     * Matches on email, or on phone compared by digits only: the register stores
     * numbers as "+230 5712 3456", "230-57123456" and "57123456" for what is the
     * same line, so a verbatim comparison would miss most of them. The last seven
     * digits are the part that survives every format.
     */
    private function findByIdentifier(string $identifier)
    {
        $identifier = trim($identifier);

        if (str_contains($identifier, '@')) {
            return Member::query()
                ->whereRaw('LOWER(email) = ?', [Str::lower($identifier)])
                ->get();
        }

        $digits = preg_replace('/\D/', '', $identifier);

        if (strlen($digits) < 7) {
            return Member::query()->whereRaw('1 = 0')->get();
        }

        $tail = substr($digits, -7);

        return Member::query()
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->where('phone', 'like', '%'.$tail)
            ->get()
            ->filter(fn (Member $m) => str_ends_with(preg_replace('/\D/', '', (string) $m->phone), $tail))
            ->values();
    }

    /**
     * Only the member's own identity. No roles, no permissions, no office
     * authority: there is nothing in the portal for those to unlock.
     */
    private function payload(Member $member): array
    {
        return [
            'id'                 => $member->id,
            'first_name'         => $member->first_name,
            'last_name'          => $member->last_name,
            'name'               => $member->name,
            'email'              => $member->email,
            'must_change_password' => $member->password_set_at === null,
        ];
    }

    private function ensureIsNotRateLimited(Request $request): void
    {
        if (! RateLimiter::tooManyAttempts($this->throttleKey($request), 5)) {
            return;
        }

        throw ValidationException::withMessages([
            'identifier' => trans('auth.throttle', [
                'seconds' => $seconds = RateLimiter::availableIn($this->throttleKey($request)),
                'minutes' => ceil($seconds / 60),
            ]),
        ]);
    }

    private function throttleKey(Request $request): string
    {
        return 'member-login|'.Str::lower((string) $request->input('identifier')).'|'.$request->ip();
    }
}
