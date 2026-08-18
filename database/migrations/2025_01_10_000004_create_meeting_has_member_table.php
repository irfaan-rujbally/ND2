<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Back-fills a migration for the attendance pivot, mirroring the live schema.
 * See create_offices_table for why the column types look non-idiomatic.
 *
 * Note the absence of a unique index on (meeting_id, member_id). The pivot is
 * soft deleted, and MySQL/MariaDB cannot express a unique index that ignores
 * soft deleted rows, so uniqueness is enforced in the application layer instead
 * (see App\Rest\Actions\AttachMemberToMeetingAction). Adding one here would also
 * break against the 39 archived duplicate rows already in production.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('meeting_has_member', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('meeting_id')->nullable();
            $table->integer('member_id')->nullable();
            $table->dateTime('created_at')->nullable();
            $table->dateTime('updated_at')->nullable();
            $table->dateTime('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meeting_has_member');
    }
};
