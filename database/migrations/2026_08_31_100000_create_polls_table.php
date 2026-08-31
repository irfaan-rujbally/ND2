<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A question the office puts to its members, with a fixed list of answers.
 *
 * There is no `status` column. A poll is open unless it has been closed by hand
 * (`closed_at`) or has run past its deadline (`closes_at`), and deriving that
 * from the two timestamps is what stops a scheduled close needing a worker to
 * flip a string: the poll shuts itself the moment the clock passes, whether or
 * not anything is running. See Poll::isOpen().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('polls', function (Blueprint $table) {
            $table->id();
            // offices.id and members.id are signed INTs while users.id is an
            // unsigned INT; the foreign keys have to match, not default to BIGINT.
            $table->integer('office_id');
            $table->unsignedInteger('created_by')->nullable();

            $table->string('title', 150);
            $table->text('description')->nullable();

            /*
             * Single choice or several. Fixed when the poll is created and
             * refused afterwards by PollsController::update -- flipping a
             * multiple-choice poll to single would leave members holding more
             * answers than the poll now allows, and there is no honest way to
             * decide which of them to throw away.
             */
            $table->boolean('allows_multiple')->default(false);

            // The optional deadline, and the moment a member of staff closed it.
            $table->dateTime('closes_at')->nullable();
            $table->dateTime('closed_at')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['office_id', 'created_at']);

            $table->foreign('office_id')->references('id')->on('offices')->cascadeOnUpdate()->restrictOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('polls');
    }
};
