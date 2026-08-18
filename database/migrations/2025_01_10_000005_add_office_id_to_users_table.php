<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `users.office_id` was added straight to the database and never migrated. It is
 * what tenants the whole application: every REST resource scopes its queries to
 * the caller's office, so a fresh install is unusable without it.
 *
 * Placed last of the back-filled migrations so `offices` already exists.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->integer('office_id')->nullable()->after('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('office_id');
        });
    }
};
