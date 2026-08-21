<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Announcements: a titled notice with a body and an optional image, which an
 * administrator can then email to a chosen set of members.
 *
 * The column types deliberately match the rest of the schema -- integer ids and
 * dateTime timestamps -- rather than Laravel's modern defaults. members.id and
 * offices.id are int(11), so a bigInteger foreign key here could not reference
 * them. See create_offices_table for the history.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('announcements', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('office_id')->nullable();

            $table->string('title');
            $table->text('description')->nullable();

            /*
             * Path on the private `local` disk. Never public/: the file is
             * served by AnnouncementImageController so there is one URL that
             * works both in the app and inside an email.
             */
            $table->string('image_path')->nullable();

            /*
             * Unguessable id used by that public image URL. An emailed image has
             * to load without a bearer token, and mail clients send no
             * credentials -- so the token is what stands in for authentication,
             * exactly as members.qr_token does for the public badge.
             */
            $table->string('public_token', 64)->nullable()->unique();

            // The user who wrote it, for the "created by" line on the list.
            $table->integer('created_by')->nullable();

            $table->dateTime('created_at')->nullable();
            $table->dateTime('updated_at')->nullable();
            $table->dateTime('deleted_at')->nullable();

            $table->index('office_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcements');
    }
};
