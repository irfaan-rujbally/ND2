<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gives members their own password so they can sign in to the member portal.
 *
 * Deliberately NOT a row in `users`. That table carries staff roles, office_id
 * and every Lomkit policy check; putting 508 members in it would place them
 * inside the staff authorisation surface. Members authenticate against their own
 * table with ability-scoped tokens instead -- see MemberAuthController.
 *
 * Nullable because nobody has one yet: a member claims their account through the
 * set-password flow. A null password must never authenticate, so the login path
 * checks for it explicitly rather than relying on Hash::check to fail.
 *
 * No unique index on `email`: the live register has one address shared by two
 * different people (#375 and #384), and 415 members have no address at all.
 * Uniqueness is therefore enforced at login, which refuses to sign anyone in on
 * an ambiguous address rather than picking a record.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('members', function (Blueprint $table) {
            if (! Schema::hasColumn('members', 'password')) {
                $table->string('password')->nullable()->after('email');
            }

            if (! Schema::hasColumn('members', 'password_set_at')) {
                $table->dateTime('password_set_at')->nullable()->after('password');
            }

            if (! Schema::hasColumn('members', 'last_login_at')) {
                $table->dateTime('last_login_at')->nullable()->after('password_set_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('members', function (Blueprint $table) {
            foreach (['password', 'password_set_at', 'last_login_at'] as $column) {
                if (Schema::hasColumn('members', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
