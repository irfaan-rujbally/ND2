<?php

use App\Models\Member;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Gives every existing member their starting password: last-name initial plus the
 * last seven digits of their phone number.
 *
 * Only rows that have no password are touched, so re-running this can never
 * overwrite a password a member has since chosen for themselves.
 *
 * 27 of the 508 members cannot have one built (no last name, or fewer than seven
 * digits of phone). They are left with a null password, which the login path
 * refuses outright -- see MemberAuthController. That is intentional: inventing a
 * short password for them would be worse than leaving them locked out, and an
 * administrator can set one from the member's page.
 *
 * password_set_at stays null for these, which is how the portal knows the member
 * is still on the default and should be prompted to change it.
 */
return new class extends Migration
{
    public function up(): void
    {
        $updated = 0;
        $skipped = 0;

        Member::withTrashed()
            ->whereNull('password')
            ->orderBy('id')
            ->select(['id', 'last_name', 'phone'])
            ->chunkById(200, function ($members) use (&$updated, &$skipped) {
                foreach ($members as $member) {
                    $default = $member->defaultPassword();

                    if ($default === null) {
                        $skipped++;

                        continue;
                    }

                    DB::table('members')
                        ->where('id', $member->id)
                        ->update(['password' => Hash::make($default)]);

                    $updated++;
                }
            });

        echo "  member default passwords set: {$updated}, skipped (no name or short phone): {$skipped}\n";
    }

    /**
     * Clears only passwords still sitting at their default, identified by
     * password_set_at being null. A member who has chosen their own password
     * keeps it.
     */
    public function down(): void
    {
        DB::table('members')
            ->whereNull('password_set_at')
            ->update(['password' => null]);
    }
};
