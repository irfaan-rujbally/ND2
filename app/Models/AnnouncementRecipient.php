<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The record of one announcement email to one member.
 *
 * Not soft deleted, unlike most of this schema: the point of the row is that the
 * mail went out, and that cannot be undone. Removing it would let the same
 * member be mailed the same announcement twice with nothing to show for it.
 */
class AnnouncementRecipient extends Model
{
    protected $table = 'announcement_recipients';

    protected $casts = [
        'sent_at' => 'datetime',
    ];

    public function announcement(): BelongsTo
    {
        return $this->belongsTo(Announcement::class);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }

    public function wasDelivered(): bool
    {
        return $this->sent_at !== null;
    }
}
