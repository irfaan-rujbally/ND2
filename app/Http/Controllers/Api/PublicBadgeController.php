<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Lets a member fetch their own attendance badge without an account.
 *
 * This is the only endpoint in the application that answers without
 * authentication, so it is deliberately narrow.
 *
 * The QR token *is* the attendance credential: whoever holds a badge can be
 * recorded present as that member. It therefore cannot be handed out on a name
 * search -- anyone could then be counted as anyone, and, worse, could confirm
 * whether a named individual belongs to a political party, which is exactly the
 * kind of personal data that must not be enumerable by strangers.
 *
 * So the caller must produce two matching private facts, national ID and date
 * of birth. Both must belong to the same record, the reply never varies with
 * how nearly a guess missed, and the route is rate limited. That leaves brute
 * force as the only avenue, against a national ID that the attacker must
 * already know.
 */
class PublicBadgeController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'national_id'   => ['required', 'string', 'max:50'],
            'date_of_birth' => ['required', 'date'],
        ], [], [
            'national_id'   => 'National ID number',
            'date_of_birth' => 'date of birth',
        ]);

        // Records were typed in by hand over several years: spacing and case are
        // not consistent, so compare on a normalised form rather than verbatim.
        $nationalId = $this->normalise($validated['national_id']);

        $member = Member::query()
            ->whereNotNull('qr_token')
            ->whereDate('date_of_birth', $validated['date_of_birth'])
            ->get(['id', 'first_name', 'last_name', 'national_id', 'qr_token'])
            ->first(fn (Member $candidate) => $this->normalise($candidate->national_id) === $nationalId);

        /*
         * One message for every failure: a wrong ID, a wrong date, and a member
         * who simply is not registered must be indistinguishable, or the reply
         * itself confirms which national IDs exist.
         */
        if ($member === null) {
            return response()->json([
                'message' => 'No membership matches those details. Check the National ID number and date of birth, then try again.',
            ], 404);
        }

        // Only what the badge itself displays. No phone, address or email: this
        // response is readable by whoever passed the check, and nothing more
        // than the badge needs to leave the building.
        return response()->json([
            'data' => [
                'first_name' => $member->first_name,
                'last_name'  => $member->last_name,
                'qr_token'   => $member->qr_token,
            ],
        ]);
    }

    /** Upper case, with every space and separator removed. */
    private function normalise(?string $value): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $value));
    }
}
