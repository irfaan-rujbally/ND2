<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One option a member picked. A single-choice poll produces one of these per
 * member; a multiple-choice poll produces one per box they ticked.
 *
 * No endpoint ever returns member_id and poll_option_id together -- that pairing
 * is what the ballot's confidentiality rests on. See the migration.
 */
class PollVote extends Model
{
    protected $table = 'poll_votes';

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function poll(): BelongsTo
    {
        return $this->belongsTo(Poll::class);
    }

    public function option(): BelongsTo
    {
        return $this->belongsTo(PollOption::class, 'poll_option_id');
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }
}
