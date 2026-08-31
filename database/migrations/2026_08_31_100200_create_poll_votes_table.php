<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per option a member picked: one row for a single-choice poll, several
 * for a multiple-choice one.
 *
 * member_id is stored, and it has to be -- it is the only thing that stops a
 * member voting twice and the only way to say who has not answered yet. What
 * makes the ballot confidential is that nothing reads this column and the option
 * column together: the results endpoint returns tallies, and the participation
 * endpoint returns names, and no endpoint joins the two. See PollTally.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('poll_votes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('poll_id');
            $table->unsignedBigInteger('poll_option_id');
            $table->integer('member_id');

            $table->timestamps();

            /*
             * The one-vote-per-option guarantee, in the database rather than in
             * a check-then-insert. Two taps on a slow connection race, and the
             * application-level check would let both through.
             *
             * Single choice is the same constraint plus a rule: the controller
             * clears the member's previous rows before writing the new ones, so a
             * single-choice poll can never accumulate a second option.
             */
            $table->unique(['poll_id', 'member_id', 'poll_option_id'], 'poll_votes_member_option_unique');

            // Serves the tally, which counts votes grouped by option.
            $table->index(['poll_id', 'poll_option_id']);

            $table->foreign('poll_id')->references('id')->on('polls')->cascadeOnDelete();
            $table->foreign('poll_option_id')->references('id')->on('poll_options')->cascadeOnDelete();
            $table->foreign('member_id')->references('id')->on('members')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poll_votes');
    }
};
