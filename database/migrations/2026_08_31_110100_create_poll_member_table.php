<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The members invited to answer a restricted poll.
 *
 * Only read when polls.audience is 'selected'; an office-wide poll leaves this
 * empty rather than listing five hundred rows that say nothing.
 *
 * This is the electorate, not the turnout -- being here means a member MAY vote,
 * and says nothing about whether they have. That lives in poll_votes, and the
 * two are never joined on the option column. See PollTally.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('poll_member', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('poll_id');
            // members.id is a signed INT; the foreign key has to match.
            $table->integer('member_id');

            $table->timestamps();

            // One invitation per member. Adding somebody already on the list is
            // then a no-op in the database rather than a duplicated ballot.
            $table->unique(['poll_id', 'member_id'], 'poll_member_unique');

            $table->foreign('poll_id')->references('id')->on('polls')->cascadeOnDelete();
            $table->foreign('member_id')->references('id')->on('members')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poll_member');
    }
};
