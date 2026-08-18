<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Gives every member a stable, unguessable token so their QR badge can identify
 * them at a meeting door.
 *
 * A token rather than the member id on purpose: ids are sequential, so anyone
 * could print a badge for an arbitrary member. A token is also revocable - clear
 * the column and the old badge stops working.
 *
 * Existing members are back-filled here, so nobody has to be re-registered.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('members', 'qr_token')) {
            Schema::table('members', function (Blueprint $table) {
                $table->string('qr_token', 64)->nullable()->unique()->after('id');
            });
        }

        // Back-fill in chunks so a large register does not build one huge query.
        DB::table('members')
            ->whereNull('qr_token')
            ->orderBy('id')
            ->select('id')
            ->chunkById(200, function ($members) {
                foreach ($members as $member) {
                    DB::table('members')
                        ->where('id', $member->id)
                        ->update(['qr_token' => Str::random(32)]);
                }
            });
    }

    public function down(): void
    {
        if (Schema::hasColumn('members', 'qr_token')) {
            Schema::table('members', function (Blueprint $table) {
                $table->dropUnique(['qr_token']);
                $table->dropColumn('qr_token');
            });
        }
    }
};
