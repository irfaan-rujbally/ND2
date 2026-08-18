<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class MeetingHasMember extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'meeting_has_member';

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }

    public function meeting(): BelongsTo
    {
        return $this->belongsTo(Meeting::class);
    }
}
