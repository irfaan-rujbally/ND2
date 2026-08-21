<?php

namespace App\Models\Concerns;

use App\Models\Member;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * The author of a forum topic or comment: either a member writing in the portal,
 * or an administrator posting as the office.
 *
 * `author_type` holds the fully qualified class name, which is Eloquent's default
 * and looks less tidy than an alias like 'member'. That is on purpose: a morph
 * map would rewrite getMorphClass() for Member and User everywhere, and both
 * spatie/laravel-permission and laravel/sanctum already have class names stored
 * against those models. See AppServiceProvider for what that cost.
 */
trait BelongsToForumAuthor
{
    public const AUTHOR_MEMBER = Member::class;

    public const AUTHOR_USER = User::class;

    /**
     * Call from the model's `booted()`.
     *
     * Stamps the author from the session rather than accepting it from the
     * request: taking it from the client would let anyone post under someone
     * else's name. Both guards are Sanctum, so the same call answers for a
     * member token and a staff token -- what differs is which model comes back.
     *
     * Left alone when nothing is signed in, so seeders and console commands can
     * set it themselves.
     */
    protected static function bootForumAuthor(): void
    {
        static::creating(function (self $model) {
            $actor = auth('sanctum')->user();

            if ($actor instanceof Member) {
                $model->author_type = self::AUTHOR_MEMBER;
                $model->author_id = $actor->id;
            } elseif ($actor instanceof User) {
                $model->author_type = self::AUTHOR_USER;
                $model->author_id = $actor->id;
            }
        });

        /*
         * Write-once. Model::unguard() is global in this app, so without this an
         * update carrying an author could reassign a post to someone else.
         */
        static::updating(function (self $model) {
            foreach (['author_type', 'author_id'] as $column) {
                if ($model->isDirty($column) && filled($model->getOriginal($column))) {
                    $model->{$column} = $model->getOriginal($column);
                }
            }
        });
    }

    public function author(): MorphTo
    {
        return $this->morphTo('author');
    }

    /** True when this was written by the given member. */
    public function isWrittenBy(Member $member): bool
    {
        return $this->author_type === self::AUTHOR_MEMBER
            && (int) $this->author_id === (int) $member->id;
    }

    public function isByOffice(): bool
    {
        return $this->author_type === self::AUTHOR_USER;
    }

    /**
     * How the author is shown in the thread.
     *
     * A staff post is attributed to the office rather than to the individual
     * administrator: members are being addressed by the party, and naming the
     * clerk who typed it is both irrelevant to them and more than they need to
     * know. A deleted author leaves the post standing as "Former member" rather
     * than blank.
     */
    public function authorName(): string
    {
        $author = $this->author;

        if ($author === null) {
            return $this->isByOffice() ? 'Nouveaux Démocrates' : 'Former member';
        }

        if ($this->isByOffice()) {
            return 'Nouveaux Démocrates';
        }

        $name = trim(($author->first_name ?? '').' '.($author->last_name ?? ''));

        return $name !== '' ? $name : 'Member';
    }
}
