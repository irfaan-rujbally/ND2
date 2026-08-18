<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Back-fills a migration for a table that was created directly in the database
 * and never captured in version control.
 *
 * The column types deliberately mirror the live schema rather than Laravel's
 * modern defaults: signed `int` keys (not `bigint unsigned`) and `datetime`
 * timestamps (not `timestamp`). Changing them here would make a fresh install
 * diverge from the production database.
 *
 * On the existing database this migration is baselined - recorded as run without
 * executing - so it never touches live data.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Idempotent: this table predates version control, so it already exists on
        // any environment that was running the app before this migration was written.
        if (Schema::hasTable('offices')) {
            return;
        }

        Schema::create('offices', function (Blueprint $table) {
            $table->integer('id', true);
            $table->string('name')->nullable();
            $table->dateTime('created_at')->nullable();
            $table->dateTime('updated_at')->nullable();
            $table->dateTime('deleted_at')->nullable();
            $table->integer('created_by')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('offices');
    }
};
