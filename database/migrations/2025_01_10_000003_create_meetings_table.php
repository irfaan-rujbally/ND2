<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Back-fills a migration for the meetings table, mirroring the live schema.
 * See create_offices_table for why the column types look non-idiomatic.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Idempotent: this table predates version control, so it already exists on
        // any environment that was running the app before this migration was written.
        if (Schema::hasTable('meetings')) {
            return;
        }

        Schema::create('meetings', function (Blueprint $table) {
            $table->integer('id', true);
            $table->string('title')->nullable();
            $table->integer('office_id')->nullable();
            $table->date('date')->nullable();
            $table->string('topic')->nullable();
            $table->string('attachment_path')->nullable();
            $table->dateTime('created_at')->nullable();
            $table->dateTime('updated_at')->nullable();
            $table->dateTime('deleted_at')->nullable();
            $table->integer('created_by')->nullable();
            $table->integer('updated_by')->nullable();
            $table->integer('deleted_by')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meetings');
    }
};
