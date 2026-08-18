<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The attendance pivot had no uniqueness guard, so the same member could be
 * attached to a meeting more than once, inflating attendance percentages.
 *
 * This soft deletes the surplus rows, keeping the lowest id of each
 * (meeting_id, member_id) pair. Nothing is physically removed, so the change
 * is reversible.
 *
 * Note: MySQL/MariaDB cannot express a unique index that ignores soft deleted
 * rows, so uniqueness is enforced in the application layer
 * (AttendanceController::store uses a guarded attach).
 */
return new class extends Migration
{
    public function up(): void
    {
        $keepIds = DB::table('meeting_has_member')
            ->whereNull('deleted_at')
            ->selectRaw('MIN(id) as id')
            ->groupBy('meeting_id', 'member_id')
            ->pluck('id');

        DB::table('meeting_has_member')
            ->whereNull('deleted_at')
            ->whereNotIn('id', $keepIds)
            ->update([
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        // Restoring every soft deleted row would also resurrect genuine
        // detachments made after this migration ran, so this is intentionally
        // a no-op. The surplus rows remain in the table with deleted_at set.
    }
};
