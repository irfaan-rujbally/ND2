<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Replies to a forum topic. Text, plus an optional image.
 *
 * No office_id: a comment belongs to a topic and inherits its office. Copying it
 * here would be a second source of truth that could disagree with the first.
 *
 * Soft deleted, so an author removing their own comment -- or an administrator
 * moderating one -- leaves the thread's history intact rather than punching a
 * hole in it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('forum_comments', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('topic_id');

            // Same polymorphic author as forum_topics; see that migration.
            $table->string('author_type');
            $table->integer('author_id');

            $table->text('body');

            $table->string('image_path')->nullable();
            $table->string('public_token', 64)->nullable()->unique();

            /*
             * Moderation as distinct from deletion -- see create_forum_topics_table
             * for the reasoning. An author deleting their own comment leaves
             * nothing behind; an administrator removing it leaves a tombstone so
             * the author is told rather than left guessing.
             */
            $table->dateTime('moderated_at')->nullable();
            $table->integer('moderated_by_user_id')->nullable();

            $table->dateTime('created_at')->nullable();
            $table->dateTime('updated_at')->nullable();
            $table->dateTime('deleted_at')->nullable();

            // Every read is "the comments of this topic, oldest first".
            $table->index(['topic_id', 'created_at']);
            $table->index(['author_type', 'author_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('forum_comments');
    }
};
