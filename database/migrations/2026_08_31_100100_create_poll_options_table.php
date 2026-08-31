<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The answers a member may pick from. Between two and ten per poll, enforced by
 * the request rules rather than the schema.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('poll_options', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('poll_id');

            $table->string('label', 255);

            /*
             * The order the office typed them in. Kept explicitly because the
             * ballot has to read the same way every time it is drawn -- ordering
             * by id would work today and stop working the first time an option
             * is edited.
             */
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            $table->index(['poll_id', 'position']);

            $table->foreign('poll_id')->references('id')->on('polls')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poll_options');
    }
};
