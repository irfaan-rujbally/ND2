<?php

namespace App\Models;

use App\Models\Concerns\BelongsToForumAuthor;
use App\Models\Concerns\HasPublicImageToken;
use App\Models\Concerns\IsModeratable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A forum discussion: a title, some text, an optional image, and the comments
 * underneath it.
 *
 * Started either by a member in the portal or by an administrator posting as the
 * office -- see BelongsToForumAuthor.
 */
class ForumTopic extends Model
{
    use BelongsToForumAuthor, HasFactory, HasPublicImageToken, IsModeratable, SoftDeletes;

    protected $table = 'forum_topics';

    protected $casts = [
        'last_activity_at' => 'datetime',
        'moderated_at'     => 'datetime',
        'created_at'       => 'datetime',
        'updated_at'       => 'datetime',
    ];

    protected static function booted(): void
    {
        static::bootPublicImageToken();
        static::bootForumAuthor();

        /*
         * A brand new topic has had activity -- itself. Without this the list,
         * which orders on last_activity_at, would sort every uncommented topic
         * below every commented one regardless of age.
         */
        static::creating(function (self $topic) {
            if (blank($topic->last_activity_at)) {
                $topic->last_activity_at = now();
            }
        });
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(ForumComment::class, 'topic_id');
    }

    /** Newest conversation first, which is not the same as newest topic. */
    public function scopeRecentFirst(Builder $query): Builder
    {
        return $query->orderByDesc('last_activity_at')->orderByDesc('id');
    }

    public function scopeForOffice(Builder $query, ?int $officeId): Builder
    {
        // A null office must match nothing rather than everything, or one
        // office's forum would leak to a member with no office recorded.
        return $officeId === null
            ? $query->whereRaw('1 = 0')
            : $query->where('forum_topics.office_id', $officeId);
    }

    public function scopeWrittenByMember(Builder $query, int $memberId): Builder
    {
        return $query
            ->where('author_type', self::AUTHOR_MEMBER)
            ->where('author_id', $memberId);
    }

    /** Called when a comment is added or removed. */
    public function touchActivity(): void
    {
        $this->forceFill(['last_activity_at' => now()])->saveQuietly();
    }

    public function imageUrl(): ?string
    {
        if (! $this->hasImage() || blank($this->public_token)) {
            return null;
        }

        return url("/api/public/forum/topics/{$this->public_token}/image?v={$this->imageVersion()}");
    }
}
