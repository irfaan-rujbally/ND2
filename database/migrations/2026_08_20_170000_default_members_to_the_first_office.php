<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives every member an office.
 *
 * 64 members were imported without one, and an office is not optional in
 * practice: every staff read is scoped to the caller's office, so a member
 * without one was invisible in the members list, absent from the export, and
 * uncounted in the attendance percentage the member portal shows them. They were
 * still recorded present at meetings, which is how a meeting came to report one
 * more participant on the dashboard than it would list when opened.
 *
 * Office 1 is the default because it is the only office these records could
 * sensibly belong to -- the app has run as a single office since the import.
 * Staff can move any of them afterwards from the member's own form.
 *
 * Guarded rather than assumed: on an installation whose first office was
 * renumbered, the lowest existing office id is used instead, and if there is no
 * office at all the migration does nothing rather than writing a broken key.
 */
return new class extends Migration
{
    public function up(): void
    {
        $officeId = DB::table('offices')->where('id', 1)->exists()
            ? 1
            : DB::table('offices')->min('id');

        if ($officeId === null) {
            return;
        }

        DB::table('members')->whereNull('office_id')->update(['office_id' => $officeId]);
    }

    /**
     * Not reversible: which members had no office is not recorded anywhere, and
     * guessing would strip the office off members who always had one.
     */
    public function down(): void
    {
        //
    }
};
