<?php

namespace App\Models\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Removal by an administrator, as opposed to removal by the author.
 *
 * The distinction is the whole point. When a member deletes their own post it is
 * soft deleted and nobody sees it again -- they know what they did. When an
 * administrator removes someone else's post the row stays and is marked
 * moderated, so the thread shows a tombstone in its place and the author is told
 * what happened rather than finding their words quietly gone.
 *
 * Content is never scrubbed from the database. The tombstone hides it from
 * members; an administrator can still read what they removed, which is what
 * makes a moderation decision reviewable.
 *
 * Requires nullable `moderated_at` and `moderated_by_user_id` columns.
 */
trait IsModeratable
{
    public function moderatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'moderated_by_user_id');
    }

    public function isModerated(): bool
    {
        return $this->moderated_at !== null;
    }

    /**
     * Marks this as removed by an administrator.
     *
     * Idempotent: a second call leaves the original moderator and timestamp
     * alone, so re-running it cannot rewrite who made the decision.
     */
    public function moderate(User $user): void
    {
        if ($this->isModerated()) {
            return;
        }

        $this->forceFill([
            'moderated_at'         => now(),
            'moderated_by_user_id' => $user->id,
        ])->save();
    }

    /** Puts a moderated post back, e.g. after an appeal. */
    public function unmoderate(): void
    {
        $this->forceFill([
            'moderated_at'         => null,
            'moderated_by_user_id' => null,
        ])->save();
    }

    public function scopeModerated(Builder $query): Builder
    {
        return $query->whereNotNull('moderated_at');
    }

    public function scopeNotModerated(Builder $query): Builder
    {
        return $query->whereNull('moderated_at');
    }
}
