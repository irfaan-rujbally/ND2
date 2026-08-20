<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Gives every meeting its own token so it can be shown as a QR code that members
 * scan to check themselves in.
 *
 * Mirrors members.qr_token: a random token rather than the meeting id, because
 * ids are sequential and anyone could then forge the code for another meeting.
 *
 * Note this token is NOT a secret -- it gets projected on a wall or printed on a
 * poster, so whoever is in the room has it. It only names which meeting is being
 * checked into; proving *who* is checking in is the member's login.
 *
 * Existing meetings are back-filled so old records can also be shown as a QR.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('meetings', 'qr_token')) {
            Schema::table('meetings', function (Blueprint $table) {
                $table->string('qr_token', 64)->nullable()->unique()->after('id');
            });
        }

        DB::table('meetings')
            ->whereNull('qr_token')
            ->orderBy('id')
            ->select('id')
            ->chunkById(200, function ($meetings) {
                foreach ($meetings as $meeting) {
                    DB::table('meetings')
                        ->where('id', $meeting->id)
                        ->update(['qr_token' => Str::random(32)]);
                }
            });
    }

    public function down(): void
    {
        if (Schema::hasColumn('meetings', 'qr_token')) {
            Schema::table('meetings', function (Blueprint $table) {
                $table->dropUnique(['qr_token']);
                $table->dropColumn('qr_token');
            });
        }
    }
};
