<?php

namespace App\Models;

use App\Models\Concerns\BelongsToForumAuthor;
use App\Models\Concerns\HasPublicImageToken;
use App\Models\Concerns\IsModeratable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A reply on a forum topic: text, plus an optional image.
 */
class ForumComment extends Model
{
    use BelongsToForumAuthor, HasFactory, HasPublicImageToken, IsModeratable, SoftDeletes;

    protected $table = 'forum_comments';

    protected $casts = [
        'moderated_at' => 'datetime',
        'created_at'   => 'datetime',
        'updated_at'   => 'datetime',
    ];

    protected static function booted(): void
    {
        static::bootPublicImageToken();
        static::bootForumAuthor();

        /*
         * Keep the parent topic's ordering key honest. Both directions matter:
         * posting a reply lifts the topic up the list, and removing the last one
         * should not leave it stranded at the top for ever.
         *
         * saveQuietly on the topic (see touchActivity) so this does not recurse
         * through the topic's own model events.
         */
        static::created(fn (self $comment) => $comment->topic?->touchActivity());
        static::deleted(fn (self $comment) => $comment->topic?->touchActivity());
    }

    public function topic(): BelongsTo
    {
        return $this->belongsTo(ForumTopic::class, 'topic_id');
    }

    public function imageUrl(): ?string
    {
        if (! $this->hasImage() || blank($this->public_token)) {
            return null;
        }

        return url("/api/public/forum/comments/{$this->public_token}/image?v={$this->imageVersion()}");
    }
}
