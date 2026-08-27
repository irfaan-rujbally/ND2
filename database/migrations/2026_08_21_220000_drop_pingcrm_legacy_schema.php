<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drops what is left of PingCRM, the Laravel demo application this project grew
 * out of.
 *
 * Three tables and three columns, none of which the application has read since
 * the rewrite to a REST API and a React front end:
 *
 *   accounts        PingCRM's tenant row. This app tenants by office instead, so
 *                   there was exactly one row in it, named "Acme Corporation".
 *   organizations   the demo CRM's companies -- 100 Faker rows.
 *   contacts        the demo CRM's people -- 100 Faker rows. Not members; the
 *                   member register is the `members` table.
 *
 *   users.account_id   the tenant key, replaced by users.office_id.
 *   users.owner        a flag no policy ever consulted. Access is decided by the
 *                      spatie/laravel-permission `admin` role and same-office
 *                      scoping.
 *   users.photo_path   an avatar path, written only by the deleted UsersController
 *                      and served only by the deleted Glide route at /img.
 *
 * Every step is guarded, so this is safe on an installation that never had them
 * and safe to run twice. The `up` is destructive and the `down` cannot bring the
 * rows back -- it restores the shape, empty, which is all a rollback can honestly
 * promise once the tables are gone.
 */
return new class extends Migration
{
    public function up(): void
    {
        /*
         * account_id carried an index, and the index has to go first.
         *
         * MySQL drops a column's indexes along with the column; SQLite does not,
         * and leaves the index pointing at a column that no longer exists -- which
         * fails the very next statement with "error in index
         * users_account_id_index after drop column". The suite runs on SQLite, so
         * this is not a hypothetical.
         */
        if (Schema::hasIndex('users', 'users_account_id_index')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropIndex('users_account_id_index');
            });
        }

        Schema::table('users', function (Blueprint $table) {
            foreach (['account_id', 'owner', 'photo_path'] as $column) {
                if (Schema::hasColumn('users', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        // Child before parent: contacts references organizations.
        Schema::dropIfExists('contacts');
        Schema::dropIfExists('organizations');
        Schema::dropIfExists('accounts');
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'account_id')) {
                $table->integer('account_id')->nullable()->index();
            }
            if (! Schema::hasColumn('users', 'owner')) {
                $table->boolean('owner')->default(false);
            }
            if (! Schema::hasColumn('users', 'photo_path')) {
                $table->string('photo_path', 100)->nullable();
            }
        });

        if (! Schema::hasTable('accounts')) {
            Schema::create('accounts', function (Blueprint $table) {
                $table->increments('id');
                $table->string('name', 50);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('organizations')) {
            Schema::create('organizations', function (Blueprint $table) {
                $table->increments('id');
                $table->integer('account_id')->index();
                $table->string('name', 100);
                $table->string('email', 50)->nullable();
                $table->string('phone', 50)->nullable();
                $table->string('address', 150)->nullable();
                $table->string('city', 50)->nullable();
                $table->string('region', 50)->nullable();
                $table->string('country', 2)->nullable();
                $table->string('postal_code', 25)->nullable();
                $table->softDeletes();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('contacts')) {
            Schema::create('contacts', function (Blueprint $table) {
                $table->increments('id');
                $table->integer('account_id')->index();
                $table->integer('organization_id')->nullable()->index();
                $table->string('first_name', 25);
                $table->string('last_name', 25);
                $table->string('email', 50)->nullable();
                $table->string('phone', 50)->nullable();
                $table->string('address', 150)->nullable();
                $table->string('city', 50)->nullable();
                $table->string('region', 50)->nullable();
                $table->string('country', 2)->nullable();
                $table->string('postal_code', 25)->nullable();
                $table->softDeletes();
                $table->timestamps();
            });
        }
    }
};
