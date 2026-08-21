<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Lets users.account_id be null, so a staff account can be created at all.
 *
 * The column is a leftover of PingCRM, the demo application this project grew
 * out of, where every record hung off a tenant row in `accounts`. This app
 * tenants by office instead -- users.office_id -- and nothing reads account_id
 * any more: the only references left are ContactsController,
 * OrganizationsController and the old UsersController, none of which are
 * registered in any route, plus the original seeder.
 *
 * But it was declared NOT NULL with no default, so on a strict-mode MySQL the
 * insert behind "Create user" failed outright with "Field 'account_id' doesn't
 * have a default value". Nothing in the API sets it, and nothing should have to.
 *
 * Made nullable rather than dropped. Dropping it would also mean dropping the
 * `accounts` table and rewriting the three dead controllers and the seeder that
 * still name it -- a tidy-up worth doing deliberately, not as a side effect of
 * fixing a form. Nullable states the fact plainly: the application does not use
 * this.
 *
 * Uses the schema builder's change() rather than a raw ALTER. The first version
 * of this migration issued `ALTER TABLE users MODIFY ...`, which is MySQL-only
 * syntax -- and the test suite runs on in-memory SQLite, so every one of the 130
 * tests failed at the migration step. change() is Laravel 11 native and speaks
 * both.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'account_id')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->integer('account_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('users', 'account_id')) {
            return;
        }

        // Back-fill first, or restoring NOT NULL fails on any row created while
        // the column was nullable.
        DB::table('users')->whereNull('account_id')->update(['account_id' => 1]);

        Schema::table('users', function (Blueprint $table) {
            $table->integer('account_id')->nullable(false)->change();
        });
    }
};
