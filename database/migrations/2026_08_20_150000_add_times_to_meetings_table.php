<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When a meeting starts and ends, alongside the day it falls on.
 *
 * Kept as two TIME columns rather than folded into `date`: every existing row
 * has a date and no time, so widening `date` to a datetime would either invent a
 * midnight start for 500-odd historic meetings or force the whole app to
 * distinguish "no time recorded" from "starts at 00:00" anyway. Nullable for the
 * same reason -- the meetings imported before this existed have no times, and
 * the screens show a date alone where that is all there is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('meetings', function (Blueprint $table) {
            if (! Schema::hasColumn('meetings', 'start_time')) {
                $table->time('start_time')->nullable()->after('date');
            }

            if (! Schema::hasColumn('meetings', 'end_time')) {
                $table->time('end_time')->nullable()->after('start_time');
            }
        });
    }

    public function down(): void
    {
        Schema::table('meetings', function (Blueprint $table) {
            $table->dropColumn(['start_time', 'end_time']);
        });
    }
};
