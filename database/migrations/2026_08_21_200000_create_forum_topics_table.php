<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Forum topics: a member (or an administrator posting as the office) starts a
 * discussion, and other members reply underneath.
 *
 * Tenanted by office like everything else here, so a member only ever sees the
 * topics of their own office.
 *
 * Column types match the rest of the schema -- integer ids, dateTime timestamps
 * -- because members.id, users.id and offices.id are all int(11) and a
 * bigInteger key here could not reference them. See create_offices_table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('forum_topics', function (Blueprint $table) {
            $table->integer('id', true);
            $table->integer('office_id');

            /*
             * Polymorphic author, because both kinds of account may post: a
             * member writing in the portal, or an administrator posting as the
             * office. Two nullable columns (member_id / user_id) would express
             * the same thing but leave every read branching on which one is set.
             *
             * author_type holds the fully qualified class name, Eloquent's
             * default. An alias like 'member' would read better, but a morph map
             * rewrites getMorphClass() for Member and User everywhere and both
             * spatie/laravel-permission and laravel/sanctum already store class
             * names against them -- see AppServiceProvider.
             */
            $table->string('author_type');
            $table->integer('author_id');

            $table->string('title', 150);
            $table->text('description')->nullable();

            // Path on the private disk; served by token, never from public/.
            $table->string('image_path')->nullable();
            $table->string('public_token', 64)->nullable()->unique();

            /*
             * Bumped whenever a comment is posted, so the list can be ordered by
             * the conversation that moved most recently rather than by the topic
             * that happened to be created last. Denormalised on purpose: the
             * alternative is a max() subquery on every list request.
             */
            $table->dateTime('last_activity_at')->nullable();

            /*
             * Moderation, which is deliberately NOT the same as deletion.
             *
             *   deleted_at        the author removed their own topic. Gone; nobody
             *                     sees it again.
             *   moderated_at      an administrator removed it. The row stays and
             *                     the thread shows a tombstone in its place, so
             *                     the author finds out what happened instead of
             *                     watching their topic silently disappear.
             *
             * Two columns rather than one status, because a moderated topic can
             * still afterwards be deleted outright and the order matters.
             */
            $table->dateTime('moderated_at')->nullable();
            $table->integer('moderated_by_user_id')->nullable();

            $table->dateTime('created_at')->nullable();
            $table->dateTime('updated_at')->nullable();
            $table->dateTime('deleted_at')->nullable();

            $table->index('office_id');
            // Serves "my topics", which is the author filter plus a sort.
            $table->index(['author_type', 'author_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('forum_topics');
    }
};
