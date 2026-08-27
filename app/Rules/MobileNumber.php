<?php

namespace App\Rules;

use App\Models\Member;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * A member's mobile number: exactly eight digits, and not already used by
 * another member.
 *
 * Format and uniqueness are one rule rather than two because both have to work
 * on the same normalised value. The register holds numbers written as
 * "+230 5252 8555" and "52528555" for the same line, so a plain
 * `unique:members,phone` would compare the strings verbatim and let a duplicate
 * straight through. Everything here is compared on digits only.
 *
 * Eight digits with no separators, no country code: that is what a Mauritian
 * mobile is, and every number currently on file is stored that way.
 *
 * Uniqueness compares the *last eight* digits, so a stored "+230 5712 3456" and
 * a submitted "57123456" are recognised as one line. Anything less strict lets
 * the same phone hold two memberships purely because one of them was written
 * with its country code.
 *
 * The number also matters beyond contact: a member may sign in with it, and the
 * starting password is derived from it. A number shared by two members would let
 * either of them reach the other's sign-in, which is why uniqueness is enforced
 * here and not left as advice.
 */
class MobileNumber implements ValidationRule
{
    /**
     * @param  int|null  $ignoreMemberId    The member being edited, whose own
     *                                      number must not count as a clash.
     * @param  bool      $checkUniqueness   Off where the caller cannot say which
     *                                      record is being written, so the rule
     *                                      would flag a member's own number as a
     *                                      clash with itself. Matches how
     *                                      UserResource applies unique:users on
     *                                      create only.
     */
    public function __construct(
        private ?int $ignoreMemberId = null,
        private bool $checkUniqueness = true,
    ) {
    }

    /** Format only: eight digits, no separators. */
    public static function formatOnly(): self
    {
        return new self(null, false);
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $digits = preg_replace('/\D/', '', (string) $value);

        // Anything other than digits is rejected outright rather than silently
        // stripped: a member who typed a letter should be told, not corrected.
        if ((string) $value !== $digits) {
            $fail('The mobile number must contain digits only, with no spaces or symbols.');

            return;
        }

        if (strlen($digits) !== 8) {
            $fail('The mobile number must be exactly 8 digits.');

            return;
        }

        if (! $this->checkUniqueness) {
            return;
        }

        /*
         * Compared entirely in PHP, on digits.
         *
         * This used to narrow in SQL first, with `where('phone', 'like', '%' .
         * last seven digits)`. That silently defeated the rule for exactly the
         * numbers it exists to catch: a stored "+230 5712 3456" does not *end*
         * with "7123456", so the LIKE matched nothing and the digit comparison
         * below never ran -- a duplicate written in another format went straight
         * through, which is the one case the whole rule is for.
         *
         * The register is a few hundred rows and this runs on member writes and
         * on the public application, neither a hot path, so reading the column
         * and comparing properly is the right trade. Do not reintroduce a LIKE
         * here unless the column itself is normalised first.
         */
        $clash = Member::query()
            ->when($this->ignoreMemberId !== null, fn ($q) => $q->whereKeyNot($this->ignoreMemberId))
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->pluck('phone')
            ->contains(fn ($stored) => self::lastEightDigits($stored) === $digits);

        if ($clash) {
            $fail('This mobile number is already registered to another member.');
        }
    }

    /**
     * The subscriber number: digits only, last eight.
     *
     * Last eight rather than the whole digit string, because a country code is a
     * way of writing a number and not part of it -- "+230 5712 3456" is eleven
     * digits and "57123456" is eight, and comparing them whole would call one
     * phone two.
     *
     * A stored value with fewer than eight digits comes back whole and simply
     * never matches, which is correct: the submitted value is already known to
     * be exactly eight by the checks above.
     */
    private static function lastEightDigits(mixed $value): string
    {
        return substr((string) preg_replace('/\D/', '', (string) $value), -8);
    }
}
