<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Back-fills a migration for the members table, mirroring the live schema.
 * See create_offices_table for why the column types look non-idiomatic.
 *
 * `attendance` is a denormalised percentage the old dashboard used to write on
 * every page load. Nothing reads it any more - the API computes attendance from
 * the pivot - but the column is kept so the migration matches production.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('members', function (Blueprint $table) {
            $table->integer('id', true);
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('phone')->nullable();
            $table->string('age')->nullable();
            $table->integer('constituency')->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->dateTime('created_at')->nullable();
            $table->dateTime('updated_at')->nullable();
            $table->dateTime('deleted_at')->nullable();
            $table->integer('created_by')->nullable();
            $table->integer('updated_by')->nullable();
            $table->integer('deleted_by')->nullable();
            $table->integer('office_id')->nullable();
            $table->string('attendance')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('members');
    }
};
