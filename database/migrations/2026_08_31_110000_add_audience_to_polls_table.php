<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who a poll is put to.
 *
 * 'office' is every approved member of the poll's office; 'selected' is the list
 * in poll_member. Stored rather than inferred from whether that table has rows,
 * because the two states have to be distinguishable: a restricted poll whose
 * list somehow ends up empty must be a poll nobody can answer, not one suddenly
 * open to the whole register.
 *
 * A string rather than a database enum, per the house rule -- widening the set
 * later should not need an ALTER on a table this size.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('polls', function (Blueprint $table) {
            $table->string('audience', 20)->default('office')->after('allows_multiple');
        });
    }

    public function down(): void
    {
        Schema::table('polls', function (Blueprint $table) {
            $table->dropColumn('audience');
        });
    }
};
