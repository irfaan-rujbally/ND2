<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per member an announcement was emailed to.
 *
 * Without this table a send has no visible outcome: the screen could only say
 * "sent" and an administrator would have no way to tell whether the second
 * attempt after a failure doubled up on anyone. It also makes a partial failure
 * legible -- one bad address does not invalidate the other 400 sends, so each
 * result is recorded on its own row.
 *
 * `email` is copied rather than joined: it is the address the mail actually went
 * to, and a member who later changes their address must not rewrite history.
 *
 * The unique index over (announcement_id, member_id) is what makes re-sending
 * idempotent -- see SendAnnouncementToMembersAction. Unlike meeting_has_member
 * these rows are not soft deleted, so the index is safe to declare here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('announcement_recipients', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('announcement_id');
            $table->integer('member_id');

            $table->string('email');

            // Null until the mailer accepts it; set on success.
            $table->dateTime('sent_at')->nullable();

            // The transport error, kept verbatim so a bounce can be diagnosed.
            $table->text('error')->nullable();

            $table->dateTime('created_at')->nullable();
            $table->dateTime('updated_at')->nullable();

            $table->unique(['announcement_id', 'member_id'], 'announcement_recipients_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcement_recipients');
    }
};
